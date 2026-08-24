import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * Separators a stuffed title uses to chain its keyword slots together. Commas,
 * pipes and bullets always separate; a hyphen/en-dash/em-dash only separates
 * when it is surrounded by whitespace, so hyphenated words ("Step-by-Step",
 * "e-commerce") and the `--` spelling of a dash stay inside their segment.
 *
 * `/` is deliberately absent: "24/7", "and/or" and "Category/Subcategory" would
 * split into fragments that are not slots.
 */
// The en/em dashes below are DATA - separators this rule has to recognise in
// other people's titles, not prose in ours - so they are escaped as code points
// for the repo's em-dash sweep.
const SEGMENT_SEPARATOR = new RegExp(String.raw`\s*[,|\u00b7\u2022]\s*|\s+[-\u2013\u2014]\s+`);

/**
 * How many keyword slots a title needs before it reads as a list rather than a
 * phrase, and how many of those slots have to be short enough to be a bare
 * keyword rather than a clause.
 *
 * Both numbers are structural counts. Neither is a character budget, and this
 * rule never looks at `title.length`: across the calibration corpus the
 * SHORTEST title it fires on is 48 characters and the LONGEST it leaves alone
 * is 109, so it is not a length ceiling wearing a different hat. Google
 * documents no maximum title length and pseolint does not invent one
 * (docs/folklore.md entry #2).
 */
const MIN_SLOTS = 6;
const MIN_BARE_KEYWORD_SLOTS = 5;

/** A slot of at most this many whitespace-separated words is a bare keyword, not a clause. */
const BARE_KEYWORD_MAX_WORDS = 2;

/** Split a title into its slots, dropping empties. */
function titleSlots(title: string): string[] {
  return title
    .split(SEGMENT_SEPARATOR)
    .map((slot) => slot.trim())
    .filter(Boolean);
}

function wordCount(slot: string): number {
  return slot.split(/\s+/).filter(Boolean).length;
}

/**
 * spam/keyword-stuffed-title: the `<title>` is a list of the terms the page
 * wants to rank for rather than a description of the page.
 *
 * Google's keyword-stuffing policy is explicit about the SHAPE, not the size:
 * "Keyword stuffing refers to the practice of filling a page with keywords or
 * numbers in an attempt to manipulate rankings in Google Search results. Often,
 * these keywords appear in a list or group, or out of context (not as natural
 * prose)." Its worked example is "blocks of text listing cities and regions a
 * web page is trying to rank for".
 * https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing
 *
 * "Larray - Height, Birthday, Age, TikTok, YouTube, Wiki, Bio" is that block of
 * text, in the highest-weighted field on the page: eight query modifiers in a
 * row, no prose, nothing that describes the page. So is "Regal Nails, Salon &
 * Spa, Waterford, CT - Reviews (51), Photos (25) - BestProsInTown".
 *
 * What it must NOT catch is a title that is merely long, or one that carries a
 * real phrase plus a brand suffix. Hence two independent gates: the title needs
 * at least MIN_SLOTS separator-delimited slots AND at least
 * MIN_BARE_KEYWORD_SLOTS of them must be bare keywords of one or two words.
 * "Free Customer Success Templates - Retain more customers with these customer
 * success form and survey templates" (109 characters, Typeform) has two slots
 * and passes; every 48-to-95-character bio-farm title in the corpus fails.
 *
 * Measured over the calibration corpus at the shipped thresholds: 0 findings on
 * any of the 135 fixture pages of the six reputable winners, nor on either of the
 * two tracked subject sites; findings on seven policy-violating sites.
 */
export function keywordStuffedTitleRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const title = page.title?.trim();
    if (!title) continue;

    const slots = titleSlots(title);
    if (slots.length < MIN_SLOTS) continue;

    const bareKeywords = slots.filter((slot) => wordCount(slot) <= BARE_KEYWORD_MAX_WORDS);
    if (bareKeywords.length < MIN_BARE_KEYWORD_SLOTS) continue;

    findings.push({
      ruleId: "spam/keyword-stuffed-title",
      severity: "warning",
      confidence: "high",
      pageUrl: page.url,
      message:
        `${page.url} has a title made of ${slots.length} separator-delimited slots, ` +
        `${bareKeywords.length} of them bare one-or-two-word keywords ` +
        `(${bareKeywords.slice(0, 5).map((k) => `"${k}"`).join(", ")}): ` +
        `a list of the terms the page wants to rank for rather than a description of the page.`,
      fix:
        "Write the title as a phrase about this page instead of a keyword list. " +
        "Google's spam policy calls out keywords that \"appear in a list or group, or out of context " +
        "(not as natural prose)\". This is about the SHAPE of the title, not its length: there is no " +
        "documented maximum, and pseolint never asks you to shorten a title.",
    });
  }

  return findings;
}
