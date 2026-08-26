/**
 * Ownership scoping on every destructive dashboard action, against a real
 * Postgres.
 *
 * Each of these actions deletes, revokes or soft-deletes a row, and each is
 * guarded only by a `where(... eq(table.userId, session.user.id))` clause. That
 * clause is the entire tenant boundary: drop it and any signed-in user can
 * delete another user's domain, audit or upload token by guessing an id. The
 * actions return `{ ok: true }` on a no-op, so a broken predicate is invisible
 * from the return value; the assertion has to be on the database.
 *
 * Shape of every case: seed a row owned by user A, run the action AS user B,
 * assert A's row is untouched, then run it as A and assert it took effect. The
 * second half matters as much as the first, since a predicate that matches
 * nothing would pass the attacker check trivially.
 *
 * SAFETY: every case runs in a transaction that is always rolled back. See
 * tests/util/action-db.ts. Gated on RUN_DB_INTEGRATION_TESTS=1 like the other
 * DB-backed suites; `bun run lint` still typechecks it, so signature drift on
 * any action is caught even when the suite is skipped.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { RUN_DB_INTEGRATION } from "../util/db-integration";

// ---------------------------------------------------------------------------
// Mocks. Only the boundaries: the database is real.
// ---------------------------------------------------------------------------

const H = vi.hoisted(() => ({ currentUserId: null as string | null }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const { makeDbProxy } = await import("../util/db-proxy");
  return { ...actual, db: makeDbProxy(actual.db) };
});

vi.mock("@/lib/session", () => {
  const get = async () => {
    if (!H.currentUserId) return null;
    return { user: { id: H.currentUserId, email: `${H.currentUserId}@example.test` } };
  };
  const required = async () => {
    const s = await get();
    if (!s) throw new Error("Unauthorized");
    return s;
  };
  return { getOptionalSession: get, requireSession: required, getRequiredSession: required };
});

vi.mock("@/lib/plan", () => ({ getPlan: async () => "pro" as const }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn() }));
// deleteAuditAction deletes the R2 object before the row; the row removal is
// the source of truth and object storage is not what this suite is asserting.
vi.mock("@/lib/r2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/r2")>()),
  deleteReport: vi.fn(async () => undefined),
}));

/** redirect() throws NEXT_REDIRECT in production; a sentinel keeps that shape. */
const REDIRECT = new Error("NEXT_REDIRECT");
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn(() => {
    throw REDIRECT;
  }),
}));

// Imported after the mocks so the actions bind the proxied db.
const { withRollback } = await import("../util/action-db");
const { monitoredDomains, audits, uploadTokens, findingsState, watchedPages, users, userAiKeys } =
  await import("@/db/schema");
const { removeDomainAction } = await import("@/app/dashboard/domain-actions");
const { removeMonitoredDomain, togglePauseMonitoredDomain } = await import(
  "@/app/dashboard/actions"
);
const { deleteAuditAction } = await import("@/app/dashboard/audit-actions");
const { revokeToken } = await import("@/app/dashboard/settings/tokens/actions");
const { snoozeFinding, dismissFinding } = await import("@/app/dashboard/_actions/findings");
const { removeAiKeyAction } = await import("@/app/dashboard/settings/ai-key/actions");
const { deleteAccountAction } = await import("@/app/dashboard/settings/actions");

type Tx = import("../util/action-db").Tx;

/** Acts as the given user for the duration of `fn`. */
async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  H.currentUserId = userId;
  try {
    return await fn();
  } finally {
    H.currentUserId = null;
  }
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${seq++}`;

async function seedDomain(tx: Tx, userId: string, over = {}): Promise<{ id: string; host: string }> {
  const host = `d${uniq()}.test`;
  const [row] = await tx
    .insert(monitoredDomains)
    .values({
      slug: `s_${uniq()}`,
      userId,
      sourceUrl: `https://${host}`,
      host,
      verifiedAt: new Date(),
      ...over,
    })
    .returning({ id: monitoredDomains.id, host: monitoredDomains.host });
  return row;
}

async function seedAudit(tx: Tx, userId: string): Promise<{ id: string; slug: string }> {
  const slug = `a_${uniq()}`;
  const [row] = await tx
    .insert(audits)
    .values({
      slug,
      userId,
      sourceUrl: "https://audit.test",
      status: "completed",
      // notNull with no default: the retention tier is stamped at creation.
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    })
    .returning({ id: audits.id, slug: audits.slug });
  return row;
}

describe.skipIf(!RUN_DB_INTEGRATION)("destructive dashboard actions scope by owner", () => {
  beforeEach(() => {
    H.currentUserId = null;
  });

  describe("removeDomainAction", () => {
    it("refuses to soft-delete another user's domain", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const dom = await seedDomain(tx, owner);

        const res = await as(attacker, () => removeDomainAction(dom.host));
        expect(res).toEqual({ ok: false, error: "not found" });

        const [after] = await tx
          .select({ removedAt: monitoredDomains.removedAt })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(after.removedAt).toBeNull();
      });
    });

    it("soft-deletes the owner's domain and clears its watched pages", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const dom = await seedDomain(tx, owner);
        await tx.insert(watchedPages).values({
          monitoredDomainId: dom.id,
          url: `https://${dom.host}/pinned`,
          addedByUserId: owner,
        });

        expect(await as(owner, () => removeDomainAction(dom.host))).toEqual({ ok: true });

        const [after] = await tx
          .select({ removedAt: monitoredDomains.removedAt })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        // Soft delete: the row survives, stamped.
        expect(after.removedAt).toBeInstanceOf(Date);

        // The soft delete means the FK cascade never fires, so the action has
        // to drop watched pages itself or a re-add resurrects stale URLs.
        const left = await tx
          .select({ id: watchedPages.id })
          .from(watchedPages)
          .where(eq(watchedPages.monitoredDomainId, dom.id));
        expect(left).toEqual([]);
      });
    });
  });

  describe("removeMonitoredDomain", () => {
    it("refuses to hard-delete another user's domain", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const dom = await seedDomain(tx, owner);

        // Returns ok:true even on a no-op, so only the database can tell us.
        await as(attacker, () => removeMonitoredDomain(dom.id));

        const rows = await tx
          .select({ id: monitoredDomains.id })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(rows).toHaveLength(1);
      });
    });

    it("hard-deletes the owner's domain", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const dom = await seedDomain(tx, owner);
        await as(owner, () => removeMonitoredDomain(dom.id));

        const rows = await tx
          .select({ id: monitoredDomains.id })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(rows).toEqual([]);
      });
    });
  });

  describe("togglePauseMonitoredDomain", () => {
    it("refuses to pause another user's domain", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const dom = await seedDomain(tx, owner, { paused: false });

        const res = await as(attacker, () => togglePauseMonitoredDomain(dom.id));
        expect(res).toEqual({ ok: false, error: "Not found" });

        const [after] = await tx
          .select({ paused: monitoredDomains.paused })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(after.paused).toBe(false);
      });
    });

    it("flips the owner's pause flag", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const dom = await seedDomain(tx, owner, { paused: false });

        expect(await as(owner, () => togglePauseMonitoredDomain(dom.id))).toEqual({ ok: true });
        const [paused] = await tx
          .select({ paused: monitoredDomains.paused })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(paused.paused).toBe(true);

        // Toggling is the same call, so the round trip has to land back at false.
        await as(owner, () => togglePauseMonitoredDomain(dom.id));
        const [resumed] = await tx
          .select({ paused: monitoredDomains.paused })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(resumed.paused).toBe(false);
      });
    });
  });

  describe("deleteAuditAction", () => {
    it("refuses to delete another user's audit", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const audit = await seedAudit(tx, owner);

        const res = await as(attacker, () => deleteAuditAction(audit.slug));
        expect(res).toEqual({ ok: false, error: "not found" });

        const rows = await tx.select({ id: audits.id }).from(audits).where(eq(audits.id, audit.id));
        expect(rows).toHaveLength(1);
      });
    });

    it("deletes the owner's audit", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const audit = await seedAudit(tx, owner);
        expect(await as(owner, () => deleteAuditAction(audit.slug))).toEqual({ ok: true });

        const rows = await tx.select({ id: audits.id }).from(audits).where(eq(audits.id, audit.id));
        expect(rows).toEqual([]);
      });
    });
  });

  describe("revokeToken", () => {
    it("refuses to revoke another user's upload token", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const [tok] = await tx
          .insert(uploadTokens)
          .values({ userId: owner, label: "ci", tokenHash: `h_${uniq()}` })
          .returning({ id: uploadTokens.id });

        await as(attacker, () => revokeToken(tok.id));

        const [after] = await tx
          .select({ revokedAt: uploadTokens.revokedAt })
          .from(uploadTokens)
          .where(eq(uploadTokens.id, tok.id));
        expect(after.revokedAt).toBeNull();
      });
    });

    it("revokes the owner's upload token", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const [tok] = await tx
          .insert(uploadTokens)
          .values({ userId: owner, label: "ci", tokenHash: `h_${uniq()}` })
          .returning({ id: uploadTokens.id });

        await as(owner, () => revokeToken(tok.id));

        const [after] = await tx
          .select({ revokedAt: uploadTokens.revokedAt })
          .from(uploadTokens)
          .where(eq(uploadTokens.id, tok.id));
        expect(after.revokedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe("snoozeFinding / dismissFinding", () => {
    async function seedFinding(tx: Tx, domainId: string): Promise<string> {
      const [row] = await tx
        .insert(findingsState)
        .values({
          domainId,
          ruleId: "content/thin",
          templateSignature: "/p/:num",
          severityLatest: "warning",
          ruleMessageLatest: "thin content",
        })
        .returning({ id: findingsState.id });
      return row.id;
    }

    it("throws rather than mutating another user's finding", async () => {
      await withRollback(2, async ({ tx, users: [owner, attacker] }) => {
        const dom = await seedDomain(tx, owner);
        const findingId = await seedFinding(tx, dom.id);

        // assertOwns joins through monitored_domain, so a foreign finding must
        // be indistinguishable from a missing one.
        await expect(as(attacker, () => dismissFinding(findingId))).rejects.toThrow("not found");
        await expect(as(attacker, () => snoozeFinding(findingId, 7))).rejects.toThrow("not found");

        const [after] = await tx
          .select({ status: findingsState.status })
          .from(findingsState)
          .where(eq(findingsState.id, findingId));
        expect(after.status).toBe("open");
      });
    });

    it("lets the owner snooze and dismiss", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        const dom = await seedDomain(tx, owner);
        const findingId = await seedFinding(tx, dom.id);

        await as(owner, () => snoozeFinding(findingId, 7));
        const [snoozed] = await tx
          .select({ status: findingsState.status, until: findingsState.snoozeUntil })
          .from(findingsState)
          .where(eq(findingsState.id, findingId));
        expect(snoozed.status).toBe("snoozed");
        expect(snoozed.until!.getTime()).toBeGreaterThan(Date.now());

        await as(owner, () => dismissFinding(findingId));
        const [dismissed] = await tx
          .select({ status: findingsState.status })
          .from(findingsState)
          .where(eq(findingsState.id, findingId));
        expect(dismissed.status).toBe("dismissed");
      });
    });
  });

  describe("removeAiKeyAction", () => {
    it("deletes only the caller's key", async () => {
      await withRollback(2, async ({ tx, users: [owner, other] }) => {
        await tx.insert(userAiKeys).values([
          { userId: owner, provider: "anthropic", apiKey: "sealed-a" },
          { userId: other, provider: "anthropic", apiKey: "sealed-b" },
        ]);

        await as(owner, () => removeAiKeyAction());

        const left = await tx.select({ userId: userAiKeys.userId }).from(userAiKeys);
        const ids = left.map((r) => r.userId);
        expect(ids).not.toContain(owner);
        expect(ids).toContain(other);
      });
    });
  });

  describe("deleteAccountAction", () => {
    function form(confirm: string): FormData {
      const fd = new FormData();
      fd.set("confirm", confirm);
      return fd;
    }

    it("refuses without the typed confirmation", async () => {
      await withRollback(1, async ({ tx, users: [owner] }) => {
        await expect(as(owner, () => deleteAccountAction(form("delete")))).rejects.toThrow(
          "confirm by typing DELETE",
        );

        const rows = await tx.select({ id: users.id }).from(users).where(eq(users.id, owner));
        expect(rows).toHaveLength(1);
      });
    });

    it("deletes the caller and cascades their domains, leaving other users intact", async () => {
      await withRollback(2, async ({ tx, users: [owner, bystander] }) => {
        const dom = await seedDomain(tx, owner);
        await seedDomain(tx, bystander);

        // The action ends in redirect(), which throws by design.
        await expect(as(owner, () => deleteAccountAction(form("DELETE")))).rejects.toThrow(
          "NEXT_REDIRECT",
        );

        const gone = await tx.select({ id: users.id }).from(users).where(eq(users.id, owner));
        expect(gone).toEqual([]);

        // FK is ON DELETE CASCADE, so the domain must go with the user rather
        // than stranding an orphan the monitoring cron would still pick up.
        const orphans = await tx
          .select({ id: monitoredDomains.id })
          .from(monitoredDomains)
          .where(eq(monitoredDomains.id, dom.id));
        expect(orphans).toEqual([]);

        const survivor = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, bystander));
        expect(survivor).toHaveLength(1);

        const survivorDomains = await tx
          .select({ id: monitoredDomains.id })
          .from(monitoredDomains)
          .where(and(eq(monitoredDomains.userId, bystander)));
        expect(survivorDomains).toHaveLength(1);
      });
    });
  });
});
