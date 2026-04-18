import { describe, it, expect } from "vitest";
import {
  auditRecordSchema,
  feedbackRecordSchema,
  telemetryRecordSchema,
  generateRunId,
  type AuditRecord,
  type FeedbackRecord,
} from "../../src/telemetry/types.js";

describe("generateRunId", () => {
  it("returns a 16-char lowercase hex string", () => {
    const id = generateRunId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("two calls produce distinct ids", () => {
    const a = generateRunId();
    const b = generateRunId();
    expect(a).not.toBe(b);
  });
});

describe("auditRecordSchema", () => {
  const minimal: AuditRecord = {
    type: "audit",
    schemaVersion: 1,
    runId: "0123456789abcdef",
    timestamp: "2026-04-18T12:00:00.000Z",
    durationMs: 1234,
    score: 87,
    pageCount: 10,
    findingCount: 3,
  };

  it("accepts a minimal valid audit record", () => {
    expect(() => auditRecordSchema.parse(minimal)).not.toThrow();
  });

  it("accepts an audit record with optional fields populated", () => {
    const full: AuditRecord = {
      ...minimal,
      rawFindingCount: 20,
      templateDetected: true,
      cacheStats: { hits: 5, total: 10, bytesSavedEstimate: 2048 },
      triage: {
        rootCauseCount: 2,
        providerId: "anthropic",
        modelId: "claude-opus-4-7",
        cacheHit: false,
        tokenUsage: { input: 1000, output: 500 },
        estimatedCostUsd: 0.012,
        truncatedInput: false,
      },
    };
    expect(() => auditRecordSchema.parse(full)).not.toThrow();
  });

  it("rejects an extra unknown top-level field (strict mode)", () => {
    const withExtra = { ...minimal, mysteryField: "nope" };
    expect(() => auditRecordSchema.parse(withExtra)).toThrow();
  });

  it("rejects a malformed runId", () => {
    expect(() =>
      auditRecordSchema.parse({ ...minimal, runId: "not-hex!" })
    ).toThrow();
  });

  it("rejects a negative durationMs", () => {
    expect(() =>
      auditRecordSchema.parse({ ...minimal, durationMs: -1 })
    ).toThrow();
  });

  it("rejects extra field inside triage (nested strict)", () => {
    const bad = {
      ...minimal,
      triage: {
        rootCauseCount: 1,
        providerId: "anthropic" as const,
        modelId: "m",
        cacheHit: false,
        tokenUsage: { input: 0, output: 0 },
        truncatedInput: false,
        // @ts-expect-error intentional extra field
        unknown: 1,
      },
    };
    expect(() => auditRecordSchema.parse(bad)).toThrow();
  });
});

describe("feedbackRecordSchema", () => {
  const base: FeedbackRecord = {
    type: "feedback",
    schemaVersion: 1,
    runId: "0123456789abcdef",
    timestamp: "2026-04-18T12:00:00.000Z",
    rating: "helpful",
  };

  it("accepts rating=helpful", () => {
    expect(() => feedbackRecordSchema.parse(base)).not.toThrow();
  });

  it("accepts rating=unhelpful", () => {
    expect(() =>
      feedbackRecordSchema.parse({ ...base, rating: "unhelpful" })
    ).not.toThrow();
  });

  it("accepts rating=skipped", () => {
    expect(() =>
      feedbackRecordSchema.parse({ ...base, rating: "skipped" })
    ).not.toThrow();
  });

  it("rejects an unknown rating", () => {
    expect(() =>
      feedbackRecordSchema.parse({ ...base, rating: "meh" })
    ).toThrow();
  });
});

describe("telemetryRecordSchema", () => {
  it("discriminates on type=audit", () => {
    const r = telemetryRecordSchema.parse({
      type: "audit",
      schemaVersion: 1,
      runId: "0123456789abcdef",
      timestamp: "2026-04-18T12:00:00.000Z",
      durationMs: 1,
      score: 50,
      pageCount: 1,
      findingCount: 1,
    });
    expect(r.type).toBe("audit");
  });

  it("discriminates on type=feedback", () => {
    const r = telemetryRecordSchema.parse({
      type: "feedback",
      schemaVersion: 1,
      runId: "0123456789abcdef",
      timestamp: "2026-04-18T12:00:00.000Z",
      rating: "helpful",
    });
    expect(r.type).toBe("feedback");
  });

  it("rejects an unknown type", () => {
    expect(() =>
      telemetryRecordSchema.parse({
        type: "banana",
        schemaVersion: 1,
        runId: "0123456789abcdef",
        timestamp: "2026-04-18T12:00:00.000Z",
      })
    ).toThrow();
  });
});
