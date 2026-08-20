import type { ParsedPage, RuleResult, Severity } from "../../types.js";
import { hasAuthoritativeCitation } from "../../algorithms/fact-extraction.js";
import { countSignalCategories } from "./eeat-signals.js";

const RULE_ID = "content/value-add";

interface Signals {
  originality: number;
  freshness: number;
  facts: number;
  eeat: number;
  translation: number;
  clicheReuse: number;
  wikipediaParaphrase: number;
}

function computeSignals(page: ParsedPage, allFindings: RuleResult[]): Signals {
  const pageFindings = allFindings.filter((f) => f.pageUrl === page.url);

  // Originality: 1.0 if regurgitated-content doesn't fire, 0.0 if it does
  const hasRegurgitated = pageFindings.some((f) => f.ruleId === "content/regurgitated-content");
  const originality = hasRegurgitated ? 0.0 : 1.0;

  // Freshness: based on aeo/freshness-signals severity
  const freshnessFinding = pageFindings.find((f) => f.ruleId === "aeo/freshness-signals");
  let freshness: number;
  if (!freshnessFinding) {
    freshness = 1.0;
  } else if (freshnessFinding.severity === "warning") {
    freshness = 0.5;
  } else {
    freshness = 0.0;
  }

  // Citable facts: based on aeo/citable-facts severity
  const factsFinding = pageFindings.find((f) => f.ruleId === "aeo/citable-facts");
  let facts: number;
  if (!factsFinding) {
    facts = 1.0;
  } else if (factsFinding.severity === "info" || factsFinding.severity === "warning") {
    facts = 0.5;
  } else {
    facts = 0.0;
  }

  // E-E-A-T: continuous fraction of 4 categories present.
  // Reuses countSignalCategories from eeat-signals (no duplicate logic).
  // Also grants the "sources" credit for authoritative outbound citations.
  const eeatCount = countSignalCategories(page);
  const hasCitation = hasAuthoritativeCitation(page.resolvedHrefs, page.url);
  // Clamp to max 4 after adding citation credit (if sources category already counted it won't double-count)
  const effectiveEeatCount = Math.min(4, eeatCount + (hasCitation && eeatCount < 4 ? 1 : 0));
  const eeat = effectiveEeatCount / 4;

  // Translation: 1.0 unless translation-no-op lists this page
  const hasTranslationNoOp = allFindings.some(
    (f) => f.ruleId === "content/translation-no-op" &&
      (f.pageUrl === page.url || (f.relatedUrls ?? []).includes(page.url)),
  );
  const translation = hasTranslationNoOp ? 0.0 : 1.0;

  // Cliché reuse (signal 6): 1.0 if common-phrase-reuse doesn't fire, 0.0 if it does
  const hasClicheReuse = pageFindings.some((f) => f.ruleId === "content/common-phrase-reuse");
  const clicheReuse = hasClicheReuse ? 0.0 : 1.0;

  // Wikipedia paraphrase (signal 7): 1.0 if wikipedia-paraphrase doesn't fire, 0.0 if it does
  const hasWikipediaParaphrase = pageFindings.some((f) => f.ruleId === "content/wikipedia-paraphrase");
  const wikipediaParaphrase = hasWikipediaParaphrase ? 0.0 : 1.0;

  return { originality, freshness, facts, eeat, translation, clicheReuse, wikipediaParaphrase };
}

function meanScore(signals: Signals): number {
  const values = [
    signals.originality,
    signals.freshness,
    signals.facts,
    signals.eeat,
    signals.translation,
    signals.clicheReuse,
    signals.wikipediaParaphrase,
  ];
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Two-band severity for the composite score:
 *   - score in [0.35, 0.5)  → "warning"  (borderline: page is weak but not egregiously thin)
 *   - score < 0.35           → "error"    (clearly low value-add)
 *
 * Confidence scales with distance from the fire threshold:
 *   - score < 0.2            → "high"
 *   - score in [0.2, 0.35)   → "medium"
 *   - score in [0.35, 0.5)   → "low"     (borderline warning)
 */
function severityAndConfidence(score: number): { severity: Severity; confidence: "high" | "medium" | "low" } {
  if (score >= 0.35) {
    return { severity: "warning", confidence: "low" };
  }
  if (score < 0.2) {
    return { severity: "error", confidence: "high" };
  }
  return { severity: "error", confidence: "medium" };
}

function buildMessage(page: ParsedPage, score: number, signals: Signals): string {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const worstSignals: string[] = [];
  const entries = Object.entries(signals) as [keyof Signals, number][];
  for (const [key, val] of entries) {
    if (val < 0.5) worstSignals.push(key);
  }
  const worstLabel = worstSignals.length > 0 ? worstSignals.join(", ") : "multiple signals";
  return (
    `${page.url}: value-add score ${pct(score)}, composite of ` +
    `[originality: ${pct(signals.originality)}, freshness: ${pct(signals.freshness)}, ` +
    `facts: ${pct(signals.facts)}, E-E-A-T: ${pct(signals.eeat)}, translation: ${pct(signals.translation)}, ` +
    `cliché-reuse: ${pct(signals.clicheReuse)}, wikipedia-paraphrase: ${pct(signals.wikipediaParaphrase)}]. ` +
    `The page lacks ${worstLabel}; pages without proprietary value-add are demoted by SpamBrain.`
  );
}

/**
 * content/value-add: second-pass composite rule.
 *
 * Reads from existing findings instead of parsing pages directly.
 * Aggregates 7 per-page signal scores (originality, freshness, facts,
 * E-E-A-T, translation, cliché-reuse, wikipedia-paraphrase) into a
 * single 0-1 quality score. Each signal weighted equally at 1/7 ≈ 14.3%.
 *
 * E-E-A-T sub-score is a continuous fraction (categoriesPresent/4), not
 * a 3-step value. Reuses countSignalCategories from eeat-signals to avoid
 * logic drift between the two rules.
 *
 * Fires ONE finding per page when score < 0.5:
 *   - warning  (score ∈ [0.35, 0.5)): borderline, low confidence
 *   - error    (score < 0.35): clearly low value-add
 */
export function valueAddRule(pages: ParsedPage[], findings: RuleResult[]): RuleResult[] {
  const results: RuleResult[] = [];

  for (const page of pages) {
    const signals = computeSignals(page, findings);
    const score = meanScore(signals);
    if (score >= 0.5) continue;

    const { severity, confidence } = severityAndConfidence(score);
    results.push({
      ruleId: RULE_ID,
      severity,
      confidence,
      message: buildMessage(page, score, signals),
      fix: "Add proprietary content (original analysis, primary-source data, expert commentary, original imagery) to lift the value-add score above 0.5. Score is a composite, improve any underweight signal.",
      pageUrl: page.url,
    });
  }

  return results;
}
