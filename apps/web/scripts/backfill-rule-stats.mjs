/**
 * One-shot backfill of audit_rule_stat from the R2 report blobs that still
 * exist. Idempotent (onConflictDoNothing on audit_id+rule_id), so it can be
 * re-run safely; blobs already expired are simply skipped.
 *
 *   bun run scripts/backfill-rule-stats.mjs [--limit N] [--dry]
 */
import postgres from "postgres";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }),
);
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;
const DRY = process.argv.includes("--dry");

const RANK = { info: 1, warning: 2, error: 3, critical: 4 };
function collect(summary) {
  const issues = summary?.issues;
  if (!issues || typeof issues !== "object") return [];
  const byRule = new Map();
  for (const bucket of Object.values(issues)) {
    if (!Array.isArray(bucket)) continue;
    for (const f of bucket) {
      const ruleId = f?.ruleId;
      if (typeof ruleId !== "string" || !ruleId) continue;
      const sev = RANK[f?.severity] ? f.severity : "info";
      const seen = byRule.get(ruleId);
      if (!seen) byRule.set(ruleId, { ruleId, severity: sev, findingCount: 1 });
      else { seen.findingCount++; if (RANK[sev] > RANK[seen.severity]) seen.severity = sev; }
    }
  }
  return [...byRule.values()];
}

const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1 });
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const rows = await sql`
  select a.id, a.storage_key, a.page_count from audit a
  where a.status = 'completed' and a.storage_key is not null
    and not exists (select 1 from audit_rule_stat s where s.audit_id = a.id)
  order by a.completed_at desc ${LIMIT ? sql`limit ${LIMIT}` : sql``}`;
console.log(`audits to backfill: ${rows.length}${DRY ? " (dry run)" : ""}`);

let done = 0, gone = 0, empty = 0, inserted = 0;
for (const r of rows) {
  let body;
  try {
    const o = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: r.storage_key }));
    body = await o.Body.transformToString();
  } catch { gone++; continue; }
  let stats = [];
  try { stats = collect(JSON.parse(body)); } catch { gone++; continue; }
  if (stats.length === 0) { empty++; continue; }
  if (!DRY) {
    await sql`insert into audit_rule_stat ${sql(stats.map((s) => ({
      audit_id: r.id, rule_id: s.ruleId, severity: s.severity,
      finding_count: s.findingCount, page_count: r.page_count ?? 0,
    })))} on conflict (audit_id, rule_id) do nothing`;
  }
  inserted += stats.length; done++;
  if (done % 50 === 0) console.log(`  ${done}/${rows.length} audits, ${inserted} rows`);
}
console.log(`\ndone: ${done} audits -> ${inserted} rule rows | blob gone: ${gone} | no findings: ${empty}`);
await sql.end();
