import { describe, it, expect } from "vitest";
import { aggregateTelemetry } from "../../src/telemetry/aggregator.js";
import type {
  AuditRecord,
  FeedbackRecord,
  TelemetryRecord,
} from "../../src/telemetry/types.js";

function makeAudit(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    type: "audit",
    schemaVersion: 1,
    runId: "0123456789abcdef",
    timestamp: "2026-04-18T12:00:00.000Z",
    durationMs: 1000,
    score: 80,
    pageCount: 10,
    findingCount: 3,
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    type: "feedback",
    schemaVersion: 1,
    runId: "0123456789abcdef",
    timestamp: "2026-04-18T12:05:00.000Z",
    rating: "helpful",
    ...overrides,
  };
}

describe("aggregateTelemetry", () => {
  it("returns zeros and nulls for an empty input", () => {
    const s = aggregateTelemetry([]);
    expect(s).toEqual({
      totalAudits: 0,
      totalFeedback: 0,
      avgDurationMs: null,
      avgScore: null,
      avgFindings: null,
      avgPages: null,
      triageAttempts: 0,
      triageUsed: 0,
      triageSkipReasons: {},
      triageCacheHits: 0,
      totalTokenInput: 0,
      totalTokenOutput: 0,
      totalEstimatedCostUsd: 0,
      feedbackBreakdown: { helpful: 0, unhelpful: 0, skipped: 0 },
      firstRun: null,
      lastRun: null,
    });
  });

  it("computes correct averages for audit-only records", () => {
    const records: TelemetryRecord[] = [
      makeAudit({
        durationMs: 1000,
        score: 70,
        pageCount: 10,
        findingCount: 5,
        timestamp: "2026-04-01T00:00:00.000Z",
      }),
      makeAudit({
        durationMs: 2000,
        score: 90,
        pageCount: 20,
        findingCount: 15,
        timestamp: "2026-04-02T00:00:00.000Z",
      }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.totalAudits).toBe(2);
    expect(s.totalFeedback).toBe(0);
    expect(s.avgDurationMs).toBe(1500);
    expect(s.avgScore).toBe(80);
    expect(s.avgPages).toBe(15);
    expect(s.avgFindings).toBe(10);
    expect(s.firstRun).toBe("2026-04-01T00:00:00.000Z");
    expect(s.lastRun).toBe("2026-04-02T00:00:00.000Z");
  });

  it("splits counts correctly when audits and feedback are mixed", () => {
    const records: TelemetryRecord[] = [
      makeAudit(),
      makeFeedback({ rating: "helpful" }),
      makeFeedback({ rating: "unhelpful" }),
      makeFeedback({ rating: "skipped" }),
      makeFeedback({ rating: "helpful" }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.totalAudits).toBe(1);
    expect(s.totalFeedback).toBe(4);
    expect(s.feedbackBreakdown).toEqual({
      helpful: 2,
      unhelpful: 1,
      skipped: 1,
    });
  });

  it("audits without triage contribute 0 to triage aggregates", () => {
    const records: TelemetryRecord[] = [
      makeAudit(),
      makeAudit(),
      makeAudit({
        triage: {
          success: true,
          rootCauseCount: 3,
          providerId: "anthropic",
          modelId: "claude-opus-4-7",
          cacheHit: false,
          tokenUsage: { input: 100, output: 50 },
          estimatedCostUsd: 0.01,
          truncatedInput: false,
        },
      }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.totalAudits).toBe(3);
    expect(s.triageUsed).toBe(1);
    expect(s.triageCacheHits).toBe(0);
    expect(s.totalTokenInput).toBe(100);
    expect(s.totalTokenOutput).toBe(50);
    expect(s.totalEstimatedCostUsd).toBeCloseTo(0.01, 10);
  });

  it("sums triage aggregates across triaged audits and counts cache hits", () => {
    const records: TelemetryRecord[] = [
      makeAudit({
        triage: {
          success: true,
          rootCauseCount: 2,
          providerId: "anthropic",
          modelId: "m",
          cacheHit: true,
          tokenUsage: { input: 10, output: 5 },
          estimatedCostUsd: 0.001,
          truncatedInput: false,
        },
      }),
      makeAudit({
        triage: {
          success: true,
          rootCauseCount: 1,
          providerId: "ollama",
          modelId: "m",
          cacheHit: true,
          tokenUsage: { input: 20, output: 10 },
          truncatedInput: true,
        },
      }),
      makeAudit({
        triage: {
          success: true,
          rootCauseCount: 4,
          providerId: "anthropic",
          modelId: "m",
          cacheHit: false,
          tokenUsage: { input: 30, output: 15 },
          estimatedCostUsd: 0.002,
          truncatedInput: false,
        },
      }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.triageUsed).toBe(3);
    expect(s.triageCacheHits).toBe(2);
    expect(s.totalTokenInput).toBe(60);
    expect(s.totalTokenOutput).toBe(30);
    expect(s.totalEstimatedCostUsd).toBeCloseTo(0.003, 10);
  });

  it("firstRun and lastRun correctly pick min/max timestamps", () => {
    const records: TelemetryRecord[] = [
      makeAudit({ timestamp: "2026-04-05T00:00:00.000Z" }),
      makeAudit({ timestamp: "2026-04-01T00:00:00.000Z" }),
      makeAudit({ timestamp: "2026-04-10T00:00:00.000Z" }),
      // Feedback timestamps should NOT influence firstRun/lastRun.
      makeFeedback({ timestamp: "2026-04-20T00:00:00.000Z" }),
      makeFeedback({ timestamp: "2025-01-01T00:00:00.000Z" }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.firstRun).toBe("2026-04-01T00:00:00.000Z");
    expect(s.lastRun).toBe("2026-04-10T00:00:00.000Z");
  });

  it("handles a single audit with no triage and no feedback cleanly", () => {
    const s = aggregateTelemetry([makeAudit({ score: 42 })]);
    expect(s.avgScore).toBe(42);
    expect(s.triageUsed).toBe(0);
    expect(s.totalEstimatedCostUsd).toBe(0);
  });

  it("separates triage attempts from successful triages and groups skip reasons", () => {
    const records: TelemetryRecord[] = [
      makeAudit({
        triage: {
          success: false,
          skipReason: "auth: no ANTHROPIC_API_KEY",
          rootCauseCount: 0,
          providerId: "anthropic",
          modelId: "claude-sonnet-4-6",
          cacheHit: false,
          tokenUsage: { input: 0, output: 0 },
          truncatedInput: false,
        },
      }),
      makeAudit({
        triage: {
          success: false,
          skipReason: "LLM call failed: schema mismatch",
          rootCauseCount: 0,
          providerId: "anthropic",
          modelId: "claude-haiku-4-5-20251001",
          cacheHit: false,
          tokenUsage: { input: 0, output: 0 },
          truncatedInput: false,
        },
      }),
      makeAudit({
        triage: {
          success: true,
          rootCauseCount: 3,
          providerId: "anthropic",
          modelId: "claude-sonnet-4-6",
          cacheHit: false,
          tokenUsage: { input: 100, output: 50 },
          truncatedInput: false,
        },
      }),
    ];
    const s = aggregateTelemetry(records);
    expect(s.triageAttempts).toBe(3);
    expect(s.triageUsed).toBe(1);
    expect(s.triageSkipReasons).toEqual({ auth: 1, "LLM call failed": 1 });
    // Token counters only reflect successful triages
    expect(s.totalTokenInput).toBe(100);
    expect(s.totalTokenOutput).toBe(50);
  });
});
