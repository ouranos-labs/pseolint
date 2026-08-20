/**
 * The two non-dashboard paths that create monitored domains: the Polar
 * monitor-intent webhook (`ensureMonitoredDomainForUser`) and the older
 * `addMonitoredDomain` server action.
 *
 * Both create a row that the *user never explicitly verifies at creation time*,
 * so both must (a) issue a verification token: without one the auto-verify cron
 * skips the row and the workspace banner has nothing to render, leaving the
 * domain permanently unverifiable: and (b) queue no crawl until ownership is
 * proven. `@/lib/monitoring` is the module under test, so it is imported for
 * real rather than mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type DomRow = { id: string; removedAt: Date | null; verifiedAt: Date | null };

const STATE: {
  existing: DomRow | null;
  /** Row the post-upsert `{ id, verifiedAt }` lookup returns. */
  domRow: { id: string; verifiedAt: Date | null } | null;
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  sent: { name: string; data: Record<string, unknown> }[];
  autoBindCalls: string[];
} = { existing: null, domRow: null, inserts: [], updates: [], sent: [], autoBindCalls: [] };

vi.mock("@/db/schema", () => ({
  monitoredDomains: { id: {}, userId: {}, host: {}, sourceUrl: {}, removedAt: {}, verifiedAt: {}, gscSiteUrl: {} },
  audits: { id: {}, slug: {} },
  watchedPages: { id: {}, monitoredDomainId: {}, url: {}, createdAt: {} },
  integrations: { id: {}, userId: {}, kind: {} },
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const rowsFor = (table: unknown, shape?: Record<string, unknown>): unknown[] => {
    if (table === schema.integrations) return [{ id: "int-1" }];
    if (table === schema.watchedPages) return [];
    if (table !== schema.monitoredDomains) return [];
    if (shape && "active" in shape) return [{ active: 0 }];
    if (shape && "removedAt" in shape) return STATE.existing ? [STATE.existing] : [];
    if (shape && "verifiedAt" in shape) return STATE.domRow ? [STATE.domRow] : [];
    if (shape && "paused" in shape) return [{ paused: false }];
    return [];
  };
  const mockDb = {
    select: (shape?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const resolve = async () => rowsFor(table, shape);
        return {
          where: () => ({
            then: (ok: (v: unknown[]) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
            limit: async () => resolve(),
            orderBy: () => ({
              then: (ok: (v: unknown[]) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
            }),
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (table === schema.monitoredDomains) STATE.inserts.push(v);
        const result = { returning: async () => [{ id: "audit-1" }] };
        // Domain inserts are awaited directly; audit inserts chain .returning().
        return Object.assign(Promise.resolve(undefined), result);
      },
    }),
    update: (_table: unknown) => ({
      set: (v: Record<string, unknown>) => {
        STATE.updates.push(v);
        return { where: async () => undefined };
      },
    }),
  };
  return { db: mockDb };
});

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: async (evt: { name: string; data: Record<string, unknown> }) => {
      STATE.sent.push(evt);
      return { ids: ["e1"] };
    },
  },
}));
vi.mock("@/lib/slug", () => ({ publicSlug: () => "slug_1" }));
vi.mock("@/lib/gsc", () => ({
  autoBindGscPropertiesForUser: async (userId: string) => {
    STATE.autoBindCalls.push(userId);
    return { bound: 0, ambiguous: 0, unmatched: 0 };
  },
}));
vi.mock("@/lib/domain-verify", () => ({ generateVerificationToken: () => "tok-fresh" }));
vi.mock("@/lib/session", () => ({
  getOptionalSession: async () => ({ user: { id: "user-A", email: "a@x" } }),
}));
vi.mock("@/lib/ssrf", () => ({ assertSafeUrl: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  STATE.existing = null;
  STATE.domRow = { id: "dom-1", verifiedAt: null };
  STATE.inserts = [];
  STATE.updates = [];
  STATE.sent = [];
  STATE.autoBindCalls = [];
});

describe("ensureMonitoredDomainForUser (Polar monitor-intent webhook)", () => {
  const run = async (url = "https://example.com") => {
    const { ensureMonitoredDomainForUser } = await import("@/lib/monitoring");
    return ensureMonitoredDomainForUser("user-A", url);
  };

  it("issues a verification token so the row can ever be verified", async () => {
    await run();
    expect(STATE.inserts).toHaveLength(1);
    expect(STATE.inserts[0].verificationToken).toBe("tok-fresh");
  });

  it("queues no crawl while the domain is unverified", async () => {
    const res = await run();
    expect(res.host).toBe("example.com");
    expect(STATE.sent).toHaveLength(0);
  });

  it("queues the kickoff crawl once verified", async () => {
    STATE.domRow = { id: "dom-1", verifiedAt: new Date() };
    await run();
    expect(STATE.sent).toHaveLength(1);
    expect(STATE.sent[0].data).toMatchObject({ url: "https://example.com", plan: "pro" });
  });

  it("attempts GSC auto-bind so a connected subscriber skips the DNS step", async () => {
    await run();
    expect(STATE.autoBindCalls).toEqual(["user-A"]);
  });

  it("re-arms verification when a removed domain is re-added", async () => {
    STATE.existing = { id: "dom-1", removedAt: new Date(), verifiedAt: new Date() };
    await run();
    expect(STATE.updates[0]).toMatchObject({ verifiedAt: null, verificationToken: "tok-fresh" });
    expect(STATE.sent).toHaveLength(0);
  });
});

describe("addMonitoredDomain (dashboard action)", () => {
  it("issues a verification token on insert", async () => {
    const { addMonitoredDomain } = await import("@/app/dashboard/actions");
    const res = await addMonitoredDomain("example.com");
    expect(res.ok).toBe(true);
    expect(STATE.inserts).toHaveLength(1);
    expect(STATE.inserts[0].verificationToken).toBe("tok-fresh");
    // This path never enqueued an audit; assert it stays that way.
    expect(STATE.sent).toHaveLength(0);
  });
});
