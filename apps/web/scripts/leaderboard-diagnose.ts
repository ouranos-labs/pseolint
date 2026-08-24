/**
 * Read-only diagnostic: why is a public site missing from /leaderboard?
 *
 * The leaderboard applies EIGHT gates plus a hidden-claim filter, so "public"
 * and "listed" are very different populations. This walks the funnel and prints
 * how many rows each gate removes, then names the hosts that are public but
 * unlisted, with the reason.
 *
 *   DATABASE_URL=... bun run apps/web/scripts/leaderboard-diagnose.ts
 *
 * Touches nothing: SELECTs only. Uses postgres-js directly so it is not bound
 * by the `server-only` guard on the app's db/index.ts, matching the house
 * pattern in backfill-audit-hosts.ts.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

// Keep in step with @/lib/leaderboard. Imported as literals rather than from
// the module so this script stays runnable without the app's path aliases.
const RISK_MAX = 40;
const MIN_PAGES = 5;

const sql = postgres(DATABASE_URL, { prepare: false, idle_timeout: 20 });

function row(label: string, n: number | string, note = "") {
  console.log(`${String(n).padStart(6)}  ${label}${note ? `   ${note}` : ""}`);
}

async function main() {
  console.log("\n=== Funnel: audits.is_public = true -> listed ===\n");

  const [{ count: publicTotal }] = await sql<{ count: number }[]>`
    select count(*)::int as count from audit where is_public = true`;
  row("audits with is_public = true", publicTotal);

  const [{ count: publicHosts }] = await sql<{ count: number }[]>`
    select count(distinct host)::int as count
    from audit where is_public = true and host is not null and length(host) > 0`;
  row("distinct hosts among those", publicHosts, "<- what you probably mean by 'public websites'");

  console.log("\n--- rows removed by each gate (public rows only) ---\n");
  const gates: Array<[string, ReturnType<typeof sql>]> = [
    ["status <> 'completed'", sql`select count(*)::int as count from audit where is_public = true and status <> 'completed'`],
    ["risk IS NULL", sql`select count(*)::int as count from audit where is_public = true and status = 'completed' and risk is null`],
    [`risk >= ${RISK_MAX}`, sql`select count(*)::int as count from audit where is_public = true and status = 'completed' and risk >= ${RISK_MAX}`],
    ["host NULL or empty", sql`select count(*)::int as count from audit where is_public = true and status = 'completed' and (host is null or length(host) = 0)`],
    ["EXPIRED (expires_at <= now)", sql`select count(*)::int as count from audit where is_public = true and status = 'completed' and expires_at <= now()`],
    [`page_count < ${MIN_PAGES} or NULL`, sql`select count(*)::int as count from audit where is_public = true and status = 'completed' and (page_count is null or page_count < ${MIN_PAGES})`],
  ];
  for (const [label, q] of gates) {
    const [{ count }] = (await q) as unknown as { count: number }[];
    row(label, count);
  }

  // The actual listing query, mirrored.
  const listed = await sql<{ host: string; risk: number; page_count: number }[]>`
    select distinct on (host) host, risk, page_count
    from audit
    where is_public = true and status = 'completed'
      and risk is not null and risk < ${RISK_MAX}
      and host is not null and length(host) > 0
      and expires_at > now()
      and page_count >= ${MIN_PAGES}
    order by host, created_at desc
    limit 100`;

  const [{ count: hidden }] = await sql<{ count: number }[]>`
    select count(*)::int as count from leaderboard_claim where is_hidden = true`;

  console.log("");
  row("hosts the SQL would list", listed.length);
  row("owner-hidden claims", hidden, "<- subtracted in JS after the query");

  // Public hosts that never make it. This is the list worth reading.
  const missing = await sql<{
    host: string; risk: number | null; page_count: number | null;
    status: string; expired: boolean; created_at: Date;
  }[]>`
    select distinct on (host) host, risk, page_count, status,
           (expires_at <= now()) as expired, created_at
    from audit
    where is_public = true and host is not null and length(host) > 0
      and host not in (
        select distinct host from audit
        where is_public = true and status = 'completed'
          and risk is not null and risk < ${RISK_MAX}
          and host is not null and length(host) > 0
          and expires_at > now() and page_count >= ${MIN_PAGES}
      )
    order by host, created_at desc`;

  console.log(`\n=== Public hosts that are NOT listed (${missing.length}) ===\n`);
  for (const m of missing) {
    const why: string[] = [];
    if (m.status !== "completed") why.push(`status=${m.status}`);
    if (m.risk === null) why.push("risk=null");
    else if (m.risk >= RISK_MAX) why.push(`risk=${m.risk} (>= ${RISK_MAX})`);
    if (m.page_count === null) why.push("pageCount=null");
    else if (m.page_count < MIN_PAGES) why.push(`pageCount=${m.page_count} (< ${MIN_PAGES})`);
    if (m.expired) why.push("EXPIRED");
    console.log(`  ${m.host.padEnd(38)} ${why.join(", ") || "(latest row fails, older may differ)"}`);
  }

  // Sites showing a STALE score: a newer audit exists that would fail the bar,
  // but DISTINCT ON runs AFTER the WHERE, so the older passing row is served.
  const stale = await sql<{ host: string; listed_risk: number; newest_risk: number | null; newest_at: Date }[]>`
    with listed as (
      select distinct on (host) host, risk as listed_risk, created_at as listed_at
      from audit
      where is_public = true and status = 'completed'
        and risk is not null and risk < ${RISK_MAX}
        and host is not null and length(host) > 0
        and expires_at > now() and page_count >= ${MIN_PAGES}
      order by host, created_at desc
    ),
    newest as (
      select distinct on (host) host, risk as newest_risk, created_at as newest_at
      from audit
      where is_public = true and status = 'completed' and host is not null
      order by host, created_at desc
    )
    select l.host, l.listed_risk, n.newest_risk, n.newest_at
    from listed l join newest n using (host)
    where n.newest_at > l.listed_at`;

  console.log(`\n=== Listed at a STALE score (${stale.length}) ===`);
  console.log("A newer audit exists but fails the bar. DISTINCT ON runs after the");
  console.log("WHERE, so the older passing row is what gets served.\n");
  for (const s of stale) {
    console.log(`  ${s.host.padEnd(38)} shows ${s.listed_risk}, newest is ${s.newest_risk ?? "null"} (${s.newest_at.toISOString().slice(0, 10)})`);
  }

  console.log("\n=== Monitored domains (site-level flag) ===\n");
  const [{ count: domTotal }] = await sql<{ count: number }[]>`
    select count(*)::int as count from monitored_domain where removed_at is null`;
  row("active monitored domains", domTotal);
  // is_public on monitored_domain only exists after migration 0023.
  try {
    const [{ count: domPublic }] = await sql<{ count: number }[]>`
      select count(*)::int as count from monitored_domain where removed_at is null and is_public = true`;
    row("with is_public = true", domPublic);
  } catch {
    console.log("        monitored_domain.is_public absent: migration 0023 not applied yet.");
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
