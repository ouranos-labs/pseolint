/**
 * Ownership gate on the indexing-submission actions.
 *
 * These actions ask Google / Bing to index URLs *on the domain's behalf*, so
 * they must not run for a host the caller hasn't proven they control. Google and
 * Bing reject unowned properties themselves, but that makes the block depend on
 * a third party: these tests pin the local check instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type DomainRow = {
  id: string;
  userId: string;
  host: string;
  verifiedAt: Date | null;
  indexNowKey: string | null;
  lastRisk: number | null;
};

const STATE: {
  domain: DomainRow | null;
  indexNowPushes: { host: string; urls: string[] }[];
  googlePushes: string[];
  loggedRequests: Record<string, unknown>[];
} = { domain: null, indexNowPushes: [], googlePushes: [], loggedRequests: [] };

vi.mock("@/db/schema", () => ({
  monitoredDomains: { id: {}, userId: {}, host: {}, verifiedAt: {} },
  integrations: { id: {}, userId: {}, kind: {} },
  indexingRequests: { id: {}, domainId: {}, url: {}, provider: {}, status: {}, createdAt: {} },
  audits: { id: {} },
  gscPageMetrics: { url: {}, domainId: {}, impressions: {} },
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const rowsFor = (table: unknown): unknown[] => {
    if (table === schema.monitoredDomains) return STATE.domain ? [STATE.domain] : [];
    // No prior indexing requests and no recorded impressions, so the duplicate
    // and correlation guards stay out of the way of the check under test.
    return [];
  };
  const mockDb = {
    select: (_shape?: unknown) => ({
      from: (table: unknown) => {
        const resolve = async () => rowsFor(table);
        return {
          where: () => ({
            then: (ok: (v: unknown[]) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
            limit: async () => resolve(),
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        if (table === schema.indexingRequests) STATE.loggedRequests.push(v);
      },
    }),
  };
  return { db: mockDb };
});

vi.mock("@/lib/session", () => ({
  getRequiredSession: async () => ({ user: { id: "user-A", email: "a@x" } }),
}));
vi.mock("@/lib/plan", () => ({ getPlan: async () => "pro" }));
vi.mock("@/lib/gsc", () => ({
  loadGscTokens: async () => ({ accessToken: "tok", refreshToken: "r" }),
}));
vi.mock("@/lib/secret-box", () => ({ openSecret: (v: string) => v, sealSecret: (v: string) => v }));
vi.mock("@/lib/flags", () => ({
  GOOGLE_INDEXING_ENABLED: true,
  GOOGLE_INDEXING_COMING_SOON: "Coming soon",
}));
vi.mock("@/lib/indexing", () => ({
  pushToIndexNow: async (host: string, urls: string[]) => {
    STATE.indexNowPushes.push({ host, urls });
  },
  pushToGoogleIndexing: async (url: string) => {
    STATE.googlePushes.push(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const domain = (over: Partial<DomainRow> = {}): DomainRow => ({
  id: "dom-1",
  userId: "user-A",
  host: "example.com",
  verifiedAt: new Date(),
  indexNowKey: "key-1",
  lastRisk: 10,
  ...over,
});

beforeEach(() => {
  STATE.domain = domain();
  STATE.indexNowPushes = [];
  STATE.googlePushes = [];
  STATE.loggedRequests = [];
});

const actions = () => import("@/app/dashboard/indexing-actions");

describe("requestIndexingAction ownership gate", () => {
  it("refuses IndexNow submission for an unverified domain", async () => {
    STATE.domain = domain({ verifiedAt: null });
    const { requestIndexingAction } = await actions();
    const res = await requestIndexingAction({
      domainId: "dom-1", url: "https://example.com/a", provider: "indexnow",
    });
    expect(res.error).toMatch(/verify domain ownership/i);
    expect(STATE.indexNowPushes).toHaveLength(0);
    expect(STATE.loggedRequests).toHaveLength(0);
  });

  it("refuses Google submission for an unverified domain", async () => {
    STATE.domain = domain({ verifiedAt: null });
    const { requestIndexingAction } = await actions();
    const res = await requestIndexingAction({
      domainId: "dom-1", url: "https://example.com/a", provider: "google",
    });
    expect(res.error).toMatch(/verify domain ownership/i);
    expect(STATE.googlePushes).toHaveLength(0);
  });

  it("submits for a verified domain", async () => {
    const { requestIndexingAction } = await actions();
    const res = await requestIndexingAction({
      domainId: "dom-1", url: "https://example.com/a", provider: "indexnow",
    });
    expect(res.success).toBe(true);
    expect(STATE.indexNowPushes).toEqual([{ host: "example.com", urls: ["https://example.com/a"] }]);
  });
});

describe("requestBatchIndexingAction ownership gate", () => {
  it("refuses batch submission for an unverified domain", async () => {
    STATE.domain = domain({ verifiedAt: null });
    const { requestBatchIndexingAction } = await actions();
    const res = await requestBatchIndexingAction({
      domainId: "dom-1",
      urls: ["https://example.com/a", "https://example.com/b"],
      provider: "indexnow",
    });
    expect(res.error).toMatch(/verify domain ownership/i);
    expect(STATE.indexNowPushes).toHaveLength(0);
  });

  it("submits a batch for a verified domain", async () => {
    const { requestBatchIndexingAction } = await actions();
    const res = await requestBatchIndexingAction({
      domainId: "dom-1",
      urls: ["https://example.com/a", "https://example.com/b"],
      provider: "indexnow",
    });
    expect(res.success).toBe(true);
    expect(STATE.indexNowPushes[0].urls).toHaveLength(2);
  });
});
