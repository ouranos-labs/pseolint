import { describe, it, expect } from "vitest";
import { RULE_SCOPE, isRuleAllowedInDiff, SCORED_RULE_COUNT } from "../src/rules/scope.js";

describe("rule scope map", () => {
  it("has a scope entry for every critical rule id", () => {
    const critical = [
      "spam/near-duplicate",
      "spam/thin-content",
      "content/eeat-signals",
      "links/orphan-pages",
      "tech/redirect-chain",
      "schema/json-ld-valid",
      "cannibal/url-pattern",
      "data/missing-binding",
    ];
    for (const id of critical) {
      expect(RULE_SCOPE[id]).toBeDefined();
    }
  });

  it("allows page rules in diff mode", () => {
    expect(isRuleAllowedInDiff("spam/thin-content")).toBe(true);
    expect(isRuleAllowedInDiff("content/eeat-signals")).toBe(true);
    expect(isRuleAllowedInDiff("tech/redirect-chain")).toBe(true);
    expect(isRuleAllowedInDiff("schema/json-ld-valid")).toBe(true);
  });

  it("blocks corpus rules in diff mode", () => {
    expect(isRuleAllowedInDiff("spam/near-duplicate")).toBe(false);
    expect(isRuleAllowedInDiff("cannibal/url-pattern")).toBe(false);
    expect(isRuleAllowedInDiff("links/orphan-pages")).toBe(false);
  });

  it("defaults unknown ids to corpus (blocks in diff)", () => {
    expect(isRuleAllowedInDiff("future/unknown-rule")).toBe(false);
  });

  it("covers AEO rules — page-scoped ones run in diff, site-wide ones do not", () => {
    expect(isRuleAllowedInDiff("aeo/faq-coverage")).toBe(true);
    expect(isRuleAllowedInDiff("aeo/answer-first")).toBe(true);
    expect(isRuleAllowedInDiff("aeo/citable-facts")).toBe(true);
    expect(isRuleAllowedInDiff("aeo/freshness-signals")).toBe(true);
    expect(isRuleAllowedInDiff("aeo/content-modularity")).toBe(true);
    expect(isRuleAllowedInDiff("aeo/llms-txt")).toBe(false);
    expect(isRuleAllowedInDiff("aeo/crawler-access")).toBe(false);
  });

  it("SCORED_RULE_COUNT equals the non-audit rule set derived from RULE_SCOPE", () => {
    const derived = Object.keys(RULE_SCOPE).filter((id) => !id.startsWith("audit/")).length;
    expect(SCORED_RULE_COUNT).toBe(derived);
    // Guard against a literal/typo drift: every audit/* id is excluded.
    expect(SCORED_RULE_COUNT).toBe(Object.keys(RULE_SCOPE).length - 1);
  });
});
