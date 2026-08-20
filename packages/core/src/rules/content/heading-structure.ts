import type { ParsedPage, RuleResult } from "../../types.js";

const MIN_BODY_WORDS_FOR_H2_REQUIREMENT = 600;

/**
 * content/heading-structure: three checks:
 *   1. Pages missing an <h1> entirely (severity: error: almost always a
 *      template bug or a misconfigured CMS).
 *   2. Pages with multiple <h1> elements (severity: warning: accessibility
 *      anti-pattern + ambiguous primary topic signal).
 *   3. Long pages (>600 words) with no <h2> sub-structure (severity: info
 *: readability / Featured Snippet eligibility issue).
 *
 * Kept separate from `content/title-uniqueness` because heading hierarchy
 * is a different signal (Google reads H1+H2 to understand topic
 * structure) and has a different fix path.
 *
 * The 2026-05-03 blind-spot audit named the previously-phantom
 * `content/heading-uniqueness` as a gap; this is the corrected rule
 * (heading STRUCTURE, not uniqueness: duplicate H1s across catalog
 * pages aren't actually a problem the way duplicate titles are).
 */
export function headingStructureRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const h1Count = page.headings.h1.length;
    const h2Count = page.headings.h2.length;
    const wordCount = (page.contentText ?? "").trim().split(/\s+/).filter(Boolean).length;

    if (h1Count === 0) {
      findings.push({
        ruleId: "content/heading-structure",
        severity: "error",
        message: `${page.url} has no <h1> element.`,
        pageUrl: page.url,
        fix: "Add a single <h1> that names the page's primary topic. Google uses H1 to disambiguate when the title tag is unclear.",
      });
    } else if (h1Count > 1) {
      findings.push({
        ruleId: "content/heading-structure",
        severity: "warning",
        message: `${page.url} has ${h1Count} <h1> elements.`,
        pageUrl: page.url,
        fix: "Use a single <h1> per page. Demote the others to <h2>. HTML5 'document outline' tolerates multiple H1s in theory, but every accessibility checker and several SEO heuristics still expect one.",
      });
    }

    if (wordCount >= MIN_BODY_WORDS_FOR_H2_REQUIREMENT && h2Count === 0) {
      findings.push({
        ruleId: "content/heading-structure",
        severity: "info",
        message: `${page.url} has ${wordCount} words but no <h2> sub-structure.`,
        pageUrl: page.url,
        fix: "Break long pages into sections with <h2> sub-headings. Sub-headings drive Featured Snippet eligibility and improve scannability.",
      });
    }
  }

  return findings;
}
