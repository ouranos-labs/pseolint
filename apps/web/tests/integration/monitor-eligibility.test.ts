/**
 * The monitoring cron's eligibility predicate, against a real Postgres.
 *
 * This is the oldest and most consequential ownership gate in the app: every
 * recurring crawl, alert email and Slack ping flows from `selectDueDomains`, so
 * an unverified domain slipping into its result set means pseolint crawls a site
 * on a schedule for someone who never proved they control it.
 *
 * A mocked db cannot cover this — the whole assertion is that a set of SQL
 * predicates compose correctly, which only a real database can answer. Gated on
 * RUN_DB_INTEGRATION_TESTS=1 like the other DB-backed suites; `bun run lint`
 * still typechecks it so signature drift on `selectDueDomains` is caught in CI.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, users } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { selectDueDomains } from "@/lib/monitoring";
import { RUN_DB_INTEGRATION } from "../util/db-integration";

/** Generous limit so unrelated due rows in the test DB can't crowd ours out. */
const LIMIT = 5000;

describe.skipIf(!RUN_DB_INTEGRATION)("selectDueDomains ownership gate", () => {
  let userId: string;

  const seed = async (
    host: string,
    over: Partial<typeof monitoredDomains.$inferInsert> = {},
  ): Promise<string> => {
    const [row] = await db
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
  };

  /** Ids from this run only — the shared DB holds other users' rows. */
  const dueIds = async (): Promise<Set<string>> => {
    const rows = await selectDueDomains(LIMIT);
    return new Set(rows.filter((r) => r.userId === userId).map((r) => r.id));
  };

  beforeEach(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
      emailVerified: false,
    });
  });

  afterEach(async () => {
    // monitored_domain cascades on users.id.
    await db.delete(users).where(eq(users.id, userId));
  });

  it("includes a verified, due domain", async () => {
    const id = await seed("verified.test");
    expect(await dueIds()).toContain(id);
  });

  it("excludes an unverified domain", async () => {
    const id = await seed("unverified.test", { verifiedAt: null });
    expect(await dueIds()).not.toContain(id);
  });

  it("excludes an unverified domain even when everything else is eligible", async () => {
    // The failure mode worth guarding: a row indistinguishable from a healthy
    // one except for the missing proof.
    const verified = await seed("both-a.test");
    const unverified = await seed("both-b.test", { verifiedAt: null });
    const due = await dueIds();
    expect(due).toContain(verified);
    expect(due).not.toContain(unverified);
    expect(due.size).toBe(1);
  });

  it("excludes a paused domain", async () => {
    const id = await seed("paused.test", { paused: true });
    expect(await dueIds()).not.toContain(id);
  });

  it("excludes a soft-removed domain", async () => {
    const id = await seed("removed.test", { removedAt: new Date() });
    expect(await dueIds()).not.toContain(id);
  });

  it("excludes a domain that is not due yet", async () => {
    const id = await seed("future.test", { nextRunAt: new Date(Date.now() + 3600_000) });
    expect(await dueIds()).not.toContain(id);
  });

  it("picks the domain up as soon as verification lands", async () => {
    // The activation path: verifyDomainAction / autoVerifyDomains stamp
    // verifiedAt, and the next tick must see the domain with no other change.
    const id = await seed("late-verify.test", { verifiedAt: null });
    expect(await dueIds()).not.toContain(id);

    await db
      .update(monitoredDomains)
      .set({ verifiedAt: new Date() })
      .where(eq(monitoredDomains.id, id));

    expect(await dueIds()).toContain(id);
  });

  it("honours the limit argument", async () => {
    await seed("limit-a.test");
    await seed("limit-b.test");
    const rows = await selectDueDomains(1);
    expect(rows).toHaveLength(1);
  });
});
