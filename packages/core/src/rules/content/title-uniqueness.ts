import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * Heuristic floor for "this template field never got filled in".
 *
 * This is NOT a documented character limit, and deliberately has no upper
 * counterpart. Google's title-link documentation states: "While there's no
 * limit on how long a `<title>` element can be, the title link is truncated in
 * Google Search results as needed, typically to fit the device width." That is
 * display-side cropping measured in pixels, not an indexing or ranking event,
 * so pseolint does not flag long titles at any length (see docs/folklore.md
 * entry #2). What the same page DOES document is that Google may replace the
 * title link "when part of the title text is missing", with `<title>| Site
 * Name</title>` as its own example. A title this short is that shape.
 */
const INCOMPLETE_TITLE_LENGTH = 10;

/**
 * Separators a title template puts between its per-record slot and its
 * boilerplate. Used only to locate an EMPTY slot; nothing here measures length.
 */
// The en/em dashes here are DATA: they are separators this rule must detect in
// other people's titles, not prose in ours. Escaped so the repo em-dash sweep
// reads them as literals.
const TITLE_SEPARATOR = String.raw`[|\u2013\u2014\u00bb\u2022\u00b7:\-]`;

/**
 * The three shapes an empty template slot leaves behind, which are what
 * Google's own example of a title link it replaces looks like: the separator
 * and the site name survive, the record does not.
 *
 *   - leading:  `| Site Name`      (Google's literal example)
 *   - trailing: `Equity Atlas -`
 *   - middle:   `Foo | | Bar`
 *
 * The middle pattern requires whitespace BETWEEN the two separators so the
 * common `--` spelling of an em dash (`Foo--Bar`) is not read as an empty slot.
 */
const LEADING_EMPTY_SLOT = new RegExp(String.raw`^\s*${TITLE_SEPARATOR}\s*\S`);
const TRAILING_EMPTY_SLOT = new RegExp(String.raw`\S\s*${TITLE_SEPARATOR}\s*$`);
const MIDDLE_EMPTY_SLOT = new RegExp(
  String.raw`\S\s*${TITLE_SEPARATOR}\s+${TITLE_SEPARATOR}\s*\S`,
);

/**
 * Template placeholders that reached production unsubstituted. Only
 * unambiguous forms: `{{city}}`, `{city}`, `${city}`, `%s`/`%d`, and the
 * bracketed ALL-CAPS slot names generators emit. `%s` is guarded against a
 * preceding digit so "50%s" in a discount title is not a match.
 */
const UNSUBSTITUTED_PLACEHOLDER =
  /\{\{\s*\w+\s*\}\}|\{\s*\w+\s*\}|\$\{\s*\w+\s*\}|(?<!\d)%[sd]\b|\[\s*(?:CITY|STATE|NAME|KEYWORD|TITLE|PRODUCT|YEAR)\s*\]/i;

/**
 * Values a null record renders as. Matched only as a WHOLE segment, never as a
 * substring, so a legitimate article titled "Understanding null in JavaScript"
 * is not flagged.
 */
const NULLISH_SEGMENTS = new Set(["undefined", "null", "nan", "none", "n/a"]);

/**
 * Detect a title whose per-record slot never got filled, WITHOUT reference to
 * how long the title is. Returns a human-readable reason, or null.
 *
 * Google's title-link page documents replacing the title link "when part of the
 * title text is missing", and its own example is the literal `| Site Name`:
 * separator and boilerplate present, record absent. The pre-existing
 * INCOMPLETE_TITLE_LENGTH check cannot see that case at all - `| Site Name` and
 * `Equity Atlas -` are both well over 10 characters - so the rule was not
 * actually delivering the check the /folklore page says it delivers.
 *
 * This is structural, not a length threshold in disguise: it fires on the SHAPE
 * of an empty slot and is indifferent to the number of characters around it.
 */
function incompleteTitleReason(title: string): string | null {
  if (LEADING_EMPTY_SLOT.test(title)) {
    return "it opens with a separator, so the text before it is missing";
  }
  if (TRAILING_EMPTY_SLOT.test(title)) {
    return "it ends with a separator, so the text after it is missing";
  }
  if (MIDDLE_EMPTY_SLOT.test(title)) {
    return "it has two separators in a row with nothing between them";
  }
  if (UNSUBSTITUTED_PLACEHOLDER.test(title)) {
    return "it still contains an unsubstituted template placeholder";
  }
  for (const segment of title.split(new RegExp(String.raw`\s*${TITLE_SEPARATOR}\s*`))) {
    if (NULLISH_SEGMENTS.has(segment.trim().toLowerCase())) {
      return `one of its segments rendered as "${segment.trim()}"`;
    }
  }
  return null;
}

/**
 * content/title-uniqueness: three checks rolled into one rule:
 *   1. Pages missing a title element (or with empty/whitespace-only titles).
 *   2. Titles whose per-record slot never got filled. Two independent shapes:
 *      an EMPTY SLOT next to a separator or an unsubstituted placeholder
 *      (structural; see `incompleteTitleReason`), and, as a fallback, a title
 *      short enough to read the same way. Both map to the documented trigger
 *      "part of the title text is missing".
 *   3. Two or more pages sharing the EXACT raw title (templated catalog
 *      titles like "Slack to Google Sheets" vs "Slack to Airtable" are
 *      DIFFERENT raw titles, so this rule does NOT entity-mask: that
 *      would false-positive on every catalog directory in existence).
 *
 * Of the four title-rewrite triggers Google documents, this rule implements the
 * two a crawler can decide (missing title text, exact-duplicate boilerplate).
 * The other two are deliberately absent and should stay that way:
 *   - A STALE YEAR ("2024 Toyota Camry Review") is indistinguishable from a
 *     correct year-scoped page, which is most of the pSEO corpus this tool
 *     serves; flagging it would spend the reader's attention on correct pages.
 *   - "Title doesn't describe the page" needs editorial judgement a crawler
 *     does not have.
 * See docs/folklore.md entry #2, which makes exactly this split in public.
 *
 * Title is the highest-impact on-page signal Google ranks against. The
 * 2026-05-03 blind-spot audit surfaced it as a tier-1 gap that the
 * existing `content/meta-uniqueness` rule didn't cover (titles ≠ meta
 * descriptions).
 *
 * Every check here maps to a documented reason Google replaces a title link.
 * None of them is a character limit: there is no documented maximum, so this
 * rule has no upper length check and never will.
 * https://developers.google.com/search/docs/appearance/title-link
 */
export function titleUniquenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  const titleToPages = new Map<string, ParsedPage[]>();

  for (const page of pages) {
    const title = (page.title ?? "").trim();
    if (title.length === 0) {
      // Diagnostic case: the page has no <head><title>, but an inline SVG
      // <title> (a logo's accessibility label) is the only <title> on the page.
      // Naive extractors used to mis-report that SVG label as the page title.
      if (page.titleSource === "none" && page.svgTitleSample) {
        findings.push({
          ruleId: "content/title-uniqueness",
          severity: "error",
          message: `${page.url} has no <head><title>; the only <title> on the page is an inline SVG <title> ("${page.svgTitleSample}"), which crawlers do NOT use as the page title.`,
          pageUrl: page.url,
          fix: "Add a real <head><title> with the per-record entity. The SVG <title> is decorative/accessibility text and will not appear in search results.",
        });
        continue;
      }
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "error",
        message: `${page.url} has no <title> element (or its title is empty).`,
        pageUrl: page.url,
        fix: "Add a non-empty <title> element to the page <head>. Title is Google's strongest on-page ranking signal.",
      });
      continue;
    }
    const emptySlot = incompleteTitleReason(title);
    if (emptySlot) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "warning",
        message: `${page.url} has the title "${title}", where ${emptySlot}: the shape left when a template field renders empty.`,
        pageUrl: page.url,
        fix: "Bind the page's own entity into the title, and skip the separator when that field is empty rather than emitting a bare one. Google documents replacing the title link when part of the title text is missing, its own example being the literal \"| Site Name\". Nothing here is about how long the title is.",
      });
    } else if (title.length < INCOMPLETE_TITLE_LENGTH) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "warning",
        message: `${page.url} has a title of only ${title.length} characters ("${title}"), which reads like a template field that was never filled in.`,
        pageUrl: page.url,
        fix: "Bind the page's own entity into the title. Google documents replacing the title link when part of the title text is missing (its example is the literal \"| Site Name\"), so a near-empty title gets rewritten from the H1 or anchor text. There is no documented upper limit, so nothing here asks you to shorten a title.",
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
      fix: "Each page needs a unique title that reflects its specific content. Templated titles must include the per-record entity (e.g. include the integration name, currency pair, or city in the title). Google documents repeated boilerplate across a subset of pages as a reason it replaces the title link.",
    });
  }

  return findings;
}
