import type { ParsedPage, RuleResult, EntityMaskPattern } from "../../types.js";
import { maskEntities } from "../../algorithms/entity-mask.js";

export interface UniqueValueThresholds {
  /** Unique-content density below this fires (info). Default 0.20. */
  passBelow: number;
  /** Density below this escalates to error. Default 0.12. */
  errorBelow: number;
}

function tokenize(text: string): string[] {
  // Lowercase, split on whitespace, strip edge punctuation so "word", "word."
  // and "(word)" are one token.
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/**
 * Originality as a corpus-relative DENSITY, not an absolute count. Each distinct
 * token is weighted by normalized IDF (ln(N/df)/ln(N)) — 1 if page-exclusive, ~0
 * if on every page — and averaged over the page's distinct tokens. A near-
 * duplicate / boilerplate page scores low regardless of corpus size or length; a
 * large original page stays high. Continuous, so it doesn't shuffle at the margin.
 * Volume is spam/thin-content's job; exact twins are spam/near-duplicate's.
 */
export function uniqueValueRule(
  pages: ParsedPage[],
  thresholds: UniqueValueThresholds,
  entityPatterns: EntityMaskPattern[] = [],
): RuleResult[] {
  const { passBelow, errorBelow } = thresholds;
  const N = pages.length;
  const lnN = Math.log(N);
  if (N <= 1 || lnN === 0) return []; // can't measure rarity against a single page

  // Mask entities (names, numbers, dates) before measuring rarity. Otherwise a
  // scaled-content farm — same template skeleton, swapped entity per page —
  // scores HIGH density because each page's entity tokens are page-exclusive.
  // Masking collapses the swapped entities so the residual measures originality
  // of the *non-entity* prose: templated skeleton -> low, genuine analysis -> high.
  const df = new Map<string, number>();
  const pageDistinct = pages.map((p) => new Set(tokenize(maskEntities(p.contentText, entityPatterns))));
  for (const distinct of pageDistinct) {
    for (const t of distinct) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const findings: RuleResult[] = [];
  pages.forEach((page, i) => {
    const distinct = pageDistinct[i];
    if (distinct.size === 0) return; // empty page → thin-content handles it
    let mass = 0;
    for (const t of distinct) mass += Math.log(N / (df.get(t) ?? 1)) / lnN;
    const density = mass / distinct.size;
    if (density >= passBelow) return;

    const severity = density < errorBelow ? "error" : "info";
    const pct = (density * 100).toFixed(1);
    findings.push({
      ruleId: "content/unique-value",
      severity,
      message:
        `${page.url} has low unique-content density ${density.toFixed(3)} ` +
        `(${pct}% of its ${distinct.size} distinct words are page-distinctive; floor ${passBelow.toFixed(2)}). ` +
        `Most of its vocabulary also appears on other pages.`,
      pageUrl: page.url,
      fix:
        `Raise originality density: add page-specific text — a distinct lead, this ` +
        `record's own facts, page-specific examples. Content repeated across pages on ` +
        `the same axis (boilerplate, shared legal/spec blocks, per-axis data like a ` +
        `role's regulations across that role's documents) is common vocabulary and ` +
        `does NOT raise density, even when it is useful.`,
    });
  });
  return findings;
}
