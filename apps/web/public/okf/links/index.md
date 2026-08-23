---
type: Category
title: "links rules"
description: "pseolint links audit rules for programmatic SEO."
resource: https://pseolint.dev/rules
---

# links rules

- [Site Reputation Abuse: Detecting Parasite Sections on a Trusted Host](./host-section-divergence.md): Google's May 7, 2024 site-reputation-abuse policy demotes subfolders that borrow a host's reputation without earning it: links/host-section-divergence flags a URL section (e.
- [Orphan Pages: URLs No Other Page Links To](./orphan-pages.md): links/orphan-pages scans every URL in the crawl, counts the inbound internal links pointing at each one, and fires at error severity on any page with exactly 0 of them, the dead-zone shape that leaves Googlebot unable to reach a URL through your own navigation, a structural gap the March 27, 2026 core update treats as a discoverability failure rather than a content one.
- [Dead Ends: Pages With Zero Outbound Links to the Rest of Your Crawl](./dead-ends.md): links/dead-ends flags every crawled page (the homepage aside) whose outbound links include zero URLs that point to another page in the same crawl, the forward-flow gap that strands Googlebot and traps link equity, a warning a model-railway shop's 1,400 product listings hit when each turnout and locomotive page links only out to a vendor, never deeper into the store.
- [Link Depth: How Many Clicks From Home Before Googlebot Gives Up](./link-depth.md): links/link-depth runs a breadth-first search from your root URL and measures the shortest click-distance to every page, flagging anything past the default ceiling of 3 clicks as info and anything Googlebot cannot reach from the root at all as a warning, because a page Google crawls last is a page Google ranks last.
- [Cluster Connectivity: When a Directory of Pages Becomes a Topic Silo](./cluster-connectivity.md): links/cluster-connectivity groups every crawled URL by its parent directory, and for each cluster of 2 or more pages it checks whether a single internal crawl link enters from another cluster or leaves toward one: firing a warning when neither exists, because Google cannot diffuse authority into a directory that no other section of your site references or is referenced by.
- [Crawlable Anchors: How Click-Handler Navigation Hides Pages From Googlebot](./crawlable-anchors.md): Googlebot follows only <a> and <area> elements carrying a resolvable href, so links/crawlable-anchors raises a warning the moment 3 anchors on a page have no usable href, or when 20% of at least 5 anchors turn out to be click-handler pseudo-links, and escalates to error at 5 broken anchors on a page left with fewer than 2 crawlable same-host destinations.
- [Generic Anchor Text: When Half Your Internal Links Say Read More](./generic-anchor-text.md): links/generic-anchor-text reports at info severity as soon as half or more of a page's internal links carry one of 16 generic labels such as read more, click here, learn more or details, evaluated only on pages holding at least 5 internal links, because anchor text is the description Google and AI answer engines attach to whatever sits at the other end.
