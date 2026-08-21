---
type: pSEO Audit Rule
title: "Dead Ends: Pages With Zero Outbound Links to the Rest of Your Crawl"
description: "A dead-end page has zero outbound links to other crawled URLs, so crawlers stall and link equity stops flowing forward. How links/dead-ends finds these pages."
resource: https://pseolint.dev/rules/dead-ends
ruleId: "links/dead-ends"
tags: [links, "dead end pages SEO"]
---

# Dead Ends: Pages With Zero Outbound Links to the Rest of Your Crawl

> links/dead-ends flags every crawled page (the homepage aside) whose outbound links include zero URLs that point to another page in the same crawl, the forward-flow gap that strands Googlebot and traps link equity, a warning a model-railway shop's 1,400 product listings hit when each turnout and locomotive page links only out to a vendor, never deeper into the store.

_Rule `links/dead-ends` · [live explainer](https://pseolint.dev/rules/dead-ends)_

# What it detects
links/dead-ends walks every page in your audited corpus, skips the root URL, and for each remaining page counts how many of its resolved outbound links point to another page that is also in the crawl. The check is strict: a link only counts if its target is in the known-URL set and is not a self-link back to the same page. When that count lands at exactly zero, the page is a dead end and the rule emits a warning naming the URL.

The test is corpus-scoped, not page-local. A page can carry dozens of links to external vendors, social profiles, or PDFs and still be a dead end, because none of those targets is another crawled page on your own site. Forward flow is the only thing measured: does standing on this page give a crawler, or a reader, any path deeper into the rest of the corpus.

Severity is fixed at warning. A dead end is not a broken page or a thin page; it renders fine and may read well. It simply terminates the internal link graph at that node, so anything that travels along links, crawl reach and ranking signal alike, stops there instead of moving on to the next page.

# Why it matters
Googlebot discovers and re-crawls pages largely by following links from pages it already knows. A dead-end page is a node the crawler can arrive at but never leave, so it contributes nothing to discovering the rest of your site. On a small site one dead end is harmless. On a 1,400-page programmatic catalogue where most leaf pages dead-end, the internal graph collapses into a wide, shallow fan that the crawler exhausts in a single hop, leaving deeper inventory undiscovered for weeks.

Link equity, the ranking signal that propagates along internal links, behaves the same way. It flows into a dead-end page and then has nowhere to go. Every page that terminates the graph is a place where authority pools and stops compounding across the rest of the corpus, which is wasteful on exactly the deep long-tail pages programmatic sites most need to rank.

The fix is also the cheapest in the link family: a dead end becomes a live node the moment it links to even one other crawled page. Unlike orphan pages, which no page links to, a dead end is reachable but is itself a one-way valve. Adding a handful of contextual internal links forward turns a terminal node back into a junction the crawler and link equity can pass through.

# Failing example
RailYardHobbies.example ships 1,400 product pages for HO gauge locomotives, rolling stock, turnouts, ballast, and weathering powder. Each listing template renders the price, an add-to-cart button, and a single outbound link to the manufacturer's spec sheet on an external domain. It links to nothing else on the store: no category page, no related locomotive, no diorama guide. Every one of those 1,400 pages counts zero outbound links to another crawled URL, so links/dead-ends fires a warning on each. In one illustrative run the crawler reached barely 38% of the catalogue before exhausting its budget, leaving the deep aisles unindexed for 9 weeks. A crawler that lands on the Atlas GP38 diesel listing can read it, then has to retreat the way it came, because the page offers no path forward into the other 1,399.

# Passing example
The same RailYardHobbies catalogue, with the listing template reworked so every product page links forward into the corpus. The Atlas GP38 listing now links to its parent category (HO gauge diesel locomotives), to three related items a crawler can follow (a matching DCC decoder, a length of flex track, a bottle of rust weathering powder), and to a buying guide on bedding turnouts in ballast. The external manufacturer link stays, but it no longer stands alone. Each page now counts four or more outbound links to other crawled URLs, the dead-end warnings clear across all 1,400 pages, and in the same illustrative scenario crawl reach climbs from 38% to 94% within 12 days as the graph stops dead-ending. A crawler arriving on any listing can travel deeper into the store instead of hitting a wall.

# How to fix
- Add contextual internal links from every leaf page to a handful of genuinely related crawled pages, so each node offers the crawler a path forward rather than a one-way valve.
- Link each product or article up to its parent category or hub page, which alone is usually enough to clear the warning while also restoring a route back into the broader corpus.
- Build a related-items or related-reading block into the page template, since dead ends on programmatic sites almost always trace to a template that renders only external links.
- Audit your link resolver: relative hrefs, JavaScript-injected menus, or trailing-slash mismatches can make real internal links resolve to URLs outside the known set, so a linked page still reads as a dead end.
- Distinguish a dead end from a deliberately terminal page like a checkout or thank-you screen, and exclude only those that should not feed the crawl, never the content pages you want indexed.
- Re-crawl after editing the template, because dead ends are usually template-wide: one fix to the shared listing layout clears the warning on hundreds of pages at once.

# Related rules
- [orphan-pages](../links/orphan-pages.md)
- [link-depth](../links/link-depth.md)
- [cluster-connectivity](../links/cluster-connectivity.md)

# Sources
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): Google's crawl-budget guidance describes how Googlebot advances through a site by following outbound links from each fetched page. links/dead-ends fires when a non-root page's outbound links contain zero targets that also exist in the crawled corpus: every discovered URL on that page points outside the audit boundary, giving the crawler nowhere to go next within your own site.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials notes that internal links help Google understand your site's structure and pass signals between related pages. A dead-end page (one whose resolved outbound links include no sibling in the known-URL set and no valid self-link) breaks that signal chain entirely, trapping whatever link equity the page carries instead of forwarding it.
