import { describe, it, expect } from "vitest";
import {
  PROMPT_VERSION,
  assignFindingId,
  buildPromptRequest,
  parseAndValidateTriageJson,
  MAX_FINDINGS_IN_PROMPT,
} from "../../src/ai/prompt.js";
import type { RuleResult } from "../../src/types.js";

describe("PROMPT_VERSION", () => {
  it("is a non-empty semver-shaped string", () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("assignFindingId", () => {
  it("is deterministic", () => {
    const f: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "Page is thin", pageUrl: "https://example.com/a" };
    expect(assignFindingId(f)).toBe(assignFindingId(f));
  });

  it("differs by page URL", () => {
    const f1: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "X", pageUrl: "https://example.com/a" };
    const f2: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "X", pageUrl: "https://example.com/b" };
    expect(assignFindingId(f1)).not.toBe(assignFindingId(f2));
  });

  it("differs by message", () => {
    const f1: RuleResult = { ruleId: "x/y", severity: "warning", message: "A", pageUrl: "u" };
    const f2: RuleResult = { ruleId: "x/y", severity: "warning", message: "B", pageUrl: "u" };
    expect(assignFindingId(f1)).not.toBe(assignFindingId(f2));
  });

  it("handles undefined pageUrl", () => {
    const f: RuleResult = { ruleId: "x/y", severity: "warning", message: "A" };
    const id = assignFindingId(f);
    expect(id).toMatch(/^x\/y:[0-9a-f]{8}$/);
  });

  it("encodes ruleId in id prefix", () => {
    const f: RuleResult = { ruleId: "tech/og-completeness", severity: "warning", message: "M" };
    expect(assignFindingId(f).startsWith("tech/og-completeness:")).toBe(true);
  });
});

describe("buildPromptRequest", () => {
  it("includes pageCount and findings count in user message", () => {
    const findings: RuleResult[] = [
      { ruleId: "x/y", severity: "warning", message: "A", pageUrl: "u1" },
      { ruleId: "x/z", severity: "error", message: "B", pageUrl: "u2" },
    ];
    const req = buildPromptRequest(findings, 50);
    expect(req.system.length).toBeGreaterThan(50);
    expect(req.user).toContain('"totalFindings":2');
    expect(req.user).toContain('"pageCount":50');
  });

  it("caps findings at MAX_FINDINGS_IN_PROMPT and marks truncated", () => {
    const findings: RuleResult[] = Array.from({ length: MAX_FINDINGS_IN_PROMPT + 50 }, (_, i) => ({
      ruleId: "x/y",
      severity: "warning",
      message: `m${i}`,
      pageUrl: `u${i}`,
    }));
    const req = buildPromptRequest(findings, 1000);
    expect(req.user).toContain('"truncated":true');
    expect(req.user).toContain('"findingCountByRule"');
  });

  it("sorts truncation by severity descending (critical > error > warning > info)", () => {
    const findings: RuleResult[] = [
      ...Array.from({ length: MAX_FINDINGS_IN_PROMPT }, (_, i) => ({
        ruleId: "low/a",
        severity: "info" as const,
        message: `i${i}`,
        pageUrl: `i${i}`,
      })),
      { ruleId: "high/x", severity: "critical", message: "must-keep", pageUrl: "keep-me" },
    ];
    const req = buildPromptRequest(findings, 100);
    expect(req.user).toContain('"must-keep"');
  });

  it("does NOT mark truncated when findings <= cap", () => {
    const findings: RuleResult[] = [
      { ruleId: "x/y", severity: "warning", message: "A", pageUrl: "u1" },
    ];
    const req = buildPromptRequest(findings, 50);
    expect(req.user).toContain('"truncated":false');
  });
});

describe("parseAndValidateTriageJson", () => {
  const validIds = new Set(["x/y:abc12345", "x/z:def67890"]);

  it("parses a valid response", () => {
    const json = JSON.stringify({
      rootCauses: [
        {
          label: "Templating problem",
          findingsCount: 2,
          affectedRuleIds: ["x/y"],
          severity: "warning",
          fixOrder: 1,
          rationale: "Fix template",
          relatedFindingIds: ["x/y:abc12345"],
        },
      ],
      narrative: "Summary text.",
    });
    const r = parseAndValidateTriageJson(json, validIds);
    expect(r.rootCauses).toHaveLength(1);
    expect(r.rootCauses[0].label).toBe("Templating problem");
    expect(r.narrative).toBe("Summary text.");
  });

  it("strips markdown code fences if present", () => {
    const json = "```json\n" + JSON.stringify({
      rootCauses: [{
        label: "X", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "info",
        fixOrder: 1, rationale: "r", relatedFindingIds: [],
      }],
      narrative: "n",
    }) + "\n```";
    const r = parseAndValidateTriageJson(json, validIds);
    expect(r.rootCauses).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseAndValidateTriageJson("not json", validIds)).toThrow(/parse/i);
  });

  it("rejects missing rootCauses array", () => {
    expect(() => parseAndValidateTriageJson(JSON.stringify({ narrative: "n" }), validIds)).toThrow(/rootCauses/);
  });

  it("rejects label longer than 80 chars", () => {
    const json = JSON.stringify({
      rootCauses: [{ label: "x".repeat(81), findingsCount: 1, affectedRuleIds: ["x/y"], severity: "info", fixOrder: 1, rationale: "r", relatedFindingIds: [] }],
      narrative: "n",
    });
    expect(() => parseAndValidateTriageJson(json, validIds)).toThrow(/label/);
  });

  it("rejects fixOrder < 1", () => {
    const json = JSON.stringify({
      rootCauses: [{ label: "x", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "info", fixOrder: 0, rationale: "r", relatedFindingIds: [] }],
      narrative: "n",
    });
    expect(() => parseAndValidateTriageJson(json, validIds)).toThrow(/fixOrder/);
  });

  it("rejects unknown severity", () => {
    const json = JSON.stringify({
      rootCauses: [{ label: "x", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "extreme", fixOrder: 1, rationale: "r", relatedFindingIds: [] }],
      narrative: "n",
    });
    expect(() => parseAndValidateTriageJson(json, validIds)).toThrow(/severity/);
  });

  it("rejects relatedFindingIds not in valid set", () => {
    const json = JSON.stringify({
      rootCauses: [{ label: "x", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "info", fixOrder: 1, rationale: "r", relatedFindingIds: ["fake/id:00000000"] }],
      narrative: "n",
    });
    expect(() => parseAndValidateTriageJson(json, validIds)).toThrow(/unknown finding id/);
  });
});
