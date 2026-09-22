/**
 * Scoring profile honesty (§3.1 / §3.5): unclear must not demote the three
 * integrity spam rules; --strict must clear severity/confidence overrides.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyScoringProfileOverrides, auditSource } from "../src/auditor.js";
import type { RuleResult } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("unclear profile — spam integrity rules keep native severity", () => {
  it("unclear does not remap entity-swap severity", () => {
    const out = applyScoringProfileOverrides(
      [{ ruleId: "spam/entity-swap", severity: "critical", confidence: "high", message: "x" }],
      { type: "unclear", confidence: 0.5, signals: [], suppressedRules: [] },
    );
    expect(out[0].severity).toBe("critical");
    expect(out[0].confidence).toBe("high");
  });

  it("unclear does not remap near-duplicate or doorway-pattern", () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/near-duplicate", severity: "critical", confidence: "high", message: "x" },
      { ruleId: "spam/doorway-pattern", severity: "critical", confidence: "high", message: "x" },
    ];
    const out = applyScoringProfileOverrides(findings, {
      type: "unclear",
      confidence: 0.5,
      signals: [],
      suppressedRules: [],
    });
    expect(out[0].severity).toBe("critical");
    expect(out[0].confidence).toBe("high");
    expect(out[1].severity).toBe("critical");
    expect(out[1].confidence).toBe("high");
  });

  it("unclear still demotes thin-content and AEO catalog-mismatch rules", () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/thin-content", severity: "error", confidence: "high", message: "x" },
      { ruleId: "aeo/citable-facts", severity: "error", confidence: "high", message: "x" },
    ];
    const out = applyScoringProfileOverrides(findings, {
      type: "unclear",
      confidence: 0.5,
      signals: [],
      suppressedRules: [],
    });
    expect(out[0].severity).toBe("info");
    expect(out[0].confidence).toBe("low");
    expect(out[1].severity).toBe("info");
    expect(out[1].confidence).toBe("low");
  });
});

describe("programmatic-directory profile — confidence unmute for near-dup/doorway", () => {
  it("keeps near-duplicate and doorway at warning severity but high confidence", () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/near-duplicate", severity: "critical", confidence: "high", message: "x" },
      { ruleId: "spam/doorway-pattern", severity: "critical", confidence: "high", message: "x" },
      { ruleId: "spam/thin-content", severity: "error", confidence: "high", message: "x" },
    ];
    const out = applyScoringProfileOverrides(findings, {
      type: "programmatic-directory",
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    });
    expect(out[0].severity).toBe("warning");
    expect(out[0].confidence).toBe("high");
    expect(out[1].severity).toBe("warning");
    expect(out[1].confidence).toBe("high");
    // thin stays demoted (not unmuted in this change)
    expect(out[2].severity).toBe("info");
    expect(out[2].confidence).toBe("low");
  });
});

describe("--strict clears scoring-profile demotions", () => {
  it("strict clears thin-content demotion on programmatic-directory (override helper)", () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/thin-content", severity: "error", confidence: "high", message: "thin" },
    ];
    const classification = {
      type: "programmatic-directory" as const,
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    };
    const demoted = applyScoringProfileOverrides(findings, classification);
    expect(demoted[0].severity).toBe("info");

    const strict = applyScoringProfileOverrides(findings, classification, { strict: true });
    expect(strict[0].severity).toBe("error");
    expect(strict[0].confidence).toBe("high");
  });

  it("strict clears thin-content demotion on programmatic-directory (auditSource)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-strict-prog-"));
    tempDirs.push(dir);
    // Thin pages so spam/thin-content fires.
    for (let i = 0; i < 3; i += 1) {
      await writeFile(
        join(dir, `item-${i}.html`),
        `<html><head><title>Item ${i}</title></head><body><h1>Item ${i}</h1><p>short</p></body></html>`,
        "utf-8",
      );
    }
    // Force programmatic-directory via classifierUrls (≥50 + dominant template).
    const classifierUrls = Array.from(
      { length: 80 },
      (_, i) => `https://catalog.example.com/integrations/app-${i}`,
    );

    const baseline = await auditSource(dir, { classifierUrls });
    expect(baseline.siteClassification.type).toBe("programmatic-directory");
    expect(baseline.appliedSeverityDemotions ?? []).toContain("spam/thin-content");

    const strict = await auditSource(dir, { classifierUrls, strict: true });
    expect(strict.siteClassification.type).toBe("programmatic-directory");
    expect(strict.appliedSeverityDemotions ?? []).not.toContain("spam/thin-content");
  });
});
