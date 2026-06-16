import { load } from "cheerio";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import { extractFirstParagraph } from "./answer-first.js";

export interface SummaryBaitOptions {
  /** Words considered "the opener" for fact-distribution analysis. Default: 150. */
  openerWordCount?: number;
  /** Fraction of citable facts that, when packed into the opener, triggers the rule. Default: 0.7. */
  openerFactConcentrationThreshold?: number;
  /** Minimum distinct facts on the page before the distribution check runs. Default: 3. */
  minFactsToAnalyze?: number;
}

// Same fact extractors as aeo/citable-facts — intentionally duplicated so this
// rule is self-contained and doesn't silently break if citable-facts's regexes
// drift. Keep in sync when adding new patterns there.
const FACT_PATTERNS: RegExp[] = [
  /\$[\d,]+(\.\d{2})?/g,
  /\b\d+(\.\d+)?\s*%/g,
  /\b\d+(?:-\d+)?\s*(business\s+days?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\bForm\s+[A-Z0-9][A-Z0-9-]*\b/g,
];

const INTERACTIVE_SELECTORS = [
  "form",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "iframe",
  "button[type=submit]",
  "canvas",
  "[data-interactive]",
  "[data-calculator]",
  "[data-tool]",
  "[data-widget]",
  "[x-data]",
  ".calculator",
  ".tool",
  ".checker",
  ".generator",
  ".interactive",
  ".widget",
  ".comparator",
];
const DOWNLOAD_PATTERN = /\.(pdf|docx?|xlsx?|csv|zip|pptx?)(?:$|[?#])/i;

function extractFacts(text: string): string[] {
  const out = new Set<string>();
  for (const re of FACT_PATTERNS) {
    const matches = text.match(re);
    if (!matches) continue;
    for (const m of matches) out.add(m.trim().toLowerCase());
  }
  return Array.from(out);
}

function applyEntityMask(text: string, patterns: EntityMaskPattern[]): string {
  let out = text;
  for (const p of patterns) out = out.replace(p.pattern, p.placeholder);
  return out;
}

function openerHasExtractableAnswer(html: string): boolean {
  // Echo of aeo/answer-first's minimum bar: an opener exists, it has at least
  // one concrete fact, and it's a complete sentence. If the opener is already
  // broken, aeo/answer-first fires and the user sees that diagnosis; this rule
  // stays silent so we don't produce two overlapping findings per page.
  const opener = extractFirstParagraph(html);
  if (!opener) return false;
  const hasFact = FACT_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(opener);
  });
  const isCompleteSentence = /[.!?]\s*$/.test(opener.trim()) && opener.split(/\s+/).length >= 8;
  return hasFact && isCompleteSentence;
}

function pageHasNonReplicableValue(html: string, contentText: string): boolean {
  const $ = load(html);
  for (const sel of INTERACTIVE_SELECTORS) {
    try {
      if ($(sel).length > 0) return true;
    } catch { /* invalid selector */ }
  }
  if (/\bdata-(reactroot|react-[\w-]+|vue-[\w-]+|v-[\w-]+|svelte-[\w-]+)\b/i.test(html)) return true;
  let hasDownload = false;
  $("a[href]").each((_, el) => {
    if (hasDownload) return false;
    const href = $(el).attr("href") ?? "";
    if (DOWNLOAD_PATTERN.test(href) || /[?&]format=(pdf|docx?|xlsx?|csv)\b/i.test(href)) {
      hasDownload = true;
      return false;
    }
    if ($(el).attr("download") !== undefined) {
      hasDownload = true;
      return false;
    }
    return undefined;
  });
  if (hasDownload) return true;
  return /\b(sign\s*(in|up)|log\s*in)\s+to\s+(read|access|view|download|continue)/i.test(contentText);
}

/**
 * Composite rule — fires when a page is "optimized for summarization, not retention":
 *   1. Has a strong answer-first opener (AI Overviews will cite it), AND
 *   2. Has no interactive / downloadable / gated value below the fold, AND
 *   3. Has its citable facts concentrated in the opener (nothing deeper to scroll for).
 *
 * The overlap of these three is the worst-case zero-click page: readers (and AI engines)
 * get everything they need from the summary, and the click-through never happens.
 */
export function summaryBaitRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: SummaryBaitOptions,
): RuleResult[] {
  const openerWords = options?.openerWordCount ?? 150;
  const threshold = options?.openerFactConcentrationThreshold ?? 0.7;
  const minFacts = options?.minFactsToAnalyze ?? 3;
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!openerHasExtractableAnswer(page.html)) continue;
    if (pageHasNonReplicableValue(page.html, page.contentText)) continue;

    const maskedFull = applyEntityMask(page.contentText, entityPatterns);
    const openerText = maskedFull.split(/\s+/).slice(0, openerWords).join(" ");

    const fullFacts = extractFacts(maskedFull);
    if (fullFacts.length < minFacts) continue;

    const openerFacts = extractFacts(openerText);
    const concentration = openerFacts.length / fullFacts.length;
    if (concentration < threshold) continue;

    findings.push({
      ruleId: "aeo/summary-bait",
      // Warning, not error: this is a forecast — we measure what AI MIGHT do (cite
      // without sending the click), not what it WILL do for any given page. An
      // error severity would overstate a probabilistic, page-shape signal.
      severity: "warning",
      confidence: "medium",
      message:
        `${page.url} is optimized for summarization, not retention. ` +
        `${Math.round(concentration * 100)}% of citable facts (${openerFacts.length}/${fullFacts.length}) ` +
        `sit in the first ${openerWords} words, the page has no interactive / downloadable / gated value ` +
        `below the fold, and the opener passes answer-first. AI Overviews are likely to cite this page ` +
        `without sending the click — this is a forecast based on page shape, not a guarantee.`,
      pageUrl: page.url,
      fix:
        `Redistribute value across the page so the full answer requires scrolling: ` +
        `(1) move the interactive element — calculator, checklist, comparison tool, generator, ` +
        `downloadable asset — above the fold, or at least into a prominent section below the opener; ` +
        `(2) push a portion of the citable facts into a "Details" / "Requirements" / "Full breakdown" ` +
        `section deeper on the page; ` +
        `(3) add non-replicable value the summary can't carry (worked examples, user-specific calculations, ` +
        `gated templates). ` +
        `A good opener plus no deeper value guarantees zero-click traffic loss.`,
    });
  }

  return findings;
}
