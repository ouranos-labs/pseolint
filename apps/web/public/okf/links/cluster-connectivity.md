---
type: pSEO Audit Rule
title: "Cluster Connectivity: When a Directory of Pages Becomes a Topic Silo"
description: "A directory of pages with no internal links in or out is a topic silo that hoards authority. How links/cluster-connectivity flags siloed same-parent clusters."
resource: https://pseolint.dev/rules/cluster-connectivity
ruleId: "links/cluster-connectivity"
tags: [links, "internal linking topic silo"]
---

# Cluster Connectivity: When a Directory of Pages Becomes a Topic Silo

> links/cluster-connectivity groups every crawled URL by its parent directory, and for each cluster of 2 or more pages it checks whether a single internal crawl link enters from another cluster or leaves toward one: firing a warning when neither exists, because Google cannot diffuse authority into a directory that no other section of your site references or is referenced by.

_Rule `links/cluster-connectivity` · [live explainer](https://pseolint.dev/rules/cluster-connectivity)_

# What it detects
The rule keys every crawled URL to its parent directory using the same cluster logic the link family shares: /cheese/affinage/ and /cheese/rind/ collapse to the /cheese/ parent, so a cluster is simply the set of pages that live under one folder. It builds that map first, then only looks at clusters that hold 2 or more pages, because a lone page is an orphan question, not a connectivity one.

For each multi-page cluster it asks two narrow questions against the set of URLs the crawl actually knows about. First, outbound: does any page in the cluster carry a resolved internal href whose target resolves to a different cluster? Second, inbound: does any page outside the cluster link to any URL inside it? A link that stays within the same parent directory does not count for either test, internal-to-cluster links keep the silo sealed.

When a cluster of 2 or more pages has neither a cross-cluster outbound link nor a cross-cluster inbound link, it is a sealed silo and the rule emits one warning naming the directory, the page count, and the affected URLs. A cluster with even a single link crossing its boundary in either direction passes.

# Why it matters
Internal links are how PageRank-style authority flows through a site. A directory that no other section links to, and that links to nothing outside itself, is a closed loop: whatever authority lands on it stays trapped, and whatever authority the rest of the site has cannot reach it. The pages can be individually excellent and still underperform because they sit in a pocket Google has no strong path into.

This is a warning, not an error, because a silo is a missed opportunity rather than a spam signal. A 12-page guide to washed-rind cheeses that no recipe, no shop category, and no blog post ever links to is not penalised; it is simply starved. The fix is cheap and additive: one contextual link from a related section into the cluster, and one back out, breaks the seal and lets authority diffuse both ways.

The rule deliberately requires total isolation in both directions before it fires. A cluster that receives even one inbound link, or sends even one outbound link to another section, is considered connected, because that single edge is enough for a crawler to find and credit the directory. The bar is set at sealed, not merely sparse.

# Failing example
A specialty fromagerie ships a /cave-aged/ directory with 9 deep guides, affinage timelines, washed-rind humidity, raw-milk safety. Every link inside those pages points only to other /cave-aged/ guides, and nothing in the shop's /shop/ catalog, its /recipes/ pairings, or its /journal/ posts ever links into the directory. The cluster is sealed in both directions, so the rule warns: 'Cluster /cave-aged/ (9 pages) has no crawl links to or from other clusters.' The guides took 6 weeks to write, yet draw barely 4% of the site's organic sessions, because Google has no internal path into the silo.

# Passing example
The same fromagerie adds two contextual links. The /shop/ page for its flagship cave-aged gruyere (a $42 wheel aged 18 months in the cave) links into /cave-aged/affinage-timeline, giving the cluster an inbound edge from the catalog; and each /cave-aged/ guide closes with a 'shop this wheel' link out to the matching /shop/ product, giving it outbound edges. One inbound link plus outbound links is more than enough; the seal is broken in both directions, authority diffuses between the curd-to-counter sections, and the rule stays silent on a directory that now sits inside the site's link graph instead of beside it.

# How to fix
- Add at least one inbound link from a related section. A single contextual link from your catalog, blog, or navigation into the siloed directory is enough for a crawler to find and credit it.
- Add at least one outbound link from inside the cluster to another section. Linking out is half the test; a cluster that only receives links still reads as a one-way pocket until its own pages reference the rest of the site.
- Link on topical relevance, not in a footer dump. A contextual link from a genuinely related page passes far more authority and reads as editorial rather than as a sitewide boilerplate block.
- Audit your navigation for whole sections it omits. Silos usually form when a directory was built after the main nav was frozen and never got wired back into it.
- Re-crawl after adding the links. Because the rule only needs one crossing edge in each direction, a small number of well-placed links can clear several siloed clusters at once.
- Treat the warning as a discoverability prompt, not a penalty. The pages are not flagged as low quality; they are flagged as unreachable, which is usually a quick fix with outsized traffic upside.

# Related rules
- [host-section-divergence](../links/host-section-divergence.md)
- [template-diversity](../spam/template-diversity.md)

# Sources
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): Google's crawl-budget guidance explains that authority flows through sites via internal links, and sections with no inbound or outbound cross-links are effectively isolated from the rest of the domain's crawl graph. links/cluster-connectivity groups URLs by their parent directory (collapsing /cheese/affinage/ and /cheese/rind/ under /cheese/) then checks each cluster of 2 or more pages for at least one link entering from or leaving toward another cluster, firing a warning when neither direction exists. A fully isolated directory receives no authority diffusion from the rest of the site.
- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview): Google's sitemaps documentation notes that a sitemap helps Google discover URLs but does not substitute for the editorial endorsement that internal cross-links carry. A cluster that is reachable only through the sitemap and has zero links to neighbouring directories is structurally siloed: its pages cannot inherit topical weight from related sections, the opposite of the hub-and-spoke architecture Google's quality guidance associates with authoritative topic coverage.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials states that internal links help Google understand how pages relate to each other. Cluster connectivity failures (where an entire directory neither points to nor receives a link from any other directory in the site) deny Google that relational signal for every page in that folder. The rule fires only on clusters of 2 or more pages, specifically excluding lone-page orphan situations that the orphan-pages rule already covers, so each finding represents a structurally isolated sub-graph rather than a single disconnected URL.
