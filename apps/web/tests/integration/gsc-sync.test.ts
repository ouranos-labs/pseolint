/**
 * Unit tests for GSC sync helpers.
 *
 * All DB and GSC API calls are mocked: these tests validate the chunking,
 * upsert shape, and error-handling logic of syncOneDomain without requiring a
 * live database or OAuth grant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks: must be hoisted before any imports that resolve the modules.
// ---------------------------------------------------------------------------

const auditLogMock = vi.fn();
const markGscSyncedMock = vi.fn().mockResolvedValue(undefined);
const querySearchAnalyticsByPageMock = vi.fn();
const dbInsertMock = vi.fn();

vi.mock("@/lib/audit-log", () => ({ auditLog: auditLogMock }));
vi.mock("@/lib/gsc", () => ({
  markGscSynced: markGscSyncedMock,
  querySearchAnalyticsByPage: querySearchAnalyticsByPageMock,
}));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => dbInsertMock(),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({ gscPageMetrics: { domainId: {}, url: {}, monthBucket: {} } }));

// Lazy import after mocks are registered.
const { syncOneDomain } = await import("@/lib/gsc-sync-core");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE = {
  domainId: "d1",
  userId: "u1",
  siteUrl: "https://example.com/",
  startDate: "2026-04-06",
  endDate: "2026-05-04",
  monthBucket: "2026-05",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbInsertMock.mockResolvedValue(undefined);
});

describe("syncOneDomain", () => {
  it("returns true and logs gsc.sync.empty when GSC returns no rows", async () => {
    querySearchAnalyticsByPageMock.mockResolvedValue([]);
    const result = await syncOneDomain(BASE);
    expect(result).toBe(true);
    expect(markGscSyncedMock).toHaveBeenCalledWith("u1");
    expect(auditLogMock).toHaveBeenCalledWith("gsc.sync.empty", expect.objectContaining({ domainId: "d1" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("upserts rows and logs gsc.sync.ok on success", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      url: `https://example.com/p/${i}`,
      clicks: i + 1,
      impressions: (i + 1) * 10,
      ctr: 0.1,
      position: 5.0,
    }));
    querySearchAnalyticsByPageMock.mockResolvedValue(rows);
    const result = await syncOneDomain(BASE);
    expect(result).toBe(true);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(markGscSyncedMock).toHaveBeenCalledWith("u1");
    expect(auditLogMock).toHaveBeenCalledWith("gsc.sync.ok", expect.objectContaining({ rowCount: 3 }));
  });

  it("chunks large result sets into multiple upsert batches", async () => {
    // 1200 rows → 3 chunks of 500, 500, 200 given UPSERT_CHUNK=500
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      url: `https://example.com/p/${i}`,
      clicks: 1,
      impressions: 100,
      ctr: 0.01,
      position: 8.0,
    }));
    querySearchAnalyticsByPageMock.mockResolvedValue(rows);
    const result = await syncOneDomain(BASE);
    expect(result).toBe(true);
    expect(dbInsertMock).toHaveBeenCalledTimes(3);
  });

  it("returns false and logs gsc.sync.failed when GSC API throws", async () => {
    querySearchAnalyticsByPageMock.mockRejectedValue(new Error("token expired"));
    const result = await syncOneDomain(BASE);
    expect(result).toBe(false);
    expect(markGscSyncedMock).not.toHaveBeenCalled();
    expect(auditLogMock).toHaveBeenCalledWith("gsc.sync.failed", expect.objectContaining({ err: "token expired" }));
  });

  it("returns false and logs gsc.sync.failed when DB upsert throws", async () => {
    querySearchAnalyticsByPageMock.mockResolvedValue([
      { url: "https://example.com/p/1", clicks: 5, impressions: 50, ctr: 0.1, position: 3.0 },
    ]);
    dbInsertMock.mockRejectedValue(new Error("connection timeout"));
    const result = await syncOneDomain(BASE);
    expect(result).toBe(false);
    expect(auditLogMock).toHaveBeenCalledWith("gsc.sync.failed", expect.objectContaining({ err: "connection timeout" }));
  });
});
