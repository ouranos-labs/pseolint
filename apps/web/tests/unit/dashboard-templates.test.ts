import { describe, it, expect } from "vitest";
import type { AuditSummary, Template } from "@pseolint/core";

/**
 * Smoke test for the template-grid gate logic used on the dashboard.
 * The dashboard renders <TemplateGridClient> iff summary.templates.length >= 2.
 * We validate the condition here in isolation — no Next.js page render needed.
 */

function shouldRenderTemplateGrid(summary: Pick<AuditSummary, "templates">): boolean {
  return (summary.templates?.length ?? 0) >= 2;
}

function makeTemplate(sig: string): Template {
  return {
    signature: sig,
    totalUrls: 100,
    totalDiscoveredUrls: 1000,
    auditedUrls: ["https://ex.com/a/1"],
    verdict: "caution",
    risk: 35,
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
  };
}

describe("dashboard template-grid gate", () => {
  it("renders template grid when summary has >= 2 templates", () => {
    const summary = {
      templates: [makeTemplate("/listing/:slug"), makeTemplate("/category/:slug")],
    };
    expect(shouldRenderTemplateGrid(summary)).toBe(true);
  });

  it("does NOT render when summary has exactly 1 template", () => {
    const summary = { templates: [makeTemplate("/listing/:slug")] };
    expect(shouldRenderTemplateGrid(summary)).toBe(false);
  });

  it("does NOT render when templates array is empty (legacy / small site)", () => {
    expect(shouldRenderTemplateGrid({ templates: [] })).toBe(false);
  });

  it("does NOT render when templates is undefined (very old audit shape)", () => {
    expect(shouldRenderTemplateGrid({ templates: undefined as unknown as Template[] })).toBe(false);
  });

  it("renders for 3 templates", () => {
    const summary = {
      templates: [
        makeTemplate("/listing/:slug"),
        makeTemplate("/category/:slug"),
        makeTemplate("/help/:slug"),
      ],
    };
    expect(shouldRenderTemplateGrid(summary)).toBe(true);
  });
});
