import type { ParsedPage, RuleResult } from "../../types.js";

export interface FaqCoverageOptions {
  /** URL substring/glob fragments that signal question intent. */
  questionPatterns?: string[];
  /** Minimum number of question-style headings to trigger the check (default: 2). */
  minQuestionHeadings?: number;
}

const DEFAULT_URL_PATTERNS = ["/how-to-", "/what-is-", "/guide-", "-faq", "/faq", "/questions"];

const QUESTION_STARTERS =
  /^\s*(how|what|why|when|where|who|can|does|do|is|are|should|which|will|could|would|may)\b/i;

function isQuestionHeading(heading: string): boolean {
  const trimmed = heading.trim();
  if (!trimmed) return false;
  return trimmed.endsWith("?") || QUESTION_STARTERS.test(trimmed);
}

/**
 * Any of these types means the page already carries its question/answer pairs
 * in a machine-readable form, so a crawl has nothing further to say about it.
 *
 * Note what this does NOT mean: that the markup earns a Google rich result.
 * Google removed the FAQ rich result from Search on 2026-05-07 (changelog
 * 2026-05-08) and deleted the FAQPage documentation on 2026-06-15, and the
 * HowTo rich result went the same way. QAPage still has a live rich result but
 * Google documents it as being for pages where "users must be able to submit
 * answers", explicitly not for a site's own FAQ. So this rule recommends the
 * visible-content fix, never the markup. See docs/folklore.md.
 * https://developers.google.com/search/updates#removing-faq-rich-result
 */
function hasFaqLikeSchema(entries: unknown[]): boolean {
  const stack: unknown[] = [...entries];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "FAQPage" || type === "HowTo" || type === "QAPage") return true;
    if (Array.isArray(type) && type.some((t) => t === "FAQPage" || t === "HowTo" || t === "QAPage")) {
      return true;
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) stack.push(item);
      } else if (value !== null && typeof value === "object") {
        stack.push(value);
      }
    }
  }
  return false;
}

function urlLooksLikeFaq(url: string, patterns: string[]): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return patterns.some((p) => path.includes(p));
  } catch {
    const lower = url.toLowerCase();
    return patterns.some((p) => lower.includes(p));
  }
}

export function faqCoverageRule(
  pages: ParsedPage[],
  options?: FaqCoverageOptions,
): RuleResult[] {
  const patterns = options?.questionPatterns ?? DEFAULT_URL_PATTERNS;
  const minQuestions = options?.minQuestionHeadings ?? 2;
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const questionHeadings = page.headings.h2.filter(isQuestionHeading);
    const urlSignalsFaq = urlLooksLikeFaq(page.url, patterns);

    if (!urlSignalsFaq && questionHeadings.length < minQuestions) continue;
    if (hasFaqLikeSchema(page.jsonLd)) continue;

    const sampleList = questionHeadings.slice(0, 3).map((h) => `"${h.trim()}"`).join(", ");
    const detail = questionHeadings.length > 0
      ? `${questionHeadings.length} question-style heading${questionHeadings.length === 1 ? "" : "s"}${sampleList ? ` (e.g. ${sampleList})` : ""}`
      : `URL path matches an FAQ pattern`;

    findings.push({
      ruleId: "aeo/faq-coverage",
      severity: "info",
      // Always medium: detecting FAQ-shape from H2 phrasing + URL is heuristic, some
      // pages with question-style headings aren't actually FAQ content (e.g. blog
      // posts titled "How we built X").
      confidence: "medium",
      message:
        `${page.url} reads as FAQ content (${detail}) but carries no machine-readable question/answer pairs.`,
      pageUrl: page.url,
      fix:
        `Fix this in the visible page, not in markup: give each question its own heading and put the ` +
        `complete answer in the first paragraph directly beneath it, so an answer engine can lift a whole ` +
        `question/answer pair without reassembling it. Do NOT add FAQPage JSON-LD expecting a rich result: ` +
        `Google removed the FAQ rich result from Search on 2026-05-07 and deleted its documentation on ` +
        `2026-06-15, and QAPage is documented as being only for pages where users can submit answers, not ` +
        `for a site's own FAQ. If a non-Google consumer of your schema needs the markup, generate it from ` +
        `the same per-record data that renders the headings: don't ship identical questions with only the ` +
        `entity name swapped.`,
    });
  }

  return findings;
}
