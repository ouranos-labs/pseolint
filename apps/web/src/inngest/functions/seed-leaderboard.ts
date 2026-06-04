import { and, eq, isNotNull, desc } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits, seedStats } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { executeAuditInProcess } from "@/inngest/functions/run-audit";
import { LEADERBOARD_RISK_MAX, median } from "@/lib/leaderboard";
import { SEED_SITES } from "@/data/seed-sites";
import { auditLog } from "@/lib/audit-log";

/** Failing seeds expire fast; clean seeds get extended to permanent at completion (Plan 1). */
const SEED_EXPIRY_DAYS = 7;
/** Sample budget per seed audit — matches the free-tier ceiling. */
const SEED_SAMPLE_SIZE = 100;

/**
 * Seeds the leaderboard by running real audits on the curated SEED_SITES list.
 * Triggered manually via `inngest.send({ name: "seed/leaderboard.requested" })`
 * (see scripts/seed-leaderboard.ts). Per host: supersede the prior seed row,
 * insert a fresh public source="seed" audit, run it in-process. Finally recompute
 * the seed_stats singleton.
 */
export const seedLeaderboard = inngest.createFunction(
  { id: "seed-leaderboard", retries: 1, concurrency: { limit: 4 } },
  { event: "seed/leaderboard.requested" },
  async ({ step }) => {
    for (const site of SEED_SITES) {
      const url = `https://${site.host}`;
      await step.run(`seed-${site.host}`, async () => {
        // Supersede any prior seed row for this URL so we keep one live entry
        // per host: expire it now (expire-reports cleans its storage, and the
        // most-recent-per-host leaderboard query stops showing it).
        await db
          .update(audits)
          .set({ expiresAt: new Date() })
          .where(and(eq(audits.source, "seed"), eq(audits.sourceUrl, url)));

        const [row] = await db
          .insert(audits)
          .values({
            slug: publicSlug(),
            userId: null,
            anonSessionId: null,
            sourceUrl: url,
            status: "queued",
            isPublic: true,
            source: "seed",
            expiresAt: new Date(Date.now() + SEED_EXPIRY_DAYS * 86_400_000),
          })
          .returning({ id: audits.id });

        await executeAuditInProcess({
          auditId: row.id,
          url,
          plan: "free",
          sampleSize: SEED_SAMPLE_SIZE,
        });
        return { host: site.host, auditId: row.id };
      });
    }

    await step.run("recompute-seed-stats", async () => {
      // Most-recent completed seed audit per host (DISTINCT ON needs host-first order).
      const rows = await db
        .selectDistinctOn([audits.host], { host: audits.host, risk: audits.risk })
        .from(audits)
        .where(
          and(
            eq(audits.source, "seed"),
            eq(audits.status, "completed"),
            isNotNull(audits.host),
            isNotNull(audits.risk),
          ),
        )
        .orderBy(audits.host, desc(audits.createdAt));

      const risks = rows.map((r) => r.risk!).filter((r): r is number => r != null);
      const auditedCount = risks.length;
      const passedCount = risks.filter((r) => r < LEADERBOARD_RISK_MAX).length;
      const med = median(risks);
      const computedAt = new Date();

      await db
        .insert(seedStats)
        .values({
          id: "singleton",
          auditedCount,
          passedCount,
          medianRisk: med == null ? null : Math.round(med),
          computedAt,
        })
        .onConflictDoUpdate({
          target: seedStats.id,
          set: {
            auditedCount,
            passedCount,
            medianRisk: med == null ? null : Math.round(med),
            computedAt,
          },
        });

      auditLog("seed.stats.recomputed", { auditedCount, passedCount, medianRisk: med });
      return { auditedCount, passedCount };
    });
  },
);
