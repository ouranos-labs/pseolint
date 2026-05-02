import { describe, it, expect } from "vitest";
import { checkRuleCanonicalConsistencyTool } from "../../../src/ai/tools/check-rule-canonical-consistency.js";
import { withCachedPage } from "../../helpers/page-cache-test.js";

const withCanonical = (href: string) => `
<html><head>
  <title>x</title>
  <link rel="canonical" href="${href}">
</head><body><h1>x</h1></body></html>
`;

const noCanonical = `
<html><head><title>x</title></head><body><h1>x</h1></body></html>
`;

describe("check_rule_canonical_consistency tool", () => {
  it("flags missing canonical as error", async () => {
    await withCachedPage("https://example.com/a", noCanonical, async (pageId) => {
      const r = await checkRuleCanonicalConsistencyTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hasCanonical).toBe(false);
      expect(r.data.findings.some((f) => f.severity === "error")).toBe(true);
    });
  });

  it("self-referencing canonical produces no findings", async () => {
    await withCachedPage("https://example.com/a", withCanonical("https://example.com/a"), async (pageId) => {
      const r = await checkRuleCanonicalConsistencyTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hasCanonical).toBe(true);
      expect(r.data.selfReferencing).toBe(true);
      expect(r.data.findings).toHaveLength(0);
    });
  });

  it("cross-page canonical to a known crawled URL is flagged warning", async () => {
    await withCachedPage("https://example.com/a", withCanonical("https://example.com/canonical-target"), async (pageId) => {
      const r = await checkRuleCanonicalConsistencyTool.run({
        pageId,
        knownUrls: ["https://example.com/canonical-target"],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.findings.some((f) => f.severity === "warning")).toBe(true);
    });
  });

  it("cross-page canonical to an unknown URL is info", async () => {
    await withCachedPage("https://example.com/a", withCanonical("https://other.example.com/elsewhere"), async (pageId) => {
      const r = await checkRuleCanonicalConsistencyTool.run({ pageId, knownUrls: [] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.findings.some((f) => f.severity === "info")).toBe(true);
    });
  });
});
