import type { ParsedPage, RuleResult } from "../../types.js";
import { proseTextExcludingExamples } from "../../algorithms/example-regions.js";

const RULE_ID = "content/common-phrase-reuse";

/**
 * Detects overuse of pSEO marketing clichés in page body content.
 * Fires when >=3 distinct clichéd phrases appear in a page's contentText.
 *
 * Phrase corpus organised by category (42 total):
 *
 * Location clichés (~10):
 *   "in the heart of", "gateway to", "hidden gem", "must-see",
 *   "off the beaten path", "tucked away", "stone's throw from",
 *   "right in the heart of", "epicentre of", "nestled between"
 *
 * Generic pSEO marketing (~10):
 *   "discover the best", "trusted by thousands", "premier provider",
 *   "your one-stop shop", "perfect destination for", "everything you need",
 *   "leading provider of", "world-class", "unparalleled", "second to none"
 *
 * Aggregator/listing phrases (~8):
 *   "top rated", "highest reviewed", "best of the best",
 *   "comprehensive guide", "ultimate guide to", "complete list of",
 *   "carefully curated", "handpicked selection"
 *
 * Fake authority (~7):
 *   "experts agree", "industry leaders", "trusted source",
 *   "leading authority", "premier source for", "go-to resource",
 *   "experts recommend"
 *
 * Filler hedges (~7):
 *   "varies depending on", "many factors", "depends on your needs",
 *   "several options", "wide variety of", "an array of", "a number of"
 */

// Location clichés
const LOCATION_CLICHÉS = [
  "in the heart of",
  "gateway to",
  "hidden gem",
  "must-see",
  "off the beaten path",
  "tucked away",
  "stone's throw from",
  "right in the heart of",
  "epicentre of",
  "nestled between",
] as const;

// Generic pSEO marketing
const GENERIC_MARKETING = [
  "discover the best",
  "trusted by thousands",
  "premier provider",
  "your one-stop shop",
  "perfect destination for",
  "everything you need",
  "leading provider of",
  "world-class",
  "unparalleled",
  "second to none",
] as const;

// Aggregator/listing phrases
const AGGREGATOR_PHRASES = [
  "top rated",
  "highest reviewed",
  "best of the best",
  "comprehensive guide",
  "ultimate guide to",
  "complete list of",
  "carefully curated",
  "handpicked selection",
] as const;

// Fake authority
const FAKE_AUTHORITY = [
  "experts agree",
  "industry leaders",
  "trusted source",
  "leading authority",
  "premier source for",
  "go-to resource",
  "experts recommend",
] as const;

// Filler hedges
const FILLER_HEDGES = [
  "varies depending on",
  "many factors",
  "depends on your needs",
  "several options",
  "wide variety of",
  "an array of",
  "a number of",
] as const;

const ALL_PHRASES: readonly string[] = [
  ...LOCATION_CLICHÉS,
  ...GENERIC_MARKETING,
  ...AGGREGATOR_PHRASES,
  ...FAKE_AUTHORITY,
  ...FILLER_HEDGES,
];

const FIRE_THRESHOLD = 3;

function findMatchedPhrases(contentText: string): string[] {
  const lower = contentText.toLowerCase();
  return ALL_PHRASES.filter((phrase) => lower.includes(phrase));
}

function buildMessage(url: string, count: number, matchedPhrases: string[]): string {
  const examples = matchedPhrases.slice(0, 3).map((p) => `"${p}"`).join(", ");
  return (
    `${url} reuses ${count} common pSEO marketing clichés (e.g. ${examples}). ` +
    `High cliché density correlates with low value-add per Google's helpful-content guidance.`
  );
}

/**
 * content/common-phrase-reuse — per-page cliché density detector.
 *
 * Scans each page's contentText for a corpus of 42 known pSEO marketing
 * clichés. Fires ONE warning/low-confidence finding per page when >=3 distinct
 * phrases appear. Extends the content/value-add composite as its 6th signal.
 */
export function commonPhraseReuseRule(pages: ParsedPage[]): RuleResult[] {
  const results: RuleResult[] = [];

  for (const page of pages) {
    // Judge the page's OWN prose: strip quoted-example/code regions so a page
    // that *teaches* about clichés (an explainer or style guide) isn't flagged
    // for the examples it quotes. Falls back to contentText when html is absent.
    const prose = proseTextExcludingExamples(page);
    if (!prose) continue;

    const matched = findMatchedPhrases(prose);
    if (matched.length < FIRE_THRESHOLD) continue;

    results.push({
      ruleId: RULE_ID,
      severity: "warning",
      confidence: "low",
      message: buildMessage(page.url, matched.length, matched),
      fix: "Replace generic marketing clichés with specific, substantive claims about this page's actual subject. SpamBrain weights cliché density as a content-quality proxy. Aim for ≤2 per page.",
      pageUrl: page.url,
    });
  }

  return results;
}
