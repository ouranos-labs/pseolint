import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

export interface CitableFactsOptions {
  /** Below this count → error. Default: 3. */
  minFactsPerPage?: number;
  /** At or above this count → pass. Default: 8. */
  targetFactsPerPage?: number;
}

const FACT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "dollar", regex: /\$[\d,]+(\.\d{2})?/g },
  { name: "percent", regex: /\b\d+(\.\d+)?\s*%/g },
  {
    name: "timeframe",
    regex: /\b\d+(?:-\d+)?\s*(business\s+days?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
  },
  {
    name: "date",
    regex:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
  },
  { name: "isoDate", regex: /\b\d{4}-\d{2}-\d{2}\b/g },
  { name: "form", regex: /\bForm\s+[A-Z0-9][A-Z0-9-]*\b/g },
];

function extractRawFacts(text: string): string[] {
  const out = new Set<string>();
  for (const { regex } of FACT_PATTERNS) {
    const matches = text.match(regex);
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

export function citableFactsRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: CitableFactsOptions,
): RuleResult[] {
  const minFacts = options?.minFactsPerPage ?? 3;
  const targetFacts = options?.targetFactsPerPage ?? 8;
  const findings: RuleResult[] = [];

  // Build a global template-fact set: facts that appear verbatim on a majority of pages
  // after entity masking — those are "template facts", not entity-specific data points.
  //
  // Scaling by page count:
  //   n == 1      → no template detection possible, all facts count as entity-specific.
  //   n in 2..=5  → fact is template when it appears on ALL pages (strict).
  //   n > 5       → fact is template when it appears on >= 50% of pages.
  //
  // Earlier cut-off (`> 5 ? ceil(n*0.5) : n + 1`) made small-sample audits silently
  // ignore template facts, so a 3-page audit with "$70" on every page looked clean.
  const templateThreshold =
    pages.length <= 1 ? Infinity :
    pages.length <= 5 ? pages.length :
    Math.ceil(pages.length * 0.5);

  const factFrequency = new Map<string, number>();
  const perPageFacts = new Map<string, string[]>();

  for (const page of pages) {
    const masked = applyEntityMask(page.contentText, entityPatterns);
    const rawFacts = extractRawFacts(masked);
    perPageFacts.set(page.url, rawFacts);
    for (const f of rawFacts) {
      factFrequency.set(f, (factFrequency.get(f) ?? 0) + 1);
    }
  }

  const templateFacts = new Set<string>();
  for (const [f, count] of factFrequency.entries()) {
    if (count >= templateThreshold) templateFacts.add(f);
  }

  for (const page of pages) {
    const facts = perPageFacts.get(page.url) ?? [];
    const unique = facts.filter((f) => !templateFacts.has(f));

    if (unique.length >= targetFacts) continue;

    const severity = unique.length < minFacts ? "error" : "warning";
    const templateDrag = facts.length - unique.length;
    const templateNote = templateDrag > 0
      ? ` (${templateDrag} additional fact${templateDrag === 1 ? "" : "s"} appear on most pages and don't count as entity-specific)`
      : "";

    findings.push({
      ruleId: "aeo/citable-facts",
      severity,
      message:
        `${page.url} has ${unique.length} unique citable fact${unique.length === 1 ? "" : "s"}${templateNote}. ` +
        `AI Overviews cite specific numbers and named references.`,
      pageUrl: page.url,
      fix:
        `Replace vague language ("varies", "several weeks", "affordable", "many options") with ` +
        `specific values a reader or AI engine would cite: exact prices, percentages, dates, ` +
        `timeframes, version numbers, named products, standards, or regulations that apply to this page. ` +
        `For pSEO templates, bind these values from your data source so each page gets ` +
        `entity-specific numbers instead of repeating the same template wording. ` +
        `Target: ${targetFacts}+ unique facts per page.`,
    });
  }

  return findings;
}
