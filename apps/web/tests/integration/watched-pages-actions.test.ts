// Unit/integration tests for the v0.5.3 watched-pages server actions.
// Mocks @/db (in-memory), @/lib/session, @/lib/ssrf, @/lib/inngest, @/lib/plan
// so we can drive the action surface without a real DB or network.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- in-memory state used by mocks ----------
type WatchedRow = {
  id: string;
  monitoredDomainId: string;
  url: string;
  addedByUserId: string;
  lastAuditedAt: Date | null;
  createdAt: Date;
};
type DomainRow = {
  id: string;
  userId: string;
  host: string;
  sourceUrl: string;
  removedAt: Date | null;
  verifiedAt: Date | null;
};

const STATE: {
  session: { user: { id: string; email: string } } | null;
  plan: "free" | "pro";
  domains: DomainRow[];
  watched: WatchedRow[];
  ssrfReject: boolean;
  inngestSent: Array<{ name: string; data: unknown }>;
  /** Most-recent monitoredDomainId argument the test set; the db mock uses
   * this to scope SELECTs and CASCADE-ish deletes. */
  _lookupDomainId: string | null;
  /** Most-recent watchedPageId argument the test set. */
  _lookupWatchedId: string | null;
} = {
  session: null,
  plan: "pro",
  domains: [],
  watched: [],
  ssrfReject: false,
  inngestSent: [],
  _lookupDomainId: null,
  _lookupWatchedId: null,
};

let nextId = 1;
const newId = () => `id_${nextId++}`;

// ---------- module mocks ----------
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => {
    if (!STATE.session) throw new Error("Unauthorized");
    return STATE.session;
  }),
}));

vi.mock("@/lib/plan", () => ({
  getPlan: vi.fn(async () => STATE.plan),
}));

vi.mock("@/lib/ssrf", () => ({
  assertSafeUrl: vi.fn(async () => {
    if (STATE.ssrfReject) throw new Error("URL blocked by SSRF guard");
  }),
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: vi.fn(async (evt: { name: string; data: unknown }) => {
      STATE.inngestSent.push(evt);
      return { ids: ["e1"] };
    }),
  },
}));

vi.mock("@/lib/domain-verify", () => ({
  generateVerificationToken: () => "tok",
  verifyDomainToken: async () => true,
}));

vi.mock("@/lib/dev-flags", () => ({ devFlags: { domainVerifySkipped: false, inngestLocal: false, rateLimitDisabled: false } }));

vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn() }));

// Stubbed rate-limit always returns allowed; the action's daily-cap gate is
// exercised in production by the same `bumpRateLimit` already covered by
// /api/audits route tests. These tests focus on the action surface.
vi.mock("@/lib/rate-limit", () => ({
  bumpRateLimit: vi.fn(async () => ({ allowed: true, count: 1 })),
}));

vi.mock("@/lib/ids", () => ({
  todayDateString: () => "2026-05-04",
  extractClientIp: () => "127.0.0.1",
  hashIp: (ip: string) => `h:${ip}`,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/slug", () => ({ publicSlug: () => `slug_${nextId++}` }));

// Minimal Drizzle-ish chainable mock. The actions only use a handful of
// patterns; we implement just those.
//
// Strategy: track which table the most-recent `from()` referenced via the
// reference identity of the mocked schema objects, then route insert/select
// accordingly.
vi.mock("@/db", async () => {
  // late-imports to resolve the schema's table identities
  const schema = await import("@/db/schema");

  // Active table tracker (reset on each select/insert chain start).
  let activeTable: unknown = null;
  // Predicate the action's `where(...)` would apply. The mock can't introspect
  // Drizzle SQL ASTs, so we use a heuristic: filter rows by id when an `id`
  // appears in the most-recent select's args. We bypass that and just return
  // matching rows by reading `lastWhereArgs` we expose via globals.

  function rowsForTable(table: unknown): unknown[] {
    if (table === schema.monitoredDomains) return STATE.domains as unknown[];
    if (table === schema.watchedPages) return STATE.watched as unknown[];
    return [];
  }

  function makeChain(_table: unknown, selectShape?: Record<string, unknown>) {
    return {
      from: (t: unknown) => {
        activeTable = t;
        const rowsLike = (): unknown[] => rowsForTable(activeTable);

        const isCountSelect = !!selectShape && "count" in selectShape;

        const filteredDomainRows = () => STATE.domains
          .filter((d) => d.removedAt === null)
          .filter((d) => !STATE.session || d.userId === STATE.session.user.id)
          .filter((d) => !STATE._lookupDomainId || d.id === STATE._lookupDomainId)
          .map((d) => ({ ...d }));

        const filteredWatchedRows = () => STATE.watched
          .filter((w) => !STATE._lookupDomainId || w.monitoredDomainId === STATE._lookupDomainId)
          .map((w) => ({ ...w }));

        const resolve = async (): Promise<unknown[]> => {
          if (isCountSelect) {
            // count(*) over watchedPages restricted to active lookup domain
            const n = STATE.watched.filter((w) =>
              !STATE._lookupDomainId || w.monitoredDomainId === STATE._lookupDomainId,
            ).length;
            return [{ count: n }];
          }
          if (activeTable === schema.monitoredDomains) return filteredDomainRows();
          if (activeTable === schema.watchedPages) return filteredWatchedRows();
          return [];
        };

        // where() returns a thenable: directly awaitable for queries without
        // .limit (count case) and chainable into .limit / .orderBy / .for for
        // the domain-row lookup + FOR UPDATE row-lock case.
        const whereResult = {
          then: (onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
            resolve().then(onFulfilled, onRejected),
          limit: async () => resolve(),
          orderBy: () => ({
            limit: async () => rowsLike(),
            then: (onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
              resolve().then(onFulfilled, onRejected),
          }),
          // FOR UPDATE row lock — mock just resolves; no real locking semantics.
          for: async (_mode: string) => resolve(),
        };

        return {
          where: (..._args: unknown[]) => whereResult,
          innerJoin: () => ({
            where: () => ({
              limit: async () => {
                if (!STATE._lookupWatchedId) return [];
                const w = STATE.watched.find((ww) => ww.id === STATE._lookupWatchedId);
                if (!w) return [];
                const d = STATE.domains.find((dd) => dd.id === w.monitoredDomainId);
                if (!d) return [];
                if (STATE.session && d.userId !== STATE.session.user.id) return [];
                return [{ id: w.id, url: w.url, monitoredDomainId: w.monitoredDomainId, host: d.host }];
              },
            }),
          }),
        };
      },
    };
  }

  function makeInsert(table: unknown) {
    activeTable = table;
    return {
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        const arr = Array.isArray(vals) ? vals : [vals];
        const doInsert = (allowDup: boolean) => {
          const out: { id: string }[] = [];
          for (const v of arr) {
            if (activeTable === schema.watchedPages) {
              const existing = STATE.watched.find(
                (w) => w.monitoredDomainId === v.monitoredDomainId && w.url === v.url,
              );
              if (existing) {
                if (!allowDup) continue;
              } else {
                const row: WatchedRow = {
                  id: newId(),
                  monitoredDomainId: v.monitoredDomainId as string,
                  url: v.url as string,
                  addedByUserId: v.addedByUserId as string,
                  lastAuditedAt: null,
                  createdAt: new Date(),
                };
                STATE.watched.push(row);
                out.push({ id: row.id });
              }
            } else {
              // audits / monitored_domain — just stamp an id.
              out.push({ id: newId() });
            }
          }
          return out;
        };
        return {
          returning: async () => doInsert(true),
          // accepts { target: ... } config, matches Drizzle's signature
          onConflictDoNothing: (_cfg?: unknown) => ({
            returning: async () => doInsert(false),
          }),
        };
      },
    };
  }

  const mockDb = {
    select: (shape?: Record<string, unknown>) => makeChain(null, shape),
    insert: (table: unknown) => makeInsert(table),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: STATE.domains[0]?.id ?? "x" }],
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        if (table === schema.watchedPages) {
          // Best-effort: drop the most-recently looked-up watched id.
          if (STATE._lookupWatchedId) {
            STATE.watched = STATE.watched.filter((w) => w.id !== STATE._lookupWatchedId);
          } else if (STATE._lookupDomainId) {
            STATE.watched = STATE.watched.filter((w) => w.monitoredDomainId !== STATE._lookupDomainId);
          }
        }
        return Promise.resolve();
      },
    }),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(mockDb),
  };

  return { db: mockDb };
});

vi.mock("@/db/schema", () => ({
  monitoredDomains: { id: {}, userId: {}, host: {}, sourceUrl: {}, removedAt: {}, verifiedAt: {} },
  audits: { id: {}, slug: {}, sourceUrl: {}, userId: {}, status: {}, expiresAt: {}, isPublic: {} },
  watchedPages: {
    id: {},
    monitoredDomainId: {},
    url: {},
    addedByUserId: {},
    createdAt: {},
    lastAuditedAt: {},
  },
  blocklist: { key: {}, reason: {} },
}));

vi.mock("@/lib/blocklist", () => ({
  checkBlocklist: vi.fn(async () => null),
  hostBlockKey: (host: string) => `host:${host}`,
  userBlockKey: (userId: string) => `user:${userId}`,
}));

vi.mock("@/lib/monitoring", () => ({
  loadWatchedUrlsForDomain: async (domainId: string) =>
    STATE.watched.filter((w) => w.monitoredDomainId === domainId).map((w) => w.url),
}));

// ---------- helpers ----------
function seedDomain(over: Partial<DomainRow> = {}): DomainRow {
  const d: DomainRow = {
    id: newId(),
    userId: "user-A",
    host: "example.com",
    sourceUrl: "https://example.com",
    removedAt: null,
    verifiedAt: new Date(),
    ...over,
  };
  STATE.domains.push(d);
  return d;
}

beforeEach(() => {
  STATE.session = null;
  STATE.plan = "pro";
  STATE.domains = [];
  STATE.watched = [];
  STATE.ssrfReject = false;
  STATE.inngestSent = [];
  STATE._lookupDomainId = null;
  STATE._lookupWatchedId = null;
  nextId = 1;
});

/** Helper that wires the test's domainId hint into STATE before the action
 * runs. The mock db needs this because it can't introspect Drizzle SQL. */
async function callAddWatched(domainId: string, url: string) {
  STATE._lookupDomainId = domainId;
  const { addWatchedPage } = await import("@/app/dashboard/domain-actions");
  return addWatchedPage(domainId, url);
}

async function callRemoveWatched(watchedId: string) {
  STATE._lookupWatchedId = watchedId;
  const { removeWatchedPage } = await import("@/app/dashboard/domain-actions");
  return removeWatchedPage(watchedId);
}

describe("addWatchedPage", () => {
  it("rejects unauthenticated callers", async () => {
    STATE.session = null;
    const res = await callAddWatched("any", "https://example.com/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not signed in/i);
  });

  it("rejects free-tier callers", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    STATE.plan = "free";
    const d = seedDomain();
    const res = await callAddWatched(d.id, "https://example.com/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Pro/);
  });

  it("rejects when the user does not own the domain (cross-tenant)", async () => {
    STATE.session = { user: { id: "user-B", email: "b@x" } };
    STATE.plan = "pro";
    const d = seedDomain({ userId: "user-A" });
    // Action filters by session.user.id; mock honours that filter.
    const res = await callAddWatched(d.id, "https://example.com/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it("rejects domains whose ownership hasn't been verified", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain({ verifiedAt: null });
    const res = await callAddWatched(d.id, "https://example.com/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/verify domain ownership/i);
    // No pin, and no audit fired at a host we can't prove the user controls.
    expect(STATE.watched).toHaveLength(0);
    expect(STATE.inngestSent).toHaveLength(0);
  });

  it("rejects URLs whose host doesn't match the monitored domain", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain({ host: "example.com" });
    const res = await callAddWatched(d.id, "https://other.com/page");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/must belong to/i);
  });

  it("accepts www-equivalent host", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain({ host: "www.example.com" });
    const res = await callAddWatched(d.id, "https://example.com/page");
    expect(res.ok).toBe(true);
  });

  it("rejects URLs that fail the SSRF guard", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain();
    STATE.ssrfReject = true;
    const res = await callAddWatched(d.id, "https://example.com/x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/SSRF/i);
  });

  it("rejects duplicates", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain();
    const r1 = await callAddWatched(d.id, "https://example.com/x");
    expect(r1.ok).toBe(true);
    const r2 = await callAddWatched(d.id, "https://example.com/x");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/already/i);
  });

  it("enforces the 20-page cap (21st add fails with cap_reached message)", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain();
    for (let i = 0; i < 20; i++) {
      const r = await callAddWatched(d.id, `https://example.com/p/${i}`);
      expect(r.ok).toBe(true);
    }
    const overflow = await callAddWatched(d.id, "https://example.com/p/over");
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.error).toMatch(/capped at 20/);
  });

  it("fires audit/requested with force.urls on successful add", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain();
    const r = await callAddWatched(d.id, "https://example.com/launch");
    expect(r.ok).toBe(true);
    const evt = STATE.inngestSent.find((e) => e.name === "audit/requested");
    expect(evt).toBeDefined();
    const data = evt!.data as { force?: { urls?: string[] }; plan: string; mode: string };
    expect(data.plan).toBe("pro");
    expect(data.mode).toBe("full");
    expect(data.force?.urls).toEqual(["https://example.com/launch"]);
  });

  it("commits the watched row but skips the audit fire when rate-limited", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain();
    // Match by key prefix instead of relying on gate call order — keeps the
    // test robust if the gate suite is reordered. The Pro daily-cap key is
    // `pro:<userId>:<date>`; deny that one specifically and let everything
    // else allow. Result: shouldDeferImmediateAudit returns "per_user" and
    // the watched row commits without an audit fire.
    const { bumpRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(bumpRateLimit).mockImplementation(async (key: string) => {
      if (key.startsWith("pro:")) return { allowed: false, count: 999 };
      return { allowed: true, count: 1 };
    });

    const r = await callAddWatched(d.id, "https://example.com/launch");
    expect(r.ok).toBe(true);
    expect(STATE.watched.find((w) => w.url === "https://example.com/launch")).toBeDefined();
    expect(STATE.inngestSent.find((e) => e.name === "audit/requested")).toBeUndefined();

    // Restore default behaviour for any subsequent tests in this block.
    vi.mocked(bumpRateLimit).mockImplementation(async () => ({ allowed: true, count: 1 }));
  });
});

describe("removeWatchedPage", () => {
  it("rejects unauthenticated callers", async () => {
    STATE.session = null;
    const res = await callRemoveWatched("any");
    expect(res.ok).toBe(false);
  });

  it("removes a watched row owned by the caller", async () => {
    STATE.session = { user: { id: "user-A", email: "a@x" } };
    const d = seedDomain({ userId: "user-A" });
    STATE.watched.push({
      id: "w1",
      monitoredDomainId: d.id,
      url: "https://example.com/x",
      addedByUserId: "user-A",
      lastAuditedAt: null,
      createdAt: new Date(),
    });
    const res = await callRemoveWatched("w1");
    expect(res.ok).toBe(true);
    expect(STATE.watched.find((w) => w.id === "w1")).toBeUndefined();
  });

  it("rejects cross-tenant removes (other user's row)", async () => {
    STATE.session = { user: { id: "user-B", email: "b@x" } };
    const d = seedDomain({ userId: "user-A" });
    STATE.watched.push({
      id: "w1",
      monitoredDomainId: d.id,
      url: "https://example.com/x",
      addedByUserId: "user-A",
      lastAuditedAt: null,
      createdAt: new Date(),
    });
    const res = await callRemoveWatched("w1");
    expect(res.ok).toBe(false);
  });
});
