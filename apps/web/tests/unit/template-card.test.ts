import { describe, it, expect } from "vitest";
import type { Template } from "@pseolint/core";

// Pure logic helpers extracted inline to match what template-card.tsx computes.
// We test the logic independently: no DOM/React environment needed.

function uniformityColor(score: number): string {
  if (score >= 0.7) return "bg-success";
  if (score >= 0.4) return "bg-warning";
  return "bg-destructive";
}

function topDriverLine(template: Template): string | null {
  const td = template.variance.topDriver;
  if (!td) return null;
  const fired = Math.round(td.fireRate * template.auditedUrls.length);
  const total = template.auditedUrls.length;
  return `${fired}/${total} samples fail ${td.ruleId}`;
}

function coverageLine(template: Template, totalDiscoveredUrls: number): string {
  const pct =
    totalDiscoveredUrls > 0
      ? ((template.totalUrls / totalDiscoveredUrls) * 100).toFixed(1)
      : "; ";
  return `${template.totalUrls.toLocaleString()} / ${totalDiscoveredUrls.toLocaleString()} URLs (${pct}%)`;
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    signature: "/listing/:slug",
    totalUrls: 234,
    totalDiscoveredUrls: 8200,
    auditedUrls: Array.from({ length: 10 }, (_, i) => `https://ex.com/listing/item-${i}`),
    verdict: "critical",
    risk: 72,
    categories: {
      integrity: { grade: "D", issues: 8 },
      discoverability: { grade: "B", issues: 1 },
      citation: { grade: "A", issues: 0 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    variance: {
      ruleFireRates: { "spam/thin-content": 0.8 },
      uniformityScore: 0.85,
      topDriver: { ruleId: "spam/thin-content", fireRate: 0.8 },
    },
    findingIds: [],
    ...overrides,
  };
}

describe("TemplateCard: uniformityColor", () => {
  it("returns bg-success when score >= 0.7", () => {
    expect(uniformityColor(0.7)).toBe("bg-success");
    expect(uniformityColor(1.0)).toBe("bg-success");
  });

  it("returns bg-warning for 0.4..0.69", () => {
    expect(uniformityColor(0.4)).toBe("bg-warning");
    expect(uniformityColor(0.69)).toBe("bg-warning");
  });

  it("returns bg-destructive below 0.4", () => {
    expect(uniformityColor(0.0)).toBe("bg-destructive");
    expect(uniformityColor(0.39)).toBe("bg-destructive");
  });
});

describe("TemplateCard: topDriverLine", () => {
  it("formats '8/10 samples fail spam/thin-content' for 0.8 fire rate on 10 samples", () => {
    const t = makeTemplate();
    expect(topDriverLine(t)).toBe("8/10 samples fail spam/thin-content");
  });

  it("returns null when topDriver is null", () => {
    const t = makeTemplate({ variance: { ruleFireRates: {}, uniformityScore: 0.9, topDriver: null } });
    expect(topDriverLine(t)).toBeNull();
  });

  it("rounds fractional fire counts", () => {
    const t = makeTemplate({
      auditedUrls: Array.from({ length: 10 }, (_, i) => `https://ex.com/p/${i}`),
      variance: {
        ruleFireRates: { "spam/thin-content": 0.75 },
        uniformityScore: 0.8,
        topDriver: { ruleId: "spam/thin-content", fireRate: 0.75 },
      },
    });
    // 0.75 * 10 = 7.5 → rounds to 8
    expect(topDriverLine(t)).toBe("8/10 samples fail spam/thin-content");
  });
});

describe("TemplateCard: coverageLine", () => {
  it("shows count / total with percentage", () => {
    const t = makeTemplate({ totalUrls: 234 });
    const result = coverageLine(t, 8200);
    // locale-formatted numbers (toLocaleString) may use comma, narrow-no-break-space,
    // or period as the thousands separator depending on the runtime locale.
    expect(result).toContain("234");
    expect(result).toContain("8");
    expect(result).toContain("200");
    expect(result).toContain("URLs (2.9%)");
  });

  it("shows: percentage when totalDiscoveredUrls is 0", () => {
    const t = makeTemplate({ totalUrls: 5 });
    const result = coverageLine(t, 0);
    expect(result).toContain("; ");
  });

  it("shows 100.0% when totalUrls === totalDiscoveredUrls", () => {
    const t = makeTemplate({ totalUrls: 100 });
    const result = coverageLine(t, 100);
    expect(result).toContain("100.0%");
  });
});
