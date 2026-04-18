import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { triageFindings } from "../../src/ai/triage.js";
import { createStubAdapter } from "../helpers/stub-adapter.js";
import type { RuleResult } from "../../src/types.js";

const validResponse = (ids: string[]) => JSON.stringify({
  rootCauses: [{
    label: "Templating problem",
    findingsCount: ids.length,
    affectedRuleIds: ["spam/thin-content"],
    severity: "warning",
    fixOrder: 1,
    rationale: "Fix the template.",
    relatedFindingIds: ids,
  }],
  narrative: "This site has templating issues.",
});

const findings = (n: number): RuleResult[] => Array.from({ length: n }, (_, i) => ({
  ruleId: "spam/thin-content",
  severity: "warning" as const,
  message: `Page ${i} is thin`,
  pageUrl: `https://example.com/${i}`,
}));

describe("triageFindings", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "pseolint-triage-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns a TriageResult on happy path", async () => {
    const fs = findings(3);
    // Compute expected ids the same way the function will.
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const adapter = createStubAdapter({ text: validResponse(ids) });
    const { result, skipReason } = await triageFindings(fs, 10, {
      enabled: true,
      adapter,
      cache: false,
    });
    expect(skipReason).toBeUndefined();
    expect(result).toBeDefined();
    expect(result!.rootCauses).toHaveLength(1);
    expect(result!.providerId).toBe("anthropic");
    expect(result!.cacheHit).toBe(false);
    expect(result!.promptVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("skips with reason when pre-flight estimate exceeds cap", async () => {
    const adapter = createStubAdapter({ estimateOverride: 99_999 });
    const { result, skipReason } = await triageFindings(findings(1), 1, {
      enabled: true,
      adapter,
      maxInputTokens: 100,
      cache: false,
    });
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/pre-flight/i);
    expect(adapter.calls).toHaveLength(0);
  });

  it("skips with reason on adapter error (auth)", async () => {
    const adapter = createStubAdapter({ throwKind: "auth" });
    const { result, skipReason } = await triageFindings(findings(1), 1, {
      enabled: true,
      adapter,
      cache: false,
    });
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/auth/);
  });

  it("skips with reason when LLM returns invalid JSON", async () => {
    const adapter = createStubAdapter({ text: "not json at all" });
    const { result, skipReason } = await triageFindings(findings(1), 1, {
      enabled: true,
      adapter,
      cache: false,
    });
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/invalid|parse/i);
  });

  it("skips with reason when LLM references unknown finding ids", async () => {
    const bad = JSON.stringify({
      rootCauses: [{
        label: "x", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "warning",
        fixOrder: 1, rationale: "r", relatedFindingIds: ["nope/none:00000000"],
      }],
      narrative: "n",
    });
    const adapter = createStubAdapter({ text: bad });
    const { skipReason } = await triageFindings(findings(1), 1, {
      enabled: true,
      adapter,
      cache: false,
    });
    expect(skipReason).toMatch(/unknown finding/i);
  });

  it("uses cache: writes on miss, reads on subsequent run", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const adapter = createStubAdapter({ text: validResponse(ids) });

    const first = await triageFindings(fs, 5, {
      enabled: true,
      adapter,
      cache: { dir, ttlMs: 60_000 },
    });
    expect(first.result?.cacheHit).toBe(false);
    expect(adapter.calls).toHaveLength(1);

    const second = await triageFindings(fs, 5, {
      enabled: true,
      adapter,
      cache: { dir, ttlMs: 60_000 },
    });
    expect(second.result?.cacheHit).toBe(true);
    expect(adapter.calls).toHaveLength(1); // adapter NOT called again
  });

  it("populates estimatedCostUsd for known model", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const adapter = createStubAdapter({
      text: validResponse(ids),
      usage: { input: 1_000_000, output: 0 },
      model: "claude-sonnet-4-6",
      id: "anthropic",
    });
    const { result } = await triageFindings(fs, 5, { enabled: true, adapter, cache: false });
    expect(result?.estimatedCostUsd).toBeCloseTo(3, 2);
  });

  it("estimatedCostUsd undefined for ollama (local)", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const adapter = createStubAdapter({
      text: validResponse(ids),
      id: "ollama",
      model: "llama3.1:8b",
    });
    const { result } = await triageFindings(fs, 5, { enabled: true, adapter, cache: false });
    expect(result?.estimatedCostUsd).toBeUndefined();
  });

  it("respects abort signal (skips with reason, no warning)", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const adapter = createStubAdapter({ text: "{}" });
    const { result, skipReason } = await triageFindings(findings(1), 1, {
      enabled: true,
      adapter,
      cache: false,
      signal: ctrl.signal,
    });
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/abort/i);
  });

  it("sets truncatedInput true when findings > MAX_FINDINGS_IN_PROMPT", async () => {
    const { MAX_FINDINGS_IN_PROMPT, assignFindingId } = await import("../../src/ai/prompt.js");
    const fs = findings(MAX_FINDINGS_IN_PROMPT + 5);
    const sortedIds = fs.slice(0, MAX_FINDINGS_IN_PROMPT).map(assignFindingId);
    const adapter = createStubAdapter({ text: validResponse(sortedIds.slice(0, 1)) });
    const { result } = await triageFindings(fs, 100, { enabled: true, adapter, cache: false });
    expect(result?.truncatedInput).toBe(true);
  });
});
