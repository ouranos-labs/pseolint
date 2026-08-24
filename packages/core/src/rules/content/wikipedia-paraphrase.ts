import type { ParsedPage, RuleResult } from "../../types.js";
import { wikipediaParaphraseRate } from "../../algorithms/wikipedia-paraphrase.js";

const RULE_ID = "content/wikipedia-paraphrase";

/**
 * ponytail: MIN_TRIGRAM_COUNT = 200
 *
 * The bloom filter has a ~5% per-query false-positive rate. On a page with
 * N trigrams the expected bloom-noise hit count is 0.05 * N. For a short page
 * (~48 trigrams) that alone produces ~2.4 expected FP hits; with a threshold
 * of 40% (19/48) the noise alone can exceed the threshold on short pages.
 *
 * Setting a floor of 200 trigrams (~202 words) means bloom noise contributes
 * at most 10 / 200 = 5% of trigrams, far below the raised THRESHOLD, so noise
 * cannot trigger the rule on its own.
 */
const MIN_TRIGRAM_COUNT = 200;

/**
 * ponytail: THRESHOLD = 0.55
 *
 * Raised from 0.40 to 0.55 to account for the bloom filter's ~5% per-query
 * FP rate and the "topic overlap" effect: legal/medical/geography pSEO pages
 * share many encyclopedic trigrams ("the united states", "in the state of")
 * purely through topical proximity, not paraphrase. A 55% overlap is
 * substantially above both the noise floor (~5%) and the expected topic-
 * overlap baseline, making the signal meaningfully indicative of genuine
 * encyclopedic reuse. At this level the rule remains advisory (confidence:
 * "low") because trigram overlap cannot distinguish paraphrase from topic
 * proximity: it is a weak signal, not a verdict.
 */
const THRESHOLD = 0.55;

/**
 * content/wikipedia-paraphrase: advisory originality signal (v0.5.14+).
 *
 * Detects pages whose contentText has unusually high trigram overlap with the
 * bundled Wikipedia reference corpus. This is a weak, advisory signal only:
 * trigram overlap cannot distinguish actual paraphrase from legitimate topical
 * proximity (e.g. a legal-template page naturally shares many encyclopedic
 * trigrams with Wikipedia articles on the same topic).
 *
 * Two guards reduce false positives:
 *   1. Minimum-length guard: pages below MIN_TRIGRAM_COUNT trigrams (~200
 *      words) are skipped entirely: bloom noise alone dominates on short pages.
 *   2. Raised threshold: THRESHOLD = 0.55, well above the bloom noise floor
 *      (~5%) and typical topical-proximity baseline.
 *
 * Fires: one warning/low-confidence finding per qualifying page (rate >= 0.55).
 */
export function wikipediaParaphraseRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    if (!page.contentText || page.contentText.trim().length === 0) continue;

    // Estimate trigram count without re-implementing extractTrigrams: count
    // whitespace-separated tokens then subtract 2 (trigrams = tokens - 2).
    // This is a cheap proxy; the algorithm file does the accurate extraction.
    const tokenCount = page.contentText.trim().split(/\s+/).length;
    const estimatedTrigrams = Math.max(0, tokenCount - 2);
    if (estimatedTrigrams < MIN_TRIGRAM_COUNT) continue;

    const rate = wikipediaParaphraseRate(page.contentText);
    if (rate < THRESHOLD) continue;

    const pct = (rate * 100).toFixed(1);
    findings.push({
      ruleId: RULE_ID,
      severity: "warning",
      confidence: "low",
      pageUrl: page.url,
      message:
        `${page.url} has high trigram overlap (${pct}%) with the bundled Wikipedia ` +
        `reference corpus. This is an advisory signal: trigram overlap can reflect ` +
        `topical proximity as well as copied content and cannot distinguish the two.`,
      fix:
        "Review for borrowed encyclopedic phrasing and replace with original analysis " +
        "specific to this page's subject. Even if attributed, high paraphrase rates " +
        "correlate with low value-add by SpamBrain's helpful-content metric.",
    });
  }
  return findings;
}
