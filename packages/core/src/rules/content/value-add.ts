import type { ParsedPage, RuleResult, Severity } from "../../types.js";
import { hasAuthoritativeCitation } from "../../algorithms/fact-extraction.js";

const RULE_ID = "content/value-add";

const EEAT_HTML_PATTERNS = [
  /last\s+updated/i,
  /last\s+modified/i,
  /reviewed\s+by/i,
  /\bsources:/i,
  /\breferences:/i,
];

function countEeatCategories(page: ParsedPage): number {
  let count = 0;
  if (page.resolvedHrefs.some((h) => /\/about\b/i.test(h))) count += 1;
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  if (metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink) count += 1;
  if (page.publishedDate) count += 1;
  if (
    EEAT_HTML_PATTERNS.some((p) => p.test(page.html)) ||
    hasAuthoritativeCitation(page.resolvedHrefs, page.url)
  ) count += 1;
  return count;
}

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

  // E-E-A-T: based on signal count
  const eeatCount = countEeatCategories(page);
  let eeat: number;
  if (eeatCount >= 4) {
    eeat = 1.0;
  } else if (eeatCount >= 2) {
    eeat = 0.5;
  } else {
    eeat = 0.0;
  }

  // Translation: 1.0 unless translation-no-op lists this page
  const hasTranslationNoOp = allFindings.some(
    (f) => f.ruleId === "content/translation-no-op" &&
      (f.pageUrl === page.url || (f.relatedUrls ?? []).includes(page.url)),
  );
  const translation = hasTranslationNoOp ? 0.0 : 1.0;

  // Cliché reuse (signal 6): 1.0 if common-phrase-reuse doesn't fire, 0.0 if it does
  const hasClicheReuse = pageFindings.some((f) => f.ruleId === "content/common-phrase-reuse");
  const clicheReuse = hasClicheReuse ? 0.0 : 1.0;

  // Wikipedia paraphrase (signal 7, v0.5.14): 1.0 if wikipedia-paraphrase doesn't
  // fire on this page, 0.0 if it does. The rule fires at warning/low when
  // page text overlaps ≥40% with the bundled trigram corpus — a real signal
  // for "content lifted from Wikipedia," orthogonal to the other 6 originality
  // proxies. Adding it shifts each signal's weight from 1/6 (16.7%) to 1/7
  // (14.3%) — boundary cases at score=0.30 and score=0.50 may shift by
  // ±0.024 per signal, which is below the granularity of severity bands.
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

function severityForScore(score: number): Severity {
  if (score < 0.3) return "critical";
  return "error";
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
    `${page.url}: value-add score ${pct(score)} — composite of ` +
    `[originality: ${pct(signals.originality)}, freshness: ${pct(signals.freshness)}, ` +
    `facts: ${pct(signals.facts)}, E-E-A-T: ${pct(signals.eeat)}, translation: ${pct(signals.translation)}, ` +
    `cliché-reuse: ${pct(signals.clicheReuse)}, wikipedia-paraphrase: ${pct(signals.wikipediaParaphrase)}]. ` +
    `The page lacks ${worstLabel}; pages without proprietary value-add are demoted by SpamBrain.`
  );
}

/**
 * content/value-add — second-pass composite rule.
 *
 * Reads from existing findings instead of parsing pages directly.
 * Aggregates 7 per-page signal scores (originality, freshness, facts,
 * E-E-A-T, translation, cliché-reuse, wikipedia-paraphrase) into a
 * single 0-1 quality score. Each signal weighted equally at 1/7 ≈ 14.3%.
 * Fires ONE critical/error finding per page when score < 0.5
 * (critical < 0.3, error otherwise).
 */
export function valueAddRule(pages: ParsedPage[], findings: RuleResult[]): RuleResult[] {
  const results: RuleResult[] = [];

  for (const page of pages) {
    const signals = computeSignals(page, findings);
    const score = meanScore(signals);
    if (score >= 0.5) continue;

    results.push({
      ruleId: RULE_ID,
      severity: severityForScore(score),
      confidence: "medium",
      message: buildMessage(page, score, signals),
      fix: "Add proprietary content (original analysis, primary-source data, expert commentary, original imagery) to lift the value-add score above 0.5. Score is a composite — improve any underweight signal.",
      pageUrl: page.url,
    });
  }

  return results;
}
