import { describe, it, expect, vi, beforeEach } from "vitest";

// Failure-path wiring: a failed run is stored classified and refunds the
// caller's rate-limit slots exactly once; the stuck-row sweeper records a
// non-refunded timeout.
const { updates, returningRows, refundMock } = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  returningRows: { value: [{ id: "a1" }] as Array<{ id: string }> },
  refundMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => ({ returning: async () => returningRows.value }) };
      },
    }),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ refundRateLimits: refundMock }));
vi.mock("@/lib/inngest", () => ({
  inngest: { createFunction: vi.fn((cfg: unknown) => cfg), send: vi.fn() },
}));
vi.mock("@pseolint/core", () => ({ auditSource: vi.fn(), checkOriginHealth: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadSummary: vi.fn(), summaryKey: (id: string) => `${id}.json` }));
vi.mock("@/lib/r2-cache-backend", () => ({ R2CacheBackend: vi.fn() }));
vi.mock("@/lib/analytics/track.server", () => ({ trackServer: vi.fn(), trackServerAfter: vi.fn() }));

describe("markAuditFailed", () => {
  beforeEach(() => {
    updates.length = 0;
    refundMock.mockReset();
    returningRows.value = [{ id: "a1" }];
  });

  it("stores the classified code with the raw message and refunds the slots", async () => {
    const { markAuditFailed } = await import("@/inngest/functions/run-audit");
    await markAuditFailed("a1", "http_5xx", "Failed to fetch source: 503", ["k1", "k2"]);
    expect(updates[0]).toMatchObject({ status: "failed", errorMessage: "[http_5xx] Failed to fetch source: 503" });
    expect(refundMock).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("does not refund when the row was no longer in flight (already closed)", async () => {
    returningRows.value = [];
    const { markAuditFailed } = await import("@/inngest/functions/run-audit");
    await markAuditFailed("a1", "timeout", "late", ["k1"]);
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("no keys, no refund call", async () => {
    const { markAuditFailed } = await import("@/inngest/functions/run-audit");
    await markAuditFailed("a1", "unknown", "x", undefined);
    expect(refundMock).not.toHaveBeenCalled();
  });
});

describe("sweepStuckAudits", () => {
  beforeEach(() => {
    updates.length = 0;
    returningRows.value = [{ id: "a1" }, { id: "a2" }];
  });

  it("fails stuck rows as a non-refunded timeout", async () => {
    const { sweepStuckAudits } = await import("@/inngest/functions/sweep-stuck-audits");
    const { parseAuditFailure } = await import("@/lib/audit-failure");
    const n = await sweepStuckAudits(new Date("2026-10-25T12:00:00Z"));
    expect(n).toBe(2);
    expect(updates[0].status).toBe("failed");
    expect(parseAuditFailure(updates[0].errorMessage as string)).toMatchObject({ code: "timeout", refunded: false });
  });
});
