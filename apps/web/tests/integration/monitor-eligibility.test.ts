/**
 * The monitoring cron's eligibility predicate, against a real Postgres.
 *
 * This is the oldest and most consequential ownership gate in the app: every
 * recurring crawl, alert email and Slack ping flows from `selectDueDomains`, so an
 * unverified domain slipping into its result set means pseolint crawls a site on a
 * schedule for someone who never proved they control it. A mocked db cannot cover
 * it: the whole assertion is that a set of SQL predicates compose correctly, which
 * only a real database can answer.
 *
 * SAFETY: every case runs inside a transaction that is always rolled back, so the
 * suite is safe to point at a live database. Nothing commits, which matters for two
 * reasons beyond tidiness: the fixtures are verified-and-due by construction, so a
 * committed row would be eligible for the hourly monitoring cron to actually crawl;
 * and a crash mid-test could otherwise strand fake users in a customer database.
 * Reads are filtered to the run's own userId.
 *
 * Gated on RUN_DB_INTEGRATION_TESTS=1 like the other DB-backed suites; `bun run
 * lint` still typechecks it so signature drift on `selectDueDomains` is caught.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, users } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { selectDueDomains } from "@/lib/monitoring";
import { RUN_DB_INTEGRATION } from "../util/db-integration";

/** Generous limit so unrelated due rows in a shared database can't crowd ours out. */
const LIMIT = 5000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sentinel that unwinds the transaction without failing the test. */
const ROLLBACK = Symbol("rollback");

/**
 * Runs `fn` in a transaction and always rolls back. Drizzle rolls back when the
 * callback throws, so we throw a sentinel and swallow only that.
 */
async function withRollback(fn: (tx: Tx, userId: string) => Promise<void>): Promise<void> {
  const userId = `test_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        name: userId,
        email: `${userId}@example.test`,
        emailVerified: false,
      });
      await fn(tx, userId);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

async function seed(
  tx: Tx,
  userId: string,
  host: string,
  over: Partial<typeof monitoredDomains.$inferInsert> = {},
): Promise<string> {
  const [row] = await tx
    .insert(monitoredDomains)
    .values({
      slug: publicSlug(),
      userId,
      sourceUrl: `https://${host}`,
      host,
      // nextRunAt defaults to now(), so a bare row is already due.
      verifiedAt: new Date(),
      ...over,
    })
    .returning({ id: monitoredDomains.id });
  return row.id;
}

/** Ids the predicate returns for this run only: a shared DB holds other rows. */
async function dueIds(tx: Tx, userId: string): Promise<Set<string>> {
  const rows = await selectDueDomains(LIMIT, tx);
  return new Set(rows.filter((r) => r.userId === userId).map((r) => r.id));
}

describe.skipIf(!RUN_DB_INTEGRATION)("selectDueDomains ownership gate", () => {
  it("includes a verified, due domain", async () => {
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "verified.test");
      expect(await dueIds(tx, userId)).toContain(id);
    });
  });

  it("excludes an unverified domain", async () => {
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "unverified.test", { verifiedAt: null });
      expect(await dueIds(tx, userId)).not.toContain(id);
    });
  });

  it("excludes an unverified domain even when everything else is eligible", async () => {
    // The failure mode worth guarding: two rows indistinguishable except for proof.
    await withRollback(async (tx, userId) => {
      const verified = await seed(tx, userId, "both-a.test");
      const unverified = await seed(tx, userId, "both-b.test", { verifiedAt: null });
      const due = await dueIds(tx, userId);
      expect(due).toContain(verified);
      expect(due).not.toContain(unverified);
      expect(due.size).toBe(1);
    });
  });

  it("excludes a paused domain", async () => {
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "paused.test", { paused: true });
      expect(await dueIds(tx, userId)).not.toContain(id);
    });
  });

  it("excludes a soft-removed domain", async () => {
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "removed.test", { removedAt: new Date() });
      expect(await dueIds(tx, userId)).not.toContain(id);
    });
  });

  it("excludes a domain that is not due yet", async () => {
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "future.test", {
        nextRunAt: new Date(Date.now() + 3_600_000),
      });
      expect(await dueIds(tx, userId)).not.toContain(id);
    });
  });

  it("picks the domain up as soon as verification lands", async () => {
    // The activation path: verifyDomainAction / autoVerifyDomains stamp verifiedAt,
    // and the next tick must see the domain with no other change.
    await withRollback(async (tx, userId) => {
      const id = await seed(tx, userId, "late-verify.test", { verifiedAt: null });
      expect(await dueIds(tx, userId)).not.toContain(id);

      await tx
        .update(monitoredDomains)
        .set({ verifiedAt: new Date() })
        .where(eq(monitoredDomains.id, id));

      expect(await dueIds(tx, userId)).toContain(id);
    });
  });

  it("honours the limit argument", async () => {
    await withRollback(async (tx, userId) => {
      await seed(tx, userId, "limit-a.test");
      await seed(tx, userId, "limit-b.test");
      const rows = await selectDueDomains(1, tx);
      expect(rows).toHaveLength(1);
    });
  });

  it("leaves nothing committed", async () => {
    // Proves the safety property the rest of the suite relies on.
    let seededUserId = "";
    await withRollback(async (tx, userId) => {
      seededUserId = userId;
      await seed(tx, userId, "rollback-proof.test");
    });
    const leaked = await db.select().from(users).where(eq(users.id, seededUserId));
    expect(leaked).toHaveLength(0);
  });
});
