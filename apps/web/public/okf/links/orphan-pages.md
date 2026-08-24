---
type: pSEO Audit Rule
title: "Orphan Pages: URLs No Other Page Links To"
description: "Orphan pages have zero inbound internal links, so Googlebot can't crawl them from your site. How links/orphan-pages finds every unreachable URL in your corpus."
resource: https://pseolint.dev/rules/orphan-pages
ruleId: "links/orphan-pages"
tags: [links, "orphan pages SEO"]
---

# Orphan Pages: URLs No Other Page Links To

> links/orphan-pages scans every URL in the crawl, counts the inbound internal links pointing at each one, and fires at error severity on any page with exactly 0 of them, the dead-zone shape that leaves Googlebot unable to reach a URL through your own navigation, a structural gap the March 27, 2026 core update treats as a discoverability failure rather than a content one.

_Rule `links/orphan-pages` · [live explainer](https://pseolint.dev/rules/orphan-pages)_

# What it detects
links/orphan-pages builds one number for every page in the crawl: how many other pages in the same corpus link to it. It walks each parsed page, reads the inbound-link count the crawler accumulated while following internal hrefs, and flags any URL whose count is exactly 0. The root URL is exempted (your homepage is reached directly, not via an internal link) so the rule never accuses the front door of being unreachable.

The check is corpus-scoped, which is the detail that makes it honest. It only knows about pages the crawl actually visited and only counts links between those pages. A URL with zero inbound links is one that no page in the set references, meaning a crawler arriving at your homepage has no internal path to it. The page might still be reachable through your XML sitemap or an external backlink, but inside the site's own link graph it is an island.

Every orphan emits a single error-severity finding naming the URL and recommending you link to it from a relevant hub or index and add it to navigation. The rule reasons purely about reachability; it makes no judgement about whether the page's content is good, only about whether anything points at it.

# Why it matters
Search engines discover most pages by following links. Googlebot starts somewhere it already knows (usually your homepage or a sitemap entry) and crawls outward along internal hrefs. A page with zero inbound internal links sits outside that graph: nothing on your site points a crawler toward it, so it competes for discovery and crawl budget at a severe disadvantage even when its content is excellent.

Orphans are a classic failure mode of programmatic builds. A template generates 4,000 location pages and writes them to disk, but the index that should link them is paginated to show only the first 200, or the generation job ships the detail pages a week before the hub that lists them. The pages exist, return 200, and may even sit in the sitemap, yet no human or crawler can navigate to 3,800 of them without typing the URL. PageRank, the internal-link signal Google has used since 1998, never flows to a page nothing links to, so orphans tend to rank far below their integrated siblings.

The error severity reflects that this is a structural defect, not a stylistic one. A page no one can reach is functionally invisible, and invisibility is the most expensive SEO problem there is.

# Failing example
A beekeeping-supplies shop ships a /hives/ catalog whose index template paginates to the first 24 products, but the store stocks 310 SKUs. The $420 cedar Langstroth deep brood box, the nuc box, and roughly 280 other hive components live at real URLs that return 200, yet no page in the crawl links to them. The rule counts 0 inbound internal links for each and fires at error severity 286 times, naming every unreachable product. Googlebot arriving at the homepage has no internal path to 92% of the hive inventory, and 3 months after launch those pages still hold no rankings.

# Passing example
The same beekeeping-supplies shop rebuilds the /hives/ index as a fully linked, filterable grid, every brood box, queen excluder, and Langstroth frame is reachable from the catalog, and each product also appears in a 'goes with this hive' block on related pages, so a smoker links to the apiary-starter bundle and the honey extractor links back to the frames it spins. Every one of the 310 SKUs now carries at least 1 inbound internal link. The rule counts no zero-inbound URLs and stays silent, because Googlebot can walk from the homepage to any product in 3 clicks.

# How to fix
- Link every orphan from a relevant hub or category index so it joins the site's internal link graph and a crawler can actually reach it.
- Fix paginated or truncated index templates that list only the first N items: the missing children are usually the orphans, and crawlable pagination restores them all at once.
- Add the page to your primary or contextual navigation when it is genuinely important, so it earns inbound links from high-traffic parts of the site.
- Cross-link related items to each other, so a product, article, or location references its siblings instead of depending on one fragile index page.
- Re-crawl after wiring the links and confirm the inbound count is no longer 0: a sitemap entry alone does not clear this rule, because the rule measures internal links, not sitemap membership.
- For pages that should not exist as standalone URLs, consolidate or noindex them rather than leaving unreachable thin pages stranded in the corpus.

# Related rules
- [link-depth](../links/link-depth.md)
- [cluster-connectivity](../links/cluster-connectivity.md)
- [host-section-divergence](../links/host-section-divergence.md)

# Sources
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): Google's crawl-budget guidance explains that Googlebot discovers pages by following internal links; a URL with zero inbound internal links sits outside every navigation path, so the crawler cannot reach it organically. links/orphan-pages flags exactly this zero-inbound-link condition, counting the inbound-link total the crawler accumulated while walking internal hrefs and exempting only the root URL, which is reached directly.
- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview): Google's sitemaps documentation acknowledges that a sitemap can surface URLs Googlebot would not find through crawling alone, but also warns that a sitemap submission does not substitute for internal links that transfer authority. A page with zero inbound internal links survives only on sitemap declaration, a structurally weak position the March 27, 2026 core update treated as a discoverability failure.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials states that Google must be able to find a page to index it, and the primary discovery mechanism is link-following. When links/orphan-pages fires at error severity on a URL, that page has no internal referrer in the crawled corpus at all: it cannot be found by traversing your own navigation, only by direct URL knowledge or an external signal.
