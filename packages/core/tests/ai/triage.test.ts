import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { triageFindings } from "../../src/ai/triage.js";
import { MockModel, okResponse } from "../helpers/mock-model.js";
import type { RuleResult } from "../../src/types.js";

const validBody = (ids: string[]) => ({
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

const baseOptions = (overrides: Partial<Parameters<typeof triageFindings>[2]> = {}) => ({
  enabled: true,
  providerId: "anthropic" as const,
  modelId: "claude-sonnet-4-6",
  cache: false as const,
  ...overrides,
});

describe("triageFindings", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-triage-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns a TriageResult on happy path", async () => {
    const fs = findings(3);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    let calls = 0;
    const model = new MockModel({
      doGenerate: async () => { calls += 1; return okResponse(validBody(ids)); },
    });

    const { result, skipReason } = await triageFindings(fs, 10, baseOptions({ model }));

    expect(skipReason).toBeUndefined();
    expect(result).toBeDefined();
    expect(result!.rootCauses).toHaveLength(1);
    expect(result!.providerId).toBe("anthropic");
    expect(result!.cacheHit).toBe(false);
    expect(result!.promptVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(calls).toBe(1);
  });

  it("skips with reason when pre-flight estimate exceeds cap", async () => {
    let calls = 0;
    const model = new MockModel({
      doGenerate: async () => { calls += 1; return okResponse(validBody([])); },
    });
    const { result, skipReason } = await triageFindings(findings(1), 1, baseOptions({
      model,
      maxInputTokens: 1,
    }));
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/pre-flight/i);
    expect(calls).toBe(0);
  });

  it("skips with reason when the LLM call fails", async () => {
    const model = new MockModel({
      doGenerate: async () => { throw new Error("boom"); },
    });
    const { result, skipReason } = await triageFindings(findings(1), 1, baseOptions({ model }));
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/LLM call failed/i);
  });

  it("skips with reason when LLM references unknown finding ids", async () => {
    const model = new MockModel({
      doGenerate: async () => okResponse({
        rootCauses: [{
          label: "x",
          findingsCount: 1,
          affectedRuleIds: ["x/y"],
          severity: "warning",
          fixOrder: 1,
          rationale: "r",
          relatedFindingIds: ["nope/none:00000000"],
        }],
        narrative: "n",
      }),
    });
    const { skipReason } = await triageFindings(findings(1), 1, baseOptions({ model }));
    expect(skipReason).toMatch(/unknown finding/i);
  });

  it("uses cache: writes on miss, reads on subsequent run", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    let calls = 0;
    const model = new MockModel({
      doGenerate: async () => { calls += 1; return okResponse(validBody(ids)); },
    });

    const first = await triageFindings(fs, 5, baseOptions({
      model,
      cache: { dir, ttlMs: 60_000 },
    }));
    expect(first.result?.cacheHit).toBe(false);
    expect(calls).toBe(1);

    const second = await triageFindings(fs, 5, baseOptions({
      model,
      cache: { dir, ttlMs: 60_000 },
    }));
    expect(second.result?.cacheHit).toBe(true);
    expect(calls).toBe(1); // model NOT called again
  });

  it("populates estimatedCostUsd for known model", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const model = new MockModel({
      doGenerate: async () => okResponse(validBody(ids), { usage: { input: 1_000_000, output: 0 } }),
    });
    const { result } = await triageFindings(fs, 5, baseOptions({
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
    }));
    expect(result?.estimatedCostUsd).toBeCloseTo(3, 2);
  });

  it("estimatedCostUsd undefined for ollama (local)", async () => {
    const fs = findings(2);
    const { assignFindingId } = await import("../../src/ai/prompt.js");
    const ids = fs.map(assignFindingId);
    const model = new MockModel({
      doGenerate: async () => okResponse(validBody(ids)),
    });
    const { result } = await triageFindings(fs, 5, baseOptions({
      model,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    }));
    expect(result?.estimatedCostUsd).toBeUndefined();
  });

  it("respects abort signal set before start", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const model = new MockModel({
      doGenerate: async () => okResponse(validBody([])),
    });
    const { result, skipReason } = await triageFindings(findings(1), 1, baseOptions({
      model,
      signal: ctrl.signal,
    }));
    expect(result).toBeUndefined();
    expect(skipReason).toMatch(/abort/i);
  });

  it("sets truncatedInput true when findings > MAX_FINDINGS_IN_PROMPT", async () => {
    const { MAX_FINDINGS_IN_PROMPT, assignFindingId } = await import("../../src/ai/prompt.js");
    const fs = findings(MAX_FINDINGS_IN_PROMPT + 5);
    const firstId = assignFindingId(fs[0]);
    const model = new MockModel({
      doGenerate: async () => okResponse(validBody([firstId])),
    });
    const { result } = await triageFindings(fs, 100, baseOptions({ model }));
    expect(result?.truncatedInput).toBe(true);
  });
});
