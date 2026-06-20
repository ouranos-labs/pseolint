import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditSummary } from "@pseolint/core";
import { SeverityDemotions } from "./severity-demotions";

/** Minimal AuditSummary stub — only the fields SeverityDemotions reads. */
function makeSummary(over: Partial<AuditSummary>): AuditSummary {
  return over as AuditSummary;
}

describe("SeverityDemotions", () => {
  it("renders nothing when appliedSeverityDemotions is absent", () => {
    const html = renderToStaticMarkup(<SeverityDemotions summary={makeSummary({})} />);
    expect(html).toBe("");
  });

  it("renders nothing when appliedSeverityDemotions is empty", () => {
    const html = renderToStaticMarkup(
      <SeverityDemotions summary={makeSummary({ appliedSeverityDemotions: [] })} />,
    );
    expect(html).toBe("");
  });

  it("lists the demoted rule ids and the profile name when present", () => {
    const html = renderToStaticMarkup(
      <SeverityDemotions
        summary={makeSummary({
          appliedSeverityDemotions: ["aeo/citable-facts", "aeo/answer-first"],
          siteClassification: {
            type: "programmatic-directory",
            confidence: 0.9,
            signals: [],
            suppressedRules: [],
          },
        })}
      />,
    );
    expect(html).toContain("aeo/citable-facts");
    expect(html).toContain("aeo/answer-first");
    expect(html).toContain("programmatic-directory");
    expect(html).toContain("2 rules softened");
  });

  it("falls back to generic profile copy when classification is absent", () => {
    const html = renderToStaticMarkup(
      <SeverityDemotions
        summary={makeSummary({ appliedSeverityDemotions: ["spam/thin-content"] })}
      />,
    );
    expect(html).toContain("spam/thin-content");
    expect(html).toContain("1 rule softened");
    expect(html).toContain("active scoring profile");
  });
});
