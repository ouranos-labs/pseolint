import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * links/generic-anchor-text flags pages where most internal links carry
 * generic anchor text ("click here", "read more", …). Google uses anchor text
 * (and the img alt for image links) to understand what the target page is
 * about; generic anchors waste that signal on every templated page that
 * repeats them.
 *
 * Sources:
 *   https://developers.google.com/search/docs/crawling-indexing/links-crawlable#anchor-text
 *   (Lighthouse ships the same check as the `link-text` audit.)
 *
 * Scope: only INTERNAL links count: hrefs that resolve to the same host as
 * page.url (relative hrefs are internal). Pages with empty html or an
 * unparseable page.url are skipped.
 *
 * An anchor's effective text is its ACCESSIBLE NAME, resolved the way a
 * browser does, in order: visible text content, then `aria-label`, then
 * `title`, then the first child `<img>`'s alt. An icon link such as
 *
 *     <a href="/search" aria-label="Search products"><svg aria-hidden="true"/></a>
 *
 * is correctly labelled markup, not an empty anchor, and reading only the text
 * node reported a whole correctly-built header as generic. Text is trimmed,
 * lowercased, and trailing punctuation is stripped before matching against the
 * generic set; an effective name that is still empty after all four fallbacks
 * counts as generic.
 *
 * Firing: info (confidence medium) when the page has >= 5 internal links and
 * at least half of them are generic. Both numbers are ARBITRARY REPORTING
 * FLOORS. Google documents no share of generic anchors at which a page is
 * penalised, and there is no published threshold to cite; they were picked so
 * the finding surfaces on templated pages that repeat a "Learn more" card and
 * stays quiet on a page with one stray "read more". Never present them as a
 * documented limit (see docs/folklore.md). The finding stays at `info`
 * precisely because the threshold is ours, not Google's.
 */

const GENERIC_TEXTS = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "link",
  "this",
  "this page",
  "see more",
  "details",
  "more info",
  "continue",
  "continue reading",
  "click",
  "go",
  "start",
]);

const SAMPLE_LIMIT = 3;

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,:;…→»›>\-]+$/u, "")
    .trim();
}

export function genericAnchorTextRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const html = page.html ?? "";
    if (!html.trim()) continue;

    let pageHost: string;
    try {
      pageHost = new URL(page.url).host;
    } catch {
      continue;
    }

    const $ = load(html);
    let internalLinks = 0;
    let genericCount = 0;
    const samples: string[] = [];

    for (const el of $("a[href]").toArray()) {
      const href = ($(el).attr("href") ?? "").trim();
      if (!href) continue;

      let resolved: URL;
      try {
        resolved = new URL(href, page.url);
      } catch {
        continue;
      }
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      if (resolved.host !== pageHost) continue;

      internalLinks += 1;

      // Effective name, browser accessible-name order: text content, else
      // aria-label, else title, else the first child img's alt (image links).
      let text = $(el).text().trim();
      if (!text) text = ($(el).attr("aria-label") ?? "").trim();
      if (!text) text = ($(el).attr("title") ?? "").trim();
      if (!text) text = ($(el).find("img").first().attr("alt") ?? "").trim();

      const normalized = normalize(text);
      if (normalized === "" || GENERIC_TEXTS.has(normalized)) {
        genericCount += 1;
        if (samples.length < SAMPLE_LIMIT) {
          samples.push(text ? `"${text}"` : '"" (empty)');
        }
      }
    }

    if (internalLinks < 5) continue;
    const ratio = genericCount / internalLinks;
    if (ratio < 0.5) continue;

    const exampleSuffix = samples.length > 0 ? ` (e.g. ${samples.join(", ")})` : "";
    findings.push({
      ruleId: "links/generic-anchor-text",
      severity: "info",
      confidence: "medium",
      message: `${page.url}: ${genericCount} of ${internalLinks} internal links (${Math.round(ratio * 100)}%) use generic anchor text${exampleSuffix}.`,
      pageUrl: page.url,
      fix: "Make each anchor's text describe the destination page (its topic or title) instead of a generic call to action; descriptive anchors are also how AI answer engines label citations.",
    });
  }
  return findings;
}
