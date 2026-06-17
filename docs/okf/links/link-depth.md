---
type: pSEO Audit Rule
title: "Link Depth — How Many Clicks From Home Before Googlebot Gives Up"
description: "Pages buried more than 3 clicks from your homepage waste crawl budget and dilute PageRank. How links/link-depth runs a BFS from the root and flags deep and unreachable pages."
resource: https://pseolint.dev/rules/link-depth
ruleId: "links/link-depth"
tags: [links, "link depth SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Link Depth — How Many Clicks From Home Before Googlebot Gives Up

> links/link-depth runs a breadth-first search from your root URL and measures the shortest click-distance to every page, flagging anything past the default ceiling of 3 clicks as info and anything Googlebot cannot reach from the root at all as a warning, because a page Google crawls last is a page Google ranks last.

_Rule `links/link-depth` · [live explainer](https://pseolint.dev/rules/link-depth)_

# What it detects
links/link-depth treats your internal-link graph the way a crawler does. It seeds a breadth-first search at the root URL you audited, walks every internal link, and records for each page the shortest number of clicks it takes to arrive there. The BFS guarantees that distance is the minimum, so a page linked from both the homepage and a deep article is scored by its nearest path, not its farthest.

Two distinct findings come out of that single traversal. First, any page whose shortest click-distance exceeds maxClicks — default 3 — is reported at info severity with a message naming the page and the depth it sits at. Three clicks is the conventional ceiling because it mirrors how deep a crawler will eagerly follow before a page starts competing for scarce budget.

Second, any page that has inbound internal links yet never gets visited by the BFS is reported at warning severity as unreachable-from-root. That gap means the page is referenced somewhere, but no chain of links actually connects it back to the root, so a crawler starting at the homepage would never find it.

When the audit only sampled a subset of the site, the unreachable check is suppressed, because a missing path may be a sampling artifact rather than a real dead end; the depth measurement keeps running on whatever subgraph was fetched.

# Why it matters
Crawl budget and link equity both flow outward from your homepage along internal links, and both thin out with every hop. A page sitting 7 clicks deep receives a fraction of the PageRank that a 2-click page does, and Googlebot reaches it late in a crawl cycle, if at all. The 3-click ceiling is a practical proxy: pages inside it tend to get crawled promptly and rank on their merits, while pages beyond it compete for whatever budget is left.

Depth is not a penalty signal — it is a discoverability one. A buried page is not flagged as spam; it is flagged as expensive to find and starved of the internal authority it needs. That is why this finding lands at info severity. It tells you where your architecture is leaking equity into pages too far from the root to compete.

The unreachable-from-root warning is sharper. A page that other pages link to but that has no path back to the root is an island. Googlebot can only follow links it can actually reach by walking from a known entry point, so an island page depends entirely on external links or a sitemap to be discovered, and it never receives internal equity. That is a structural defect worth fixing before you touch anything cosmetic.

# Failing example
A scuba-diving certification school sells a $1,800 open-water cert that runs over 10 days, but buries the page five clicks deep: home, then a region menu, then a dive-site list, then a single reef page, then finally the open-water cert page itself. The BFS records the cert page at depth 5, past the 3-click ceiling, and links/link-depth fires at info — so the page driving 40% of revenue is the one Googlebot reaches last. Worse, the school's nitrox-specialty page is linked only from a retired blog post that nothing else points to, so no chain reaches it from the root: the rule reports it as unreachable-from-root at warning severity, and a crawler starting at the homepage would never find it.

# Passing example
The same scuba school flattens its architecture. The homepage links straight to a course hub, and the hub links directly to every certification page — open-water, advanced, rescue diver, and nitrox specialty — so each cert page sits exactly 2 clicks from the root, comfortably inside the 3-click ceiling. The dive log, wetsuit-and-regulator rental, buoyancy clinic, and decompression-theory pages are all cross-linked from the hub too, so the BFS reaches every URL and not one page is stranded. Within 4 weeks of the restructure, organic impressions on that $1,800 cert page climb roughly 30% as Googlebot crawls it early and internal equity flows to it. links/link-depth stays silent: nothing is buried, nothing is an island.

# How to fix
- Link your deepest money pages directly from a hub or category page so the BFS reaches them in 2 to 3 clicks instead of 5 or 6.
- Audit any page reported as unreachable-from-root first — that is a structural island, and adding a single navigational link from a reachable page fixes it.
- Flatten deep taxonomies: collapse redundant intermediate index pages that add a click without adding value to a visitor or a crawler.
- Add contextual in-content links from popular shallow pages down to important deep ones, so equity has a short path to follow.
- Re-run the audit after restructuring, because moving one hub link can lift an entire subtree of pages back inside the 3-click ceiling at once.
- Do not rely on an XML sitemap to rescue a buried page — a sitemap aids discovery but does not pass the internal PageRank that depth controls.

# Related rules
- [orphan-pages](../links/orphan-pages.md)
- [dead-ends](../links/dead-ends.md)
- [cluster-connectivity](../links/cluster-connectivity.md)

# Sources
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Google's crawl-budget guidance warns that pages buried deep in a site's link structure are fetched last and least often. links/link-depth runs a breadth-first search from your root URL, records the minimum click-distance to each page, and flags anything beyond 3 hops as info severity — matching the practical crawl-frequency drop-off Google associates with deep internal hierarchies.
- [Google Search Central — Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview) — Google's sitemaps documentation recommends that all important pages be reachable within a small number of clicks from the homepage. links/link-depth surfaces a second finding — warning severity — for any URL the BFS cannot reach at all from the root, a gap a sitemap alone cannot fully compensate for if internal links are absent.
