import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Template } from "@pseolint/core";
import { detectDegradedTemplates, fireDegradedEvents } from "@/lib/template-degraded";

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTemplate(sig: string, verdict: Template["verdict"], overrides: Partial<Template> = {}): Template {
  return {
    signature: sig,
    totalUrls: 100,
    totalDiscoveredUrls: 1000,
    auditedUrls: ["https://ex.com/p/1"],
    verdict,
    risk: 40,
    categories: {
      integrity: { grade: "B", issues: 1 },
      discoverability: { grade: "A", issues: 0 },
      citation: { grade: "A", issues: 0 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    variance: {
      ruleFireRates: {},
      uniformityScore: 0.8,
      topDriver: null,
    },
    findingIds: [],
    ...overrides,
  };
}

// ── detectDegradedTemplates ──────────────────────────────────────────────────

describe("detectDegradedTemplates", () => {
  it("returns empty array when prevTemplates is empty (no baseline)", () => {
    const curr = [makeTemplate("/listing/:slug", "critical")];
    expect(detectDegradedTemplates([], curr)).toHaveLength(0);
  });

  it("returns empty array when curr has no change", () => {
    const prev = [makeTemplate("/listing/:slug", "caution")];
    const curr = [makeTemplate("/listing/:slug", "caution")];
    expect(detectDegradedTemplates(prev, curr)).toHaveLength(0);
  });

  it("returns empty array when curr improves (better verdict)", () => {
    const prev = [makeTemplate("/listing/:slug", "critical")];
    const curr = [makeTemplate("/listing/:slug", "concerning")];
    expect(detectDegradedTemplates(prev, curr)).toHaveLength(0);
  });

  it("detects a single-step degradation (caution → concerning)", () => {
    const prev = [makeTemplate("/listing/:slug", "caution")];
    const curr = [makeTemplate("/listing/:slug", "concerning")];
    const result = detectDegradedTemplates(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].signature).toBe("/listing/:slug");
    expect(result[0].prevVerdict).toBe("caution");
    expect(result[0].currentVerdict).toBe("concerning");
    expect(result[0].shift).toBe(1);
  });

  it("detects severe degradation (ready → critical, shift=3)", () => {
    const prev = [makeTemplate("/listing/:slug", "ready")];
    const curr = [makeTemplate("/listing/:slug", "critical")];
    const result = detectDegradedTemplates(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].shift).toBe(3);
  });

  it("does NOT fire for a new template absent from prior run", () => {
    const prev = [makeTemplate("/listing/:slug", "caution")];
    const curr = [
      makeTemplate("/listing/:slug", "caution"),
      makeTemplate("/category/:slug", "critical"), // new template
    ];
    const result = detectDegradedTemplates(prev, curr);
    expect(result).toHaveLength(0);
  });

  it("does NOT fire when a template is removed (present in prev, absent in curr)", () => {
    const prev = [
      makeTemplate("/listing/:slug", "caution"),
      makeTemplate("/category/:slug", "caution"),
    ];
    const curr = [makeTemplate("/listing/:slug", "caution")]; // /category removed
    expect(detectDegradedTemplates(prev, curr)).toHaveLength(0);
  });

  it("returns topDriver from current template", () => {
    const driver = { ruleId: "spam/thin-content", fireRate: 0.9 };
    const prev = [makeTemplate("/listing/:slug", "caution")];
    const curr = [makeTemplate("/listing/:slug", "critical", {
      variance: { ruleFireRates: {}, uniformityScore: 0.5, topDriver: driver },
    })];
    const result = detectDegradedTemplates(prev, curr);
    expect(result[0].topDriver).toEqual(driver);
  });

  it("handles multiple templates with mixed verdicts correctly", () => {
    const prev = [
      makeTemplate("/a/:slug", "ready"),
      makeTemplate("/b/:slug", "concerning"),
      makeTemplate("/c/:slug", "caution"),
    ];
    const curr = [
      makeTemplate("/a/:slug", "caution"),   // degraded: +2
      makeTemplate("/b/:slug", "ready"),     // improved: no fire
      makeTemplate("/c/:slug", "critical"),  // degraded: +2
    ];
    const result = detectDegradedTemplates(prev, curr);
    expect(result).toHaveLength(2);
    const sigs = result.map((r) => r.signature).sort();
    expect(sigs).toEqual(["/a/:slug", "/c/:slug"]);
  });
});

// ── fireDegradedEvents ───────────────────────────────────────────────────────

describe("fireDegradedEvents", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits one log line per degraded template", () => {
    const degraded = [
      {
        signature: "/listing/:slug",
        prevVerdict: "caution" as const,
        currentVerdict: "critical" as const,
        shift: 2,
        topDriver: null,
        totalUrls: 500,
      },
    ];
    fireDegradedEvents("domain-123", degraded);
    expect(console.log).toHaveBeenCalledTimes(1);
    const logged = JSON.parse((console.log as ReturnType<typeof vi.spyOn>).mock.calls[0][0]);
    expect(logged.evt).toBe("template_degraded");
    expect(logged.domainId).toBe("domain-123");
    expect(logged.templateSignature).toBe("/listing/:slug");
    expect(logged.prevVerdict).toBe("caution");
    expect(logged.currentVerdict).toBe("critical");
  });

  it("emits nothing when degraded list is empty", () => {
    fireDegradedEvents("domain-456", []);
    expect(console.log).not.toHaveBeenCalled();
  });
});
