---
type: pSEO Audit Rule
title: "Crawlable Anchors: How Click-Handler Navigation Hides Pages From Googlebot"
description: "Googlebot follows href attributes, never onClick handlers. How links/crawlable-anchors counts unreachable <a> elements and when a warning escalates to an error."
resource: https://pseolint.dev/rules/crawlable-anchors
ruleId: "links/crawlable-anchors"
tags: [links, "crawlable links"]
---

# Crawlable Anchors: How Click-Handler Navigation Hides Pages From Googlebot

> Googlebot follows only <a> and <area> elements carrying a resolvable href, so links/crawlable-anchors raises a warning the moment 3 anchors on a page have no usable href, or when 20% of at least 5 anchors turn out to be click-handler pseudo-links, and escalates to error at 5 broken anchors on a page left with fewer than 2 crawlable same-host destinations.

_Rule `links/crawlable-anchors` · [live explainer](https://pseolint.dev/rules/crawlable-anchors)_

# What it detects
Three anchors with no resolvable href is where this rule starts reporting. It loads each page's HTML with cheerio, walks every <a> element in document order, and treats exactly three shapes as non-crawlable: an href attribute that is missing or trims to an empty string, which is precisely what a React <a onClick={handleNav}> renders; an href beginning with javascript: in any casing; and an href of exactly # on an element that also carries onclick or one of six framework router attributes matched by name (routerlink, data-router-link, to, ng-click, @click, v-on:click). Nothing outside that list is counted. A genuine fragment target such as href="#deposit-policy" passes untouched, mailto: and tel: pass, and <button> elements are never inspected at all, because a button is legitimately not a link. Pages whose HTML is empty or whitespace-only are skipped before any parsing happens.

Two independent conditions raise a finding. The absolute one fires when 3 or more anchors on a single page are non-crawlable. The proportional one fires when a page carries at least 5 anchors and 20% or more of them fail, which catches compact navigations that would slip under the absolute count. Severity then depends on how much reachable navigation survives: warning by default, escalating to error when 5 or more anchors are non-crawlable AND the page retains fewer than 2 crawlable same-host links. That survivor count is deliberately strict, since fragment-only hrefs, mailto:, tel:, and any non-HTTP protocol are excluded from it, and cross-host links do not rescue the page. An error therefore means Googlebot arriving here has almost nowhere left to go. Every finding is emitted at high confidence and quotes up to 3 offending anchor labels, each truncated at 40 characters, so you can trace the component that produced them.

# Why it matters
Picture an outdoor-gear rental marketplace listing sea kayaks, avalanche beacons and canyoning kit. Its category navigation is one React component, and each of the 18 gear categories renders as <a onClick={() => router.push('/rent/sea-kayaks')}> with no href, because the team wanted a route-transition spinner between pages. In a browser this behaves flawlessly. To Googlebot it is 18 fragments of styled text. Google's crawlable-links guidance is explicit that the crawler follows a link only when it is an <a> element with a resolvable href, and that it does not click elements or simulate user interaction; Lighthouse ships the identical test as its crawlable-anchors audit. So /rent/avalanche-beacons and /rent/canyoning-kit render, convert, and take deposits, while remaining discoverable only through whatever else happens to reference them.

The failure survives redesigns because nothing visibly breaks. The XML sitemap still lists all 18 hubs, so they get crawled and often indexed, but they receive no internal link equity from the navigation that is supposed to feed them, and the marketplace's 2,400 individual gear listings sit two router hops below a menu Googlebot never traverses. Google's large-site crawl-budget guidance describes exactly this outcome: URLs that arrive with weak internal signals are refetched less often, so seasonal inventory changes (beacon stock before a January avalanche-safety course rush, canyoning kit in June) reach the index late or not at all. When the rule escalates to error on a hub page with fewer than 2 crawlable same-host links, that page is functionally a dead end for the crawler even though a human sees a full menu.

# Failing example
/rent/avalanche-beacons on the rental marketplace ships 22 <a> elements. Sixteen are the category menu, rendered as <a className="nav-item" onClick={() => router.push('/rent/canyoning-kit')}>Canyoning kit</a> with no href attribute at all; three more are href="javascript:void(0)" filter toggles for beacon frequency. That leaves 19 of 22 anchors non-crawlable (86%) and exactly 1 crawlable same-host link, the footer's /terms. Both the 3-anchor absolute condition and the 20%-of-5 proportional condition fire, and because 19 exceeds 5 while crawlable same-host links number fewer than 2, the finding is reported at error severity.

# Passing example
The same /rent/avalanche-beacons page after the menu is rewritten as <Link href="/rent/canyoning-kit"> so every item emits a real <a href="/rent/canyoning-kit">, with the router transition attached to the click event rather than replacing the href. The three beacon-frequency filters become <button type="button"> elements, which the rule never inspects. The page now reports 19 crawlable same-host anchors and 0 non-crawlable ones, so neither the 3-anchor absolute trigger nor the 20% proportional trigger is reachable, and the 2,400 listing pages below the menu gain a real crawl path.

# How to fix
- Render a real href on every navigation anchor and attach the router transition to the click event instead of replacing the href; frameworks all support this via their Link component.
- Convert genuine in-page controls (filter toggles, accordions, sort switches) to <button type="button"> so they stop being counted as broken links at all.
- Grep the codebase for href="javascript: and href="#" paired with onClick, then fix the shared component rather than the individual pages the audit happened to sample.
- Check the error-severity findings first: those are pages left with fewer than 2 crawlable same-host links, meaning Googlebot has no onward path from them.
- Verify the fix by fetching the page with JavaScript disabled, or by using URL Inspection's rendered HTML, and confirming the hrefs are present in the markup Googlebot receives.
- Do not treat the XML sitemap as a substitute; it supplies discovery but no internal link context, so orphaned hubs stay orphaned.

# Related rules
- [dead-ends](../links/dead-ends.md)
- [link-depth](../links/link-depth.md)
- [cluster-connectivity](../links/cluster-connectivity.md)

# Sources
- [Google Search Central: Make your links crawlable](https://developers.google.com/search/docs/crawling-indexing/links-crawlable): Google's make-your-links-crawlable guidance is the primary basis for the rule's classification set: only <a> elements with a resolvable href are followed, so pseolint counts a missing or empty href, a javascript: href, and href="#" paired with onclick or a router attribute as unreachable navigation.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): The large-site crawl-budget guide explains why the error escalation matters: a rental hub left with fewer than 2 crawlable same-host links passes almost no internal signal onward, so its 2,400 listing URLs are refetched less often and seasonal stock changes reach the index late.
- [Google Search Central: Googlebot and its crawl limits](https://developers.google.com/search/docs/crawling-indexing/googlebot): The Googlebot reference documents the evergreen Chromium renderer that made JavaScript execution routine after May 2019, which is exactly the capability this rule bounds: scripts run and the DOM is built, but the crawler never clicks a handler to discover a route hidden inside onClick.
