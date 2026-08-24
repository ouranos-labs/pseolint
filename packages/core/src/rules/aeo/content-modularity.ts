import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

export interface ContentModularityOptions {
  /** Paragraphs longer than this many words are flagged. Default: 200. */
  maxParagraphWords?: number;
  /** Fraction of sections that must be self-contained to pass. Default: 0.7. */
  minSelfContainedRatio?: number;
  /** Extra cross-reference regexes (merged with defaults). */
  crossRefPatterns?: RegExp[];
}

interface CrossRefRule {
  re: RegExp;
  label: string;
}

const DEFAULT_CROSS_REF_RULES: CrossRefRule[] = [
  { re: /\b(as\s+)?(mentioned|noted|discussed|shown)\s+(above|below|earlier|previously|later)\b/i, label: "'as mentioned above'" },
  { re: /\bin\s+the\s+(previous|next|following|preceding)\s+section\b/i, label: "'in the previous/next section'" },
  { re: /\bsee\s+(above|below|earlier|the\s+section)\b/i, label: "'see above/below'" },
  { re: /\bas\s+(noted|stated)\s+above\b/i, label: "'as noted above'" },
];

// Intentionally conservative: only flag headings that are truly content-free.
// "FAQ", "Summary", "Conclusion", "Getting Started" are common legitimate headings
// and were removed from this list after feedback.
const VAGUE_HEADING_PATTERNS: RegExp[] = [
  /^\s*(more\s+information|more\s+info|details|additional\s+details|other|notes?)\s*$/i,
];

interface Section {
  heading: string;
  text: string;
  paragraphs: string[];
}

function splitIntoSections(html: string): Section[] {
  const $ = load(html);
  const sections: Section[] = [];
  let current: Section | null = null;

  const scope = $("article").length > 0 ? $("article") : $("main").length > 0 ? $("main") : $("body");

  // Chrome/nav elements inside <article>/<main> (related-posts asides, breadcrumb nav,
  // footer CTAs) inflate paragraph counts and confuse cross-reference detection.
  // Skip any h2/h3/p/li that sits inside them.
  const excludeSel = "nav, aside, footer, header, [role=navigation], .breadcrumbs, .breadcrumb";
  const isExcluded = (el: unknown): boolean => $(el as never).closest(excludeSel).length > 0;

  scope.find("h2, h3, p, li").each((_, el) => {
    if (isExcluded(el)) return;
    const tag = (el as { tagName?: string }).tagName?.toLowerCase?.() ?? "";
    const text = $(el).text().trim();
    if (!text) return;
    if (tag === "h2" || tag === "h3") {
      current = { heading: text, text: "", paragraphs: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { heading: "", text: "", paragraphs: [] };
      sections.push(current);
    }
    current.paragraphs.push(text);
    current.text = current.text ? `${current.text} ${text}` : text;
  });

  return sections;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

interface SectionIssue {
  heading: string;
  reasons: string[];
}

function analyzeSection(
  section: Section,
  crossRefRules: CrossRefRule[],
  maxParagraphWords: number,
): SectionIssue | null {
  const reasons: string[] = [];
  for (const { re, label } of crossRefRules) {
    if (re.test(section.text)) {
      reasons.push(`cross-references another section (${label})`);
      break;
    }
  }
  if (section.heading && VAGUE_HEADING_PATTERNS.some((re) => re.test(section.heading))) {
    reasons.push(`heading "${section.heading}" is too vague`);
  }
  const longParagraphs = section.paragraphs.filter((p) => wordCount(p) > maxParagraphWords).length;
  if (longParagraphs > 0) {
    reasons.push(`${longParagraphs} paragraph${longParagraphs === 1 ? "" : "s"} exceed ${maxParagraphWords} words`);
  }
  if (reasons.length === 0) return null;
  return { heading: section.heading || "(pre-heading)", reasons };
}

export function contentModularityRule(
  pages: ParsedPage[],
  options?: ContentModularityOptions,
): RuleResult[] {
  const maxParagraphWords = options?.maxParagraphWords ?? 200;
  const minRatio = options?.minSelfContainedRatio ?? 0.7;
  const extraCrossRef = (options?.crossRefPatterns ?? []).map((re) => ({ re, label: "custom pattern" }));
  const crossRefRules = [...DEFAULT_CROSS_REF_RULES, ...extraCrossRef];
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const sections = splitIntoSections(page.html).filter((s) => s.text.length > 0);
    if (sections.length < 2) continue;

    const issues: SectionIssue[] = [];
    for (const section of sections) {
      const issue = analyzeSection(section, crossRefRules, maxParagraphWords);
      if (issue) issues.push(issue);
    }

    const selfContainedRatio = 1 - issues.length / sections.length;
    if (selfContainedRatio >= minRatio) continue;

    const examples = issues
      .slice(0, 3)
      .map((i) => `"${i.heading}": ${i.reasons.join(", ")}`)
      .join(" | ");

    findings.push({
      ruleId: "aeo/content-modularity",
      severity: "warning",
      // Always low: these are stylistic recommendations, not penalties. A page that
      // ignores all of them can still rank and get cited.
      confidence: "low",
      message:
        `${page.url} has ${issues.length}/${sections.length} sections that are not independently extractable. ` +
        `Examples: ${examples}.`,
      pageUrl: page.url,
      fix:
        `Each section should answer one question completely without referencing other parts of the page. ` +
        `(1) Replace "see above" / "as mentioned" with the actual information the reader needs. ` +
        `(2) Rename vague H2s ("More Info", "Details") to specific topics (e.g. "California LLC Annual Report Requirements"). ` +
        `(3) Break paragraphs longer than ${maxParagraphWords} words into 2–3 focused paragraphs with their own sub-headings.`,
    });
  }

  return findings;
}
