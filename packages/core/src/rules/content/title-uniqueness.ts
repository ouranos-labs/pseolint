import type { ParsedPage, RuleResult } from "../../types.js";

const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 70;
const TRUNCATION_RISK_LENGTH = 60;

/**
 * content/title-uniqueness — three checks rolled into one rule:
 *   1. Pages missing a title element (or with empty/whitespace-only titles).
 *   2. Pages whose title is so short that Google fills it from H1 / link
 *      text instead.
 *   3. Two or more pages sharing the EXACT raw title (templated catalog
 *      titles like "Slack to Google Sheets" vs "Slack to Airtable" are
 *      DIFFERENT raw titles, so this rule does NOT entity-mask — that
 *      would false-positive on every catalog directory in existence).
 *
 * Title is the highest-impact on-page signal Google ranks against. The
 * 2026-05-03 blind-spot audit surfaced it as a tier-1 gap that the
 * existing `content/meta-uniqueness` rule didn't cover (titles ≠ meta
 * descriptions).
 */
export function titleUniquenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  const titleToPages = new Map<string, ParsedPage[]>();

  for (const page of pages) {
    const title = (page.title ?? "").trim();
    if (title.length === 0) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "error",
        message: `${page.url} has no <title> element (or its title is empty).`,
        pageUrl: page.url,
        fix: "Add a non-empty <title> element to the page <head>. Title is Google's strongest on-page ranking signal.",
      });
      continue;
    }
    if (title.length < MIN_TITLE_LENGTH) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "warning",
        message: `${page.url} has a very short title (${title.length} chars: "${title}").`,
        pageUrl: page.url,
        fix: `Expand the title to ${MIN_TITLE_LENGTH}-${TRUNCATION_RISK_LENGTH} characters. Short titles get rewritten by Google from H1 / anchor text.`,
      });
    } else if (title.length > MAX_TITLE_LENGTH) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "info",
        message: `${page.url} has a long title (${title.length} chars). Google truncates around ${TRUNCATION_RISK_LENGTH} chars in SERPs.`,
        pageUrl: page.url,
        fix: `Tighten the title to under ${TRUNCATION_RISK_LENGTH} characters so the full text shows in the SERP snippet.`,
      });
    }

    const arr = titleToPages.get(title) ?? [];
    arr.push(page);
    titleToPages.set(title, arr);
  }

  for (const [title, group] of titleToPages.entries()) {
    if (group.length < 2) continue;
    findings.push({
      ruleId: "content/title-uniqueness",
      severity: "error",
      message: `${group.length} pages share the exact title "${title}".`,
      pageUrl: group[0].url,
      relatedUrls: group.slice(1, 6).map((p) => p.url),
      fix: "Each page needs a unique title that reflects its specific content. Templated titles must include the per-record entity (e.g. include the integration name, currency pair, or city in the title).",
    });
  }

  return findings;
}
