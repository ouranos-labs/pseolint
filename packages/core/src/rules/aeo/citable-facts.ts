import type { Confidence, EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import { extractCitableFacts } from "../../algorithms/fact-extraction.js";
import { maskEntities } from "../../algorithms/entity-mask.js";

export interface CitableFactsOptions {
  /** Below this count → error. Default: 3. */
  minFactsPerPage?: number;
  /** At or above this count → pass. Default: 8. */
  targetFactsPerPage?: number;
}

export function citableFactsRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: CitableFactsOptions,
): RuleResult[] {
  const minFacts = options?.minFactsPerPage ?? 3;
  const targetFacts = options?.targetFactsPerPage ?? 8;
  const findings: RuleResult[] = [];

  // Build a global template-fact set: facts that appear verbatim on a majority of pages
  // after entity masking; those are "template facts", not entity-specific data points.
  //
  // Scaling by page count:
  //   n == 1      → no template detection possible, all facts count as entity-specific.
  //   n in 2..=5  → fact is template when it appears on ALL pages (strict).
  //   n > 5       → fact is template when it appears on >= 50% of pages.
  //
  // Earlier cut-off (`> 5 ? ceil(n*0.5) : n + 1`) made small-sample audits silently
  // ignore template facts, so a 3-page audit with "$70" on every page looked clean.
  const templateThreshold =
    pages.length <= 1 ? Infinity :
    pages.length <= 5 ? pages.length :
    Math.ceil(pages.length * 0.5);

  const factFrequency = new Map<string, number>();
  const perPageFacts = new Map<string, string[]>();

  for (const page of pages) {
    const masked = maskEntities(page.contentText, entityPatterns);
    const rawFacts = extractCitableFacts(masked);
    perPageFacts.set(page.url, rawFacts);
    for (const f of rawFacts) {
      factFrequency.set(f, (factFrequency.get(f) ?? 0) + 1);
    }
  }

  const templateFacts = new Set<string>();
  for (const [f, count] of factFrequency.entries()) {
    if (count >= templateThreshold) templateFacts.add(f);
  }

  for (const page of pages) {
    const facts = perPageFacts.get(page.url) ?? [];
    const unique = facts.filter((f) => !templateFacts.has(f));

    if (unique.length >= targetFacts) continue;

    const severity = unique.length < minFacts ? "error" : "warning";
    // Confidence ladder:
    //   0 unique facts → high (almost certainly content-poor)
    //   1-2 facts      → medium (borderline; could be a short-form page)
    //   3-7 facts      → low (warning tier; narrative pages legitimately have fewer concrete numbers)
    const confidence: Confidence =
      unique.length === 0 ? "high" :
      unique.length < minFacts ? "medium" :
      "low";
    const templateDrag = facts.length - unique.length;
    const templateNote = templateDrag > 0
      ? ` (${templateDrag} additional fact${templateDrag === 1 ? "" : "s"} appear on most pages and don't count as entity-specific)`
      : "";
    const lowConfidenceCaveat = confidence === "low"
      ? " Low confidence: prose-style pages can legitimately cite fewer hard numbers, verify whether AI Overview citation matters for this page."
      : "";

    findings.push({
      ruleId: "aeo/citable-facts",
      severity,
      confidence,
      message:
        `${page.url} has ${unique.length} unique citable fact${unique.length === 1 ? "" : "s"}${templateNote}. ` +
        `AI Overviews cite specific numbers and named references.${lowConfidenceCaveat}`,
      pageUrl: page.url,
      fix:
        `Replace vague language ("varies", "several weeks", "affordable", "many options") with ` +
        `specific values a reader or AI engine would cite: exact prices, percentages, dates, ` +
        `timeframes, version numbers, named products, standards, or regulations that apply to this page. ` +
        `For pSEO templates, bind these values from your data source so each page gets ` +
        `entity-specific numbers instead of repeating the same template wording. ` +
        `Target: ${targetFacts}+ unique facts per page.`,
    });
  }

  return findings;
}
