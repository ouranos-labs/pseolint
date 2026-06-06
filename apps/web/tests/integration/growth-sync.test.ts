import { describe, it, expect, vi, beforeEach } from "vitest";

const auditLogMock = vi.fn();
const markGscSyncedMock = vi.fn().mockResolvedValue(undefined);
const loadGscTokensMock = vi.fn();
const queryByPageQueryMock = vi.fn();
const dbInsertMock = vi.fn();
const dbSelectUserMock = vi.fn();
let envMock: Record<string, string | undefined> = {};

vi.mock("@/lib/audit-log", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/env", () => ({ env: () => envMock }));
vi.mock("@/lib/gsc", () => ({
  markGscSynced: markGscSyncedMock,
  loadGscTokens: loadGscTokensMock,
  querySearchAnalyticsByPageQuery: queryByPageQueryMock,
  weekBucketUtc: () => "2026-W02",
  rollingDateRange: () => ({ startDate: "2026-01-01", endDate: "2026-01-28" }),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => dbSelectUserMock() }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => dbInsertMock() }) }),
  },
}));
vi.mock("@/db/schema", () => ({
  growthSearchMetrics: { url: {}, query: {}, weekBucket: {} },
  users: { id: {}, email: {} },
}));

const { growthSyncOnce } = await import("@/lib/growth-sync-core");

beforeEach(() => {
  vi.clearAllMocks();
  dbInsertMock.mockResolvedValue(undefined);
  envMock = { GROWTH_GSC_SITE_URL: "sc-domain:pseolint.dev", GROWTH_GSC_OWNER_EMAIL: "owner@pseolint.dev" };
  dbSelectUserMock.mockResolvedValue([{ id: "owner-id" }]);
  loadGscTokensMock.mockResolvedValue({ accessToken: "t", refreshToken: "r", expiresAt: "2999-01-01T00:00:00Z" });
});

describe("growthSyncOnce", () => {
  it("skips when unconfigured", async () => {
    envMock = {};
    const r = await growthSyncOnce();
    expect(r.status).toBe("unconfigured");
    expect(queryByPageQueryMock).not.toHaveBeenCalled();
  });

  it("skips when the owner user is not found", async () => {
    dbSelectUserMock.mockResolvedValue([]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("owner-not-found");
  });

  it("skips when there is no GSC grant", async () => {
    loadGscTokensMock.mockResolvedValue(null);
    const r = await growthSyncOnce();
    expect(r.status).toBe("no-grant");
  });

  it("returns empty when GSC returns no rows", async () => {
    queryByPageQueryMock.mockResolvedValue([]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("empty");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("aggregates growth rows and upserts, logging ok", async () => {
    queryByPageQueryMock.mockResolvedValue([
      { url: "https://pseolint.dev/symptoms/x", query: "q1", clicks: 1, impressions: 100, ctr: 0.01, position: 3 },
      { url: "https://pseolint.dev/pricing", query: "p", clicks: 9, impressions: 900, ctr: 0.01, position: 2 },
    ]);
    const r = await growthSyncOnce();
    expect(r.status).toBe("ok");
    // 1 page-level + 1 page+query row for the single in-prefix URL = 2 rows; /pricing dropped.
    expect(r.rowCount).toBe(2);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock).toHaveBeenCalledWith("growth.sync.ok", expect.objectContaining({ rowCount: 2 }));
  });

  it("returns failed when the GSC API throws", async () => {
    queryByPageQueryMock.mockRejectedValue(new Error("token expired"));
    const r = await growthSyncOnce();
    expect(r.status).toBe("failed");
    expect(auditLogMock).toHaveBeenCalledWith("growth.sync.failed", expect.objectContaining({ err: "token expired" }));
  });
});
