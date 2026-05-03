import type { ParsedPage, RuleResult } from "../../types.js";
import type { PairMatch } from "./near-duplicate.js";

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

export function doorwayPatternRule(
  nearDuplicatePairs: PairMatch[],
  entitySwapPairs: PairMatch[],
  thinContentUrls: Set<string>,
  pages?: ParsedPage[]
): RuleResult[] {
  const entitySet = new Set(entitySwapPairs.map((pair) => pairKey(pair.leftUrl, pair.rightUrl)));
  const findings: RuleResult[] = [];

  const pageMap = new Map<string, ParsedPage>();
  if (pages) {
    for (const p of pages) {
      pageMap.set(p.url, p);
    }
  }

  // 2026-05-03 calibration finding: catalog directories (Zapier integrations,
  // Segment source/destination pages, Wise currency pairs) are by-design
  // near-duplicate + entity-swap + identical-structure. With the old ≥3-of-5
  // threshold, that triple alone fired this rule on every pair — generating
  // C(N,2) critical findings on catalogs that ship in production and rank.
  // The fix reframes the gate: structural similarity alone never converts a
  // near-dup/entity-swap pair into a doorway finding. We additionally require
  // a CONTENT-QUALITY signal (thin content OR identical metaDescription),
  // because real doorways degenerate on at least one of those — catalog
  // records, by contrast, have unique per-record body text and per-record
  // metas. See docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md.
  for (const pair of nearDuplicatePairs) {
    const key = pairKey(pair.leftUrl, pair.rightUrl);
    if (!entitySet.has(key)) {
      continue;
    }

    const left = pair.leftUrl < pair.rightUrl ? pair.leftUrl : pair.rightUrl;
    const right = pair.leftUrl < pair.rightUrl ? pair.rightUrl : pair.leftUrl;
    const signals: string[] = ["near-duplicate", "entity-swap"];

    const isThin = thinContentUrls.has(left) || thinContentUrls.has(right);
    if (isThin) {
      signals.push("thin-content");
    }

    const leftPage = pageMap.get(left);
    const rightPage = pageMap.get(right);

    if (leftPage && rightPage && leftPage.structureSignature === rightPage.structureSignature) {
      signals.push("identical-structure");
    }

    const isIdenticalMeta = Boolean(
      leftPage && rightPage && leftPage.metaDescription && rightPage.metaDescription &&
      leftPage.metaDescription === rightPage.metaDescription,
    );
    if (isIdenticalMeta) {
      signals.push("identical-meta");
    }

    // Require ≥3 total AND at least one content-quality signal beyond the
    // structural pair (near-dup + entity-swap + identical-structure is the
    // catalog shape; not enough on its own to call a doorway).
    if (signals.length < 3 || (!isThin && !isIdenticalMeta)) {
      continue;
    }

    findings.push({
      ruleId: "spam/doorway-pattern",
      severity: "critical",
      message: `${left} and ${right} match doorway-pattern signals (${signals.join(" + ")}).`,
      // 2026-05-03 calibration credibility fix: emit in the same pair-shape
      // as `spam/near-duplicate` (pageUrl + relatedUrls=[other]) so the
      // enrich-findings cluster pass collapses C(N,2) findings into one
      // cluster finding per template-tied group. Without this, Segment's
      // 276-pair audit produced 276 separate "doorway" lines in the report,
      // overwhelming users.
      pageUrl: left,
      relatedUrls: [right],
      similarity: pair.similarity,
      fix: "This page matches multiple spam signals. Prioritize adding unique, substantive content and differentiating the page structure."
    });
  }

  return findings;
}
