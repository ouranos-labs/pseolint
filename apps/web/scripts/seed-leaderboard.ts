/**
 * Manually trigger a leaderboard seeding pass:
 *   npx tsx apps/web/scripts/seed-leaderboard.ts
 * Sends the Inngest event the seed-leaderboard function listens for. Requires
 * INNGEST_EVENT_KEY in env (and the Inngest dev server running locally, or
 * production credentials).
 */
import { inngest } from "../src/lib/inngest";

async function main() {
  await inngest.send({ name: "seed/leaderboard.requested", data: {} });
  console.log("Sent seed/leaderboard.requested: watch the Inngest dashboard for progress.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
