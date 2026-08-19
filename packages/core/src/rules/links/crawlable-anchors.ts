import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * links/crawlable-anchors — flags pages whose navigation relies on JS-driven
 * pseudo-links. Google only follows `<a>`/`<area>` elements with a resolvable
 * `href`; it does not simulate clicks, so `<a onclick>`, `href="javascript:"`,
 * and framework router attributes without a real href are invisible to
 * crawling.
 *
 * Source: https://developers.google.com/search/docs/crawling-indexing/links-crawlable
 * (Lighthouse ships the same check as the `crawlable-anchors` audit.)
 *
 * Counted as non-crawlable:
 *   - `<a>` with no href attribute, or an empty/whitespace-only href
 *     (this also covers router-attribute-only anchors with no href)
 *   - href starting with "javascript:" (case-insensitive)
 *   - href="#" combined with an onclick attribute OR a router attribute
 *     (routerlink, data-router-link, to, ng-click, @click, v-on:click)
 *
 * NOT counted: href="#fragment" with a real fragment name, mailto:/tel:
 * links, and `<button>` elements (buttons are legitimately not links).
 *
 * Firing: warning when nonCrawlable >= 3, or when the non-crawlable share is
 * >= 20% of at least 5 anchors. Escalates to error when nonCrawlable >= 5 AND
 * the page has fewer than 2 crawlable same-host hrefs — its navigation is
 * effectively invisible to Googlebot.
 */

const ROUTER_ATTRS = new Set([
  "routerlink",
  "data-router-link",
  "to",
  "ng-click",
  "@click",
  "v-on:click",
]);

const SAMPLE_LIMIT = 3;
const SAMPLE_MAX_LEN = 40;

function sampleText(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > SAMPLE_MAX_LEN ? `${t.slice(0, SAMPLE_MAX_LEN)}…` : t;
}

export function crawlableAnchorsRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const html = page.html ?? "";
    if (!html.trim()) continue;

    let pageHost: string | null = null;
    try {
      pageHost = new URL(page.url).host;
    } catch {
      pageHost = null;
    }

    const $ = load(html);
    let totalAnchors = 0;
    let nonCrawlable = 0;
    let crawlableSameHost = 0;
    const samples: string[] = [];

    for (const el of $("a").toArray()) {
      totalAnchors += 1;
      const attrNames = Object.keys(el.attribs ?? {}).map((n) => n.toLowerCase());
      const hasRouterAttr = attrNames.some((n) => ROUTER_ATTRS.has(n));
      const hasOnclick = attrNames.includes("onclick");
      const rawHref = $(el).attr("href");
      const href = rawHref === undefined ? undefined : rawHref.trim();

      let bad = false;
      if (href === undefined || href === "") {
        // No href at all (covers router-attribute-only anchors) or empty href.
        bad = true;
      } else if (/^javascript:/i.test(href)) {
        bad = true;
      } else if (href === "#" && (hasOnclick || hasRouterAttr)) {
        bad = true;
      }

      if (bad) {
        nonCrawlable += 1;
        if (samples.length < SAMPLE_LIMIT) {
          const text = sampleText($(el).text());
          if (text) samples.push(`"${text}"`);
        }
        continue;
      }

      // Crawlable anchor — count same-host navigation targets for the
      // error-escalation check. Fragment-only hrefs stay on the same page and
      // mailto:/tel: are not navigation, so they don't count.
      if (href && pageHost && !href.startsWith("#") && !/^(mailto:|tel:)/i.test(href)) {
        try {
          const resolved = new URL(href, page.url);
          if (
            (resolved.protocol === "http:" || resolved.protocol === "https:") &&
            resolved.host === pageHost
          ) {
            crawlableSameHost += 1;
          }
        } catch {
          // Unresolvable href — ignore.
        }
      }
    }

    const ratioFires = totalAnchors >= 5 && nonCrawlable / totalAnchors >= 0.2;
    if (nonCrawlable < 3 && !ratioFires) continue;

    const severity: RuleResult["severity"] =
      nonCrawlable >= 5 && crawlableSameHost < 2 ? "error" : "warning";
    const exampleSuffix = samples.length > 0 ? ` (e.g. ${samples.join(", ")})` : "";

    findings.push({
      ruleId: "links/crawlable-anchors",
      severity,
      confidence: "high",
      message: `${page.url}: ${nonCrawlable} of ${totalAnchors} <a> elements are not crawlable — no resolvable href${exampleSuffix}.`,
      pageUrl: page.url,
      fix: 'Render real <a href="..."> links — server-side or via your framework\'s Link component — instead of JS click handlers. Google does not simulate clicks, so anchors without a resolvable href are invisible to crawling.',
    });
  }
  return findings;
}
