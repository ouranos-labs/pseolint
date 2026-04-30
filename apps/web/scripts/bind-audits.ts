/**
 * Bind anon-or-orphan audit records for one source URL to a specific user.
 *
 * Use case: a public-leaderboard audit was run against pseolint.dev (or any
 * other domain) anonymously, and we want to claim those audit rows for a
 * known user account so they show up in that user's dashboard / can be
 * extended to the 90-day signed-in retention window.
 *
 * Usage:
 *   cd apps/web
 *   bun run scripts/bind-audits.ts --user <USER_ID> --source <URL> [--dry-run]
 *
 * Examples:
 *   # Preview which rows would be bound (no writes)
 *   bun run scripts/bind-audits.ts \
 *     --user s2VmmiKTzhPqvbxV9ahY47xMtqAEXS04 \
 *     --source https://pseolint.dev \
 *     --dry-run
 *
 *   # Bind all matching audits to the user
 *   bun run scripts/bind-audits.ts \
 *     --user s2VmmiKTzhPqvbxV9ahY47xMtqAEXS04 \
 *     --source https://pseolint.dev
 *
 * Safety: requires the user to exist (FK enforced), only matches rows where
 * userId IS NULL (won't steal another user's audits), prints every row it
 * touches for auditability. Defaults to a 90-day expires_at extension to
 * keep claimed audits aligned with the signed-in retention window.
 */

import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits, users } from "@/db/schema";

interface Args {
  userId: string;
  sources: string[];
  dryRun: boolean;
  retentionDays: number;
}

function parseArgs(argv: string[]): Args {
  let userId = "";
  let source = "";
  let dryRun = false;
  let retentionDays = 90;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--user") { userId = next; i++; }
    else if (flag === "--source") { source = next; i++; }
    else if (flag === "--retention-days") { retentionDays = Number(next); i++; }
    else if (flag === "--dry-run") { dryRun = true; }
    else if (flag === "--help" || flag === "-h") { printHelpAndExit(0); }
  }
  if (!userId || !source) {
    console.error("Missing required --user and/or --source flags.\n");
    printHelpAndExit(1);
  }
  // Match http://, https://, and trailing-slash variants. Avoids false positives
  // on subpaths (we only normalize at the origin level).
  const trimmed = source.replace(/\/+$/, "");
  let url: URL;
  try { url = new URL(trimmed); }
  catch { console.error(`Invalid --source URL: ${source}`); process.exit(1); }
  const origin = `${url.protocol}//${url.host}`;
  const sources = [origin, `${origin}/`];
  if (origin.startsWith("https://")) sources.push(origin.replace("https://", "http://"));
  return { userId, sources, dryRun, retentionDays };
}

function printHelpAndExit(code: number): never {
  console.log(`Usage: bun run scripts/bind-audits.ts --user <USER_ID> --source <URL> [--dry-run] [--retention-days N]`);
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [user] = await db.select({ id: users.id, email: users.email })
    .from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user) {
    console.error(`User ${args.userId} not found in users table — refusing to bind.`);
    process.exit(2);
  }
  console.log(`Target user: ${user.email} (${user.id})`);
  console.log(`Source URLs to match: ${args.sources.join(", ")}`);

  const matches = await db.select({
    id: audits.id,
    slug: audits.slug,
    sourceUrl: audits.sourceUrl,
    userId: audits.userId,
    status: audits.status,
    risk: audits.risk,
    completedAt: audits.completedAt,
    expiresAt: audits.expiresAt,
  }).from(audits)
    .where(and(inArray(audits.sourceUrl, args.sources), isNull(audits.userId)));

  if (matches.length === 0) {
    console.log(`No unbound audits found for ${args.sources[0]}. Nothing to do.`);
    return;
  }
  console.log(`\nFound ${matches.length} unbound audit row${matches.length === 1 ? "" : "s"}:`);
  for (const r of matches) {
    console.log(`  ${r.slug}  status=${r.status}  risk=${r.risk ?? "-"}  completed=${r.completedAt?.toISOString() ?? "-"}  expires=${r.expiresAt.toISOString()}`);
  }

  if (args.dryRun) {
    console.log(`\n[dry-run] Would set userId=${args.userId}, anonSessionId=NULL, expiresAt=GREATEST(now+${args.retentionDays}d, current).`);
    console.log("Re-run without --dry-run to apply.");
    return;
  }

  // GREATEST so we never SHORTEN the retention window — protects audits that
  // were already extended past the default 90-day signed-in lifetime.
  const updated = await db.update(audits)
    .set({
      userId: args.userId,
      anonSessionId: null,
      expiresAt: sql`GREATEST(${audits.expiresAt}, NOW() + (${args.retentionDays} || ' days')::interval)`,
    })
    .where(and(
      inArray(audits.sourceUrl, args.sources),
      isNull(audits.userId),
    ))
    .returning({ id: audits.id, slug: audits.slug, expiresAt: audits.expiresAt });

  console.log(`\nBound ${updated.length} row${updated.length === 1 ? "" : "s"}:`);
  for (const r of updated) {
    console.log(`  ${r.slug}  newExpiresAt=${r.expiresAt.toISOString()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("bind-audits failed:", err);
    process.exit(1);
  });
