import { describe, expect, it } from "vitest";
import { enrichFindings } from "../src/enrich-findings.js";
import type { ParsedPage, RuleResult } from "../src/types.js";

/**
 * Regression: a large, densely cross-linked site (the 351-page podcurator
 * repro) crashed report generation with
 *   RangeError: Maximum call stack size exceeded
 *
 * Root cause: clusterable rules (`spam/near-duplicate`, `spam/entity-swap`,
 * `spam/doorway-pattern`) emit ONE finding per related pair, so a single
 * fully-connected near-duplicate component produces C(N,2) pairwise findings.
 * `enrichFindings` then collapsed each component and computed the similarity
 * range via `Math.min(...similarities)` / `Math.max(...similarities)`. The
 * spread operator passes every array element as a separate call argument, and
 * V8 caps the argument count (~131072) — so an array of tens/hundreds of
 * thousands of pairwise similarities overflowed the call stack while building
 * the cluster finding (i.e. "while writing the report").
 *
 * These tests build pathological synthetic inputs (no network, no dev server)
 * whose pair count is well above the spread-argument limit on any engine, then
 * run them through the public `enrichFindings` entry.
 */

function makePage(url: string): ParsedPage {
  return {
    url,
    title: url,
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: {
      metaAuthor: "",
      schemaAuthor: false,
      bylineElement: false,
      relAuthorLink: false,
    },
    contentText: "shared boilerplate content for every page in the cluster",
    html: "<html><body>shared boilerplate content</body></html>",
  };
}

/**
 * Build a single fully-connected near-duplicate component of `n` pages:
 * every distinct pair (i < j) emits one finding, i.e. C(n,2) findings that
 * union into ONE component spanning all n pages.
 */
function fullyConnectedNearDuplicateFindings(n: number): RuleResult[] {
  const findings: RuleResult[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      findings.push({
        ruleId: "spam/near-duplicate",
        severity: "critical",
        message: `page-${i} and page-${j} are near-duplicates.`,
        pageUrl: `https://site.test/page-${i}`,
        relatedUrls: [`https://site.test/page-${j}`],
        // Vary similarity so min !== max and the range is meaningful.
        similarity: 0.8 + ((i + j) % 20) / 100,
      });
    }
  }
  return findings;
}

describe("enrichFindings — large dense cluster (stack-overflow regression)", () => {
  // n=600 -> C(600,2) = 179700 pairs, comfortably above V8's ~131072
  // spread-argument cap on every supported engine.
  const N = 600;

  it("does not overflow the call stack on a fully-connected near-duplicate component", () => {
    const pages = Array.from({ length: N }, (_, i) =>
      makePage(`https://site.test/page-${i}`),
    );
    const findings = fullyConnectedNearDuplicateFindings(N);

    // C(N,2) findings, all in one component.
    expect(findings.length).toBe((N * (N - 1)) / 2);

    let result: ReturnType<typeof enrichFindings> | undefined;
    expect(() => {
      result = enrichFindings(findings, pages);
    }).not.toThrow();

    // Output is preserved: exactly one near-duplicate cluster of all N pages.
    const clusters = result!.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(1);
    const ctx = clusters[0].context!;
    expect(ctx.type).toBe("cluster");
    if (ctx.type === "cluster") {
      expect(ctx.clusterSize).toBe(N);
      expect(ctx.members).toHaveLength(N);
      // similarityRange must be the true [min, max] over all pairs.
      const sims = findings.map((f) => f.similarity!);
      expect(ctx.similarityRange[0]).toBeCloseTo(Math.min(...sliceMin(sims)), 10);
      expect(ctx.similarityRange[1]).toBeCloseTo(Math.max(...sliceMin(sims)), 10);
    }
  });
});

/**
 * Reduce a large array to its handful of extreme values so the *test's own*
 * assertions never themselves spread a huge array into Math.min/Math.max
 * (which would reproduce the very bug we're guarding against, but in the test).
 */
function sliceMin(arr: number[]): number[] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of arr) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}
