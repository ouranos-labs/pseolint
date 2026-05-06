import type { ParsedPage, RuleResult } from "../../types.js";
import { wikipediaParaphraseRate } from "../../algorithms/wikipedia-paraphrase.js";

const RULE_ID = "content/wikipedia-paraphrase";
const THRESHOLD = 0.4;

/**
 * content/wikipedia-paraphrase — standalone originality signal (v0.5.14).
 *
 * Detects pages whose contentText has high trigram overlap with the curated
 * Wikipedia reference corpus. High overlap indicates paraphrased or verbatim
 * encyclopedic content that adds no proprietary value.
 *
 * Composite integration into content/value-add is deferred to v0.5.15 to
 * avoid test-math recalibration in this release.
 *
 * Fires: one warning/low-confidence finding per qualifying page (rate >= 0.4).
 */
export function wikipediaParaphraseRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    if (!page.contentText || page.contentText.trim().length === 0) continue;
    const rate = wikipediaParaphraseRate(page.contentText);
    if (rate < THRESHOLD) continue;
    const pct = (rate * 100).toFixed(1);
    findings.push({
      ruleId: RULE_ID,
      severity: "warning",
      confidence: "low",
      pageUrl: page.url,
      message:
        `${page.url} contains content with high trigram overlap (${pct}%) against the Wikipedia ` +
        `reference corpus. May indicate paraphrased or copy-pasted Wikipedia content.`,
      fix:
        "Replace borrowed encyclopedic phrasing with original analysis specific to this page's " +
        "subject. Even if attributed, high paraphrase rates correlate with low value-add by " +
        "SpamBrain's helpful-content metric.",
    });
  }
  return findings;
}
