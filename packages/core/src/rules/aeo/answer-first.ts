import { load } from "cheerio";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

export interface AnswerFirstOptions {
  /** First paragraph should fit under this many words to be "extractable". Default: 100. */
  maxFirstParagraphWords?: number;
  /** Opener longer than this is penalized as too long to extract. Default: 150. */
  paragraphTooLongWords?: number;
  /** Minimum score-points for a passing opener. Default: 2. */
  minScoreToPass?: number;
}

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^\s*(welcome\s+to|our\s+(complete|comprehensive|ultimate)|in\s+this\s+(post|article|guide)|home\s*»|skip\s+to)/i,
  /^\s*(generate|create|build)\s+your\s+/i,
];

const NUMBER_PATTERNS: RegExp[] = [
  /\$[\d,]+(\.\d{2})?/,
  /\b\d+(\.\d+)?\s*%/,
  /\b\d+\s*(days?|weeks?|months?|years?|business\s+days?|hours?|minutes?)\b/i,
  /\b(19|20)\d{2}\b/, // years
];

/**
 * "Proper-noun entity" detector. Accepts multi-word proper nouns (e.g. "Secretary of State",
 * "Delaware Division") AND standalone capitalized entities that are not sentence-initial
 * (e.g. "...with the Delaware office", "filed in California").
 */
const MULTI_WORD_PROPER_NOUN = /\b[A-Z][a-z]+(?:\s+(?:of\s+|de\s+|and\s+)?[A-Z][a-z]+)+\b/;
const SINGLE_WORD_PROPER_NOUN = /(?<!^)(?<=\s)[A-Z][a-z]{2,}\b/;
const FORM_PATTERN = /\bForm\s+[A-Z0-9-]+\b/i;

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Extract the first paragraph-ish content block after the H1. Walks the DOM in document
 * order starting at the H1 and finds the next `<p>` with >=5 words that is NOT inside a
 * nav/aside/footer/header/breadcrumb. Falls back to the first qualifying `<p>` inside
 * `main`/`article` if the H1-sibling walk finds nothing.
 */
export function extractFirstParagraph(html: string): string {
  const $ = load(html);
  const h1 = $("h1").first();

  const excludeSel = "nav, aside, footer, header, [role=navigation], .breadcrumbs, .breadcrumb";
  const isExcluded = (el: unknown): boolean => {
    const $el = $(el as never);
    return $el.closest(excludeSel).length > 0;
  };

  const pickFirstQualifyingP = (scope: ReturnType<typeof $>): string | null => {
    let found: string | null = null;
    scope.find("p").each((_, el) => {
      if (found) return false;
      if (isExcluded(el)) return undefined;
      const text = $(el).text().trim();
      if (wordCount(text) >= 5) {
        found = text;
        return false;
      }
      return undefined;
    });
    return found;
  };

  // Walk forward from the H1 through the document, checking every `<p>` that comes after it.
  // cheerio has no compareDocumentPosition; emulate with a boolean gate in document order.
  if (h1.length > 0) {
    const h1El = h1.get(0);
    let passedH1 = false;
    let found: string | null = null;
    $("h1, p").each((_, el) => {
      if (found) return false;
      if (el === h1El) {
        passedH1 = true;
        return undefined;
      }
      if (!passedH1) return undefined;
      const tag = (el as { tagName?: string }).tagName?.toLowerCase?.();
      if (tag !== "p") return undefined;
      if (isExcluded(el)) return undefined;
      const text = $(el).text().trim();
      if (wordCount(text) >= 5) {
        found = text;
        return false;
      }
      return undefined;
    });
    if (found) return found;
  }

  // Fallbacks in order of specificity.
  for (const scope of [$("main").first(), $("article").first(), $("body").first()]) {
    if (scope.length === 0) continue;
    const found = pickFirstQualifyingP(scope);
    if (found) return found;
  }
  return "";
}

function applyEntityMask(text: string, patterns: EntityMaskPattern[]): string {
  let out = text;
  for (const p of patterns) {
    out = out.replace(p.pattern, p.placeholder);
  }
  return out;
}

function hasConcreteFact(text: string): boolean {
  return NUMBER_PATTERNS.some((re) => re.test(text)) || FORM_PATTERN.test(text);
}

function hasNamedEntity(text: string, entityPatterns: EntityMaskPattern[]): boolean {
  if (MULTI_WORD_PROPER_NOUN.test(text)) return true;
  if (SINGLE_WORD_PROPER_NOUN.test(text)) return true;
  // A user-defined entity pattern matching the opener also counts as a named entity —
  // this is how pSEO operators declare their primary entity dimension (states, cities, etc.).
  for (const p of entityPatterns) {
    if (p.pattern.test(text)) {
      // Reset lastIndex for global regexes so subsequent callers see fresh state.
      p.pattern.lastIndex = 0;
      return true;
    }
    p.pattern.lastIndex = 0;
  }
  return false;
}

function hasCompleteSentence(text: string): boolean {
  return /[.!?]\s*$/.test(text.trim()) && wordCount(text) >= 8;
}

function isBoilerplateOpener(text: string): boolean {
  return BOILERPLATE_PATTERNS.some((re) => re.test(text));
}

interface Scored {
  url: string;
  score: number;
  paragraph: string;
  wordCount: number;
  masked: string;
}

export function answerFirstRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: AnswerFirstOptions,
): RuleResult[] {
  const maxWords = options?.maxFirstParagraphWords ?? 100;
  const tooLong = options?.paragraphTooLongWords ?? 150;
  const minPass = options?.minScoreToPass ?? 2;

  const scored: Scored[] = [];
  for (const page of pages) {
    const paragraph = extractFirstParagraph(page.html);
    if (!paragraph) continue;
    const opener = paragraph.split(/\s+/).slice(0, maxWords).join(" ");
    const wc = wordCount(paragraph);

    let score = 0;
    if (hasConcreteFact(opener)) score += 1;
    if (hasNamedEntity(opener, entityPatterns)) score += 1;
    if (hasCompleteSentence(opener)) score += 1;
    if (wc > tooLong) score -= 1;
    if (isBoilerplateOpener(opener)) score -= 2;

    const masked = applyEntityMask(opener, entityPatterns);
    scored.push({ url: page.url, score, paragraph: opener, wordCount: wc, masked });
  }

  const maskFrequency = new Map<string, number>();
  for (const s of scored) {
    maskFrequency.set(s.masked, (maskFrequency.get(s.masked) ?? 0) + 1);
  }
  const templateThreshold = Math.max(3, Math.floor(scored.length * 0.2));

  const findings: RuleResult[] = [];
  for (const s of scored) {
    let finalScore = s.score;
    const isTemplated = (maskFrequency.get(s.masked) ?? 0) >= templateThreshold && scored.length > 3;
    if (isTemplated) finalScore -= 3;

    if (finalScore >= minPass) continue;

    const severity = finalScore <= 0 ? "error" : "warning";
    const reasons: string[] = [];
    if (isTemplated) reasons.push("opener is identical to other pages after entity masking");
    if (s.wordCount > tooLong) reasons.push(`opener is ${s.wordCount} words (too long to extract)`);
    if (isBoilerplateOpener(s.paragraph)) reasons.push("opener is boilerplate ('Welcome to...', 'Generate your...')");
    if (!hasConcreteFact(s.paragraph)) reasons.push("no specific numbers, dates, or dollar amounts");
    if (!hasNamedEntity(s.paragraph, entityPatterns)) reasons.push("no named entities (agencies, laws, proper nouns)");

    findings.push({
      ruleId: "aeo/answer-first",
      severity,
      message: `${s.url} does not open with a direct, extractable answer${reasons.length ? `: ${reasons.join("; ")}` : "."}`,
      pageUrl: s.url,
      fix:
        `Restructure the template to open with entity-specific facts. Instead of boilerplate or a topic preamble, ` +
        `lead with a complete-answer sentence containing the key number, date, agency, or form name a reader ` +
        `(or AI Overview) would cite. Target: <${maxWords} words, at least one concrete number, at least one named entity.`,
    });
  }

  return findings;
}
