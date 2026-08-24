import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * links/crawlable-anchors flags pages whose navigation relies on JS-driven
 * pseudo-links. Google only follows `<a>`/`<area>` elements with a resolvable
 * `href`; it does not simulate clicks, so `<a onclick>`, `href="javascript:"`,
 * and framework router attributes without a real href are invisible to
 * crawling.
 *
 * Source: https://developers.google.com/search/docs/crawling-indexing/links-crawlable
 * (Lighthouse ships the same check as the `crawlable-anchors` audit.)
 *
 * Counted as non-crawlable:
 *   - href starting with "javascript:" (case-insensitive)
 *   - href="#" combined with an onclick attribute OR a router attribute
 *     (routerlink, data-router-link, to, ng-click, @click, v-on:click)
 *   - an empty/whitespace-only href (a deliberate deviation: Lighthouse
 *     resolves `href=""` against the page URL and passes it, but a self-link
 *     discovers nothing, so it stays counted here)
 *   - an href-less `<a>` that is NOT a placeholder: i.e. one that carries an
 *     href-associated attribute (target, download, ping, rel, hreflang, type,
 *     referrerpolicy) or a router attribute, or that has a click handler
 *
 * NOT counted, matching the exclusions in Lighthouse's `crawlable-anchors`
 * audit (core/audits/seo/crawlable-anchors.js) so the docstring's claim that
 * this is "the same check" is true rather than aspirational:
 *   - any anchor with a `role` attribute (`if (role.length > 0) return;`)
 *   - `<a id="…">` with no href, i.e. a jump target (`if (rawHref === '' && id)
 *     return;`)
 *   - `<a name="…">`, the legacy jump-target form (`if (name.length > 0)
 *     return;`)
 *   - an href-less anchor with no href-associated attributes, which the HTML
 *     spec defines as "a placeholder for where a link might otherwise have been
 *     placed": Lighthouse fails it only `if (listeners.length)`
 *   - mailto:/tel: links, href="#fragment" with a real fragment name, and
 *     `<button>` elements (buttons are legitimately not links)
 *
 * Heading anchors, footnote back-references and icon buttons rendered as
 * href-less `<a>` are ordinary, correct markup; counting them was reporting
 * "5 of 8 <a> elements are not crawlable" on a page whose navigation works.
 *
 * Firing thresholds (nonCrawlable >= 3; or >= 20% of at least 5 anchors;
 * escalating to error at >= 5 with fewer than 2 crawlable same-host hrefs) are
 * ARBITRARY REPORTING FLOORS. Google documents no ratio at which a page's
 * navigation is deemed uncrawlable, and Lighthouse's audit fails on a single
 * bad anchor. These floors exist only to keep one stray anchor off the report;
 * do not present them as a documented limit (see docs/folklore.md).
 */

const ROUTER_ATTRS = new Set([
  "routerlink",
  "data-router-link",
  "to",
  "ng-click",
  "@click",
  "v-on:click",
]);

/**
 * Attributes the HTML spec says "must be omitted if the href attribute is not
 * present". Their presence on an href-less anchor means a link was intended and
 * the href went missing, rather than the element being a spec placeholder.
 * Same list as Lighthouse's `hrefAssociatedAttributes`.
 */
const HREF_ASSOCIATED_ATTRS = new Set([
  "target",
  "download",
  "ping",
  "rel",
  "hreflang",
  "type",
  "referrerpolicy",
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

      // Lighthouse exclusions, in its order: a role-annotated anchor is not
      // being used as a link, and id-/name-only anchors are jump targets.
      const role = ($(el).attr("role") ?? "").trim();
      if (role.length > 0) continue;
      // Lighthouse's rawHref is "" both for a missing and for an empty href, so
      // one id check covers `<a id="x">` and `<a id="x" href="">`.
      if ((href === undefined || href === "") && ($(el).attr("id") ?? "") !== "") continue;
      if (($(el).attr("name") ?? "").trim().length > 0) continue;

      let bad = false;
      if (href === undefined) {
        // No href attribute. Per the HTML spec this is a placeholder unless an
        // href-associated (or router) attribute says a link was meant; even
        // then Lighthouse only fails a bare placeholder when it has a listener.
        const looksLikeIntendedLink =
          attrNames.some((n) => HREF_ASSOCIATED_ATTRS.has(n)) || hasRouterAttr;
        bad = looksLikeIntendedLink || hasOnclick;
      } else if (href === "") {
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

      // Crawlable anchor: count same-host navigation targets for the
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
          // Unresolvable href: ignore.
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
      message: `${page.url}: ${nonCrawlable} of ${totalAnchors} <a> elements are not crawlable: no resolvable href${exampleSuffix}.`,
      pageUrl: page.url,
      fix: 'Render real <a href="..."> links (server-side or via your framework\'s Link component) instead of JS click handlers. Google does not simulate clicks, so anchors without a resolvable href are invisible to crawling.',
    });
  }
  return findings;
}
