import { describe, it, expect } from "vitest";
import { checkRuleFreshnessSignalsTool } from "../../../src/ai/tools/check-rule-freshness-signals.js";
import { checkRuleRequiredFieldsTool } from "../../../src/ai/tools/check-rule-required-fields.js";
import { checkRuleSchemaConsistencyTool } from "../../../src/ai/tools/check-rule-schema-consistency.js";
import { checkRuleFaqCoverageTool } from "../../../src/ai/tools/check-rule-faq-coverage.js";
import { checkRuleContentModularityTool } from "../../../src/ai/tools/check-rule-content-modularity.js";
import { checkRuleCitableFactsTool } from "../../../src/ai/tools/check-rule-citable-facts.js";
import { checkRuleSummaryBaitTool } from "../../../src/ai/tools/check-rule-summary-bait.js";
import { withCachedPages } from "../../helpers/page-cache-test.js";

const minimalHtml = (extra = "") => `
<!doctype html><html><head><title>x</title>${extra}</head>
<body><h1>x</h1><p>some words here some words here some words here</p></body></html>
`;

describe("AEO + schema multi-page tool wrappers: smoke", () => {
  it("check_rule_freshness_signals returns findings shape", async () => {
    await withCachedPages(
      [
        { url: "https://example.com/a", html: minimalHtml() },
        { url: "https://example.com/b", html: minimalHtml() },
      ],
      async (pageIds) => {
        const r = await checkRuleFreshnessSignalsTool.run({ pageIds });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Array.isArray(r.data.findings)).toBe(true);
      },
    );
  });

  it("check_rule_required_fields runs against a page with bare JSON-LD", async () => {
    const html = minimalHtml(
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>`,
    );
    await withCachedPages(
      [{ url: "https://example.com/a", html }],
      async (pageIds) => {
        const r = await checkRuleRequiredFieldsTool.run({ pageIds });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.findings.length).toBeGreaterThan(0);
      },
    );
  });

  it("check_rule_schema_consistency rejects fewer than 2 pageIds", async () => {
    await withCachedPages(
      [{ url: "https://example.com/a", html: minimalHtml() }],
      async (pageIds) => {
        const r = await checkRuleSchemaConsistencyTool.run({ pageIds });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
      },
    );
  });

  it("check_rule_schema_consistency runs with 2+ pageIds", async () => {
    await withCachedPages(
      [
        { url: "https://example.com/a", html: minimalHtml() },
        { url: "https://example.com/b", html: minimalHtml() },
      ],
      async (pageIds) => {
        const r = await checkRuleSchemaConsistencyTool.run({ pageIds });
        expect(r.ok).toBe(true);
      },
    );
  });

  it("check_rule_faq_coverage handles an /faq/ URL", async () => {
    await withCachedPages(
      [{ url: "https://example.com/faq/sourdough", html: minimalHtml() }],
      async (pageIds) => {
        const r = await checkRuleFaqCoverageTool.run({ pageIds });
        expect(r.ok).toBe(true);
      },
    );
  });

  it("check_rule_content_modularity accepts custom thresholds", async () => {
    await withCachedPages(
      [{ url: "https://example.com/a", html: minimalHtml() }],
      async (pageIds) => {
        const r = await checkRuleContentModularityTool.run({
          pageIds,
          maxParagraphWords: 50,
          minSelfContainedRatio: 0.5,
        });
        expect(r.ok).toBe(true);
      },
    );
  });

  it("check_rule_citable_facts runs without entityPatterns", async () => {
    await withCachedPages(
      [{ url: "https://example.com/a", html: minimalHtml() }],
      async (pageIds) => {
        const r = await checkRuleCitableFactsTool.run({ pageIds });
        expect(r.ok).toBe(true);
      },
    );
  });

  it("check_rule_summary_bait runs", async () => {
    await withCachedPages(
      [{ url: "https://example.com/a", html: minimalHtml() }],
      async (pageIds) => {
        const r = await checkRuleSummaryBaitTool.run({ pageIds });
        expect(r.ok).toBe(true);
      },
    );
  });

  it("rejects empty pageIds array", async () => {
    const r = await checkRuleFreshnessSignalsTool.run({ pageIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });
});
