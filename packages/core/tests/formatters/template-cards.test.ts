import { describe, expect, it } from "vitest";
import type { Template, Verdict } from "../../src/types.js";
import {
  renderTemplateCardsConsole,
  renderTemplateCardsMarkdown,
  renderTemplateCardsHtml,
  shouldRenderTemplateCards,
} from "../../src/formatters/template-cards.js";

// ── fixtures ───────────────────────────────────────────────────────────────

function makeTemplate(sig: string, verdict: Verdict, risk: number, fireRate = 0.8): Template {
  return {
    signature: sig,
    totalUrls: 1000,
    totalDiscoveredUrls: 10000,
    auditedUrls: [
      `https://example.com${sig.replace(":slug", "foo")}`,
      `https://example.com${sig.replace(":slug", "bar")}`,
      `https://example.com${sig.replace(":slug", "baz")}`,
      `https://example.com${sig.replace(":slug", "qux")}`,
      `https://example.com${sig.replace(":slug", "quux")}`,
      `https://example.com${sig.replace(":slug", "corge")}`,
      `https://example.com${sig.replace(":slug", "grault")}`,
      `https://example.com${sig.replace(":slug", "garply")}`,
      `https://example.com${sig.replace(":slug", "waldo")}`,
      `https://example.com${sig.replace(":slug", "fred")}`,
    ],
    verdict,
    risk,
    categories: {
      integrity: { grade: "D", issues: 8 },
      discoverability: { grade: "A", issues: 0 },
      citation: { grade: "A", issues: 0 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    variance: {
      ruleFireRates: { "spam/thin-content": fireRate },
      uniformityScore: 0.82,
      topDriver: { ruleId: "spam/thin-content", fireRate },
    },
    findingIds: [],
  };
}

const twoTemplates: Template[] = [
  makeTemplate("/listing/:slug", "critical", 78, 0.8),
  makeTemplate("/category/:slug", "ready", 5, 0.0),
];

const threeTemplates: Template[] = [
  makeTemplate("/listing/:slug", "critical", 78, 0.8),
  makeTemplate("/category/:slug", "caution", 30, 0.2),
  makeTemplate("/blog/:slug", "ready", 5, 0.0),
];

// ── shouldRenderTemplateCards ─────────────────────────────────────────────

describe("shouldRenderTemplateCards", () => {
  it("returns true when ≥2 templates and not legacyFlat", () => {
    expect(shouldRenderTemplateCards(twoTemplates, {})).toBe(true);
  });

  it("returns false when legacyFlat", () => {
    expect(shouldRenderTemplateCards(twoTemplates, { legacyFlat: true })).toBe(false);
  });

  it("returns false when only 1 template", () => {
    expect(shouldRenderTemplateCards([twoTemplates[0]], {})).toBe(false);
  });

  it("returns false when templates is undefined", () => {
    expect(shouldRenderTemplateCards(undefined, {})).toBe(false);
  });

  it("returns false when templates is empty", () => {
    expect(shouldRenderTemplateCards([], {})).toBe(false);
  });
});

// ── console renderer ──────────────────────────────────────────────────────

describe("renderTemplateCardsConsole", () => {
  it("renders a header and one line per template (no color)", () => {
    const out = renderTemplateCardsConsole(twoTemplates, {}, true);
    expect(out).toContain("Per-template breakdown (2 templates)");
    expect(out).toContain("/listing/:slug");
    expect(out).toContain("CRITICAL");
    expect(out).toContain("/category/:slug");
    expect(out).toContain("READY");
  });

  it("shows coverage stat and uniformity", () => {
    const out = renderTemplateCardsConsole(twoTemplates, {}, true);
    // 1000/10000 = 10.0%
    expect(out).toContain("10/1000 URLs (10.0%)");
    expect(out).toContain("uniformity 82%");
  });

  it("shows top-driver line for templates with a topDriver", () => {
    const out = renderTemplateCardsConsole(twoTemplates, {}, true);
    // 0.8 * 10 samples = 8/10 samples fail
    expect(out).toContain("8/10 samples fail `spam/thin-content`");
  });

  it("highlights the matching template when filterTemplate is set", () => {
    const out = renderTemplateCardsConsole(
      twoTemplates,
      { filterTemplate: "/listing/:slug" },
      true,
    );
    // Marker arrow should appear before /listing/:slug
    expect(out).toContain("▶");
  });

  it("returns empty string when legacyFlat is true", () => {
    const out = renderTemplateCardsConsole(twoTemplates, { legacyFlat: true }, true);
    expect(out).toBe("");
  });

  it("returns empty string when fewer than 2 templates", () => {
    const out = renderTemplateCardsConsole([twoTemplates[0]], {}, true);
    expect(out).toBe("");
  });

  it("strips ANSI codes when noColor is true", () => {
    const colored = renderTemplateCardsConsole(twoTemplates, {}, false);
    const stripped = renderTemplateCardsConsole(twoTemplates, {}, true);
    expect(colored).toContain("\x1b[");
    expect(stripped).not.toContain("\x1b[");
  });

  it("handles three templates", () => {
    const out = renderTemplateCardsConsole(threeTemplates, {}, true);
    expect(out).toContain("/blog/:slug");
    expect(out).toContain("Per-template breakdown (3 templates)");
  });
});

// ── markdown renderer ─────────────────────────────────────────────────────

describe("renderTemplateCardsMarkdown", () => {
  it("renders a markdown table with correct columns", () => {
    const out = renderTemplateCardsMarkdown(twoTemplates, {});
    expect(out).toContain("## Templates");
    expect(out).toContain("| Template | Verdict | Grade | Coverage | Uniformity | Top driver |");
    expect(out).toContain("/listing/:slug");
    expect(out).toContain("critical");
    expect(out).toContain("/category/:slug");
    expect(out).toContain("ready");
  });

  it("shows coverage and uniformity in table cells", () => {
    const out = renderTemplateCardsMarkdown(twoTemplates, {});
    expect(out).toContain("10.0%");
    expect(out).toContain("82%");
  });

  it("shows top-driver text in table cells", () => {
    const out = renderTemplateCardsMarkdown(twoTemplates, {});
    expect(out).toContain("8/10 samples fail");
    expect(out).toContain("spam/thin-content");
  });

  it("marks highlighted template with ◀ when filterTemplate matches", () => {
    const out = renderTemplateCardsMarkdown(twoTemplates, { filterTemplate: "/listing/:slug" });
    expect(out).toContain("◀");
    // The non-matching template should not have ◀
    const lines = out.split("\n");
    const categoryLine = lines.find((l) => l.includes("/category/:slug")) ?? "";
    expect(categoryLine).not.toContain("◀");
  });

  it("returns empty string when legacyFlat is true", () => {
    const out = renderTemplateCardsMarkdown(twoTemplates, { legacyFlat: true });
    expect(out).toBe("");
  });

  it("returns empty string for a single-template array", () => {
    const out = renderTemplateCardsMarkdown([twoTemplates[0]], {});
    expect(out).toBe("");
  });

  it("shows — in top-driver cell when topDriver is null", () => {
    const noDriverTemplates: Template[] = [
      { ...twoTemplates[0], variance: { ...twoTemplates[0].variance, topDriver: null } },
      { ...twoTemplates[1], variance: { ...twoTemplates[1].variance, topDriver: null } },
    ];
    const out = renderTemplateCardsMarkdown(noDriverTemplates, {});
    expect(out).toContain("| — |");
  });
});

// ── html renderer ─────────────────────────────────────────────────────────

describe("renderTemplateCardsHtml", () => {
  it("renders a section with tmpl-card elements", () => {
    const out = renderTemplateCardsHtml(twoTemplates, {});
    expect(out).toContain('<section class="template-cards">');
    expect(out).toContain("tmpl-card");
    expect(out).toContain("/listing/:slug");
    expect(out).toContain("/category/:slug");
  });

  it("applies verdict tone CSS classes", () => {
    const out = renderTemplateCardsHtml(twoTemplates, {});
    expect(out).toContain("tmpl-critical");
    expect(out).toContain("tmpl-success");
  });

  it("marks highlighted card with data-highlighted attribute", () => {
    const out = renderTemplateCardsHtml(twoTemplates, {
      filterTemplate: "/listing/:slug",
    });
    expect(out).toContain('data-highlighted="true"');
    // The non-matching card should not be highlighted
    const idx = out.indexOf('data-highlighted="true"');
    expect(idx).toBeGreaterThan(-1);
    // Only one highlighted card
    expect(out.split('data-highlighted="true"').length - 1).toBe(1);
  });

  it("escapes HTML in signature", () => {
    const xssTemplate: Template = {
      ...twoTemplates[0],
      signature: '<script>alert("xss")</script>',
    };
    const out = renderTemplateCardsHtml([xssTemplate, twoTemplates[1]], {});
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&lt;script&gt;");
  });

  it("returns empty string when legacyFlat is true", () => {
    const out = renderTemplateCardsHtml(twoTemplates, { legacyFlat: true });
    expect(out).toBe("");
  });

  it("returns empty string for fewer than 2 templates", () => {
    const out = renderTemplateCardsHtml([twoTemplates[0]], {});
    expect(out).toBe("");
  });
});
