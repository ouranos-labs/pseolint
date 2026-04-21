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
      message: `${page.url} contains FAQ-style content (${detail}) but no FAQPage/HowTo JSON-LD.`,
      pageUrl: page.url,
      fix:
        `Add FAQPage JSON-LD that mirrors the existing Q&A content. For pSEO templates, generate the ` +
        `schema programmatically from the same data source that renders the headings — don't ship identical ` +
        `questions with only the entity name swapped.`,
    });
  }

  return findings;
}
