---
type: pSEO Audit Rule
title: "Viewport Meta: Pages Google Renders as a Shrunken Desktop"
description: "A viewport tag without width= counts as missing. How tech/viewport-meta scans every meta tag, why Google judges the phone render, and what 12,000 legacy templates cost."
resource: https://pseolint.dev/rules/viewport-meta
ruleId: "tech/viewport-meta"
tags: [tech, "viewport meta tag SEO"]
---

# Viewport Meta: Pages Google Renders as a Shrunken Desktop

> A viewport meta tag satisfies tech/viewport-meta only when its content attribute actually contains the substring width=, which means content="initial-scale=1" is treated as no viewport at all, and every page failing that single test collects one high-confidence warning because Google crawls with a smartphone agent and evaluates the shrunken desktop render it receives.

_Rule `tech/viewport-meta` · [live explainer](https://pseolint.dev/rules/viewport-meta)_

# What it detects
The check runs against the served HTML, skips any page whose markup is empty, and sweeps every meta tag in the document with a regular expression rather than a DOM query, so it sees the bytes a crawler parses rather than a hydrated result. For each tag it pulls the name attribute in all three forms authors actually write, double-quoted, single-quoted, or bare, then trims it, lowercases it, and discards anything that is not exactly viewport. Surviving tags have their content attribute read the same three ways, lowercased, and tested against one condition: does it contain width=. The first tag that satisfies it ends the sweep and clears the page. Any page reaching the end without one produces a single finding at warning severity and high confidence, naming the URL.

Two consequences of that test deserve stating plainly. A viewport tag can be present and still fail: content="initial-scale=1" declares a zoom level and no width, an empty content attribute declares nothing, and a bare tag with no content attribute is handled exactly like a missing one. Meanwhile content="width=1024" passes, because the rule asks whether a width is declared, not whether the value is wise. Lighthouse's SEO audit accepts either a width or an initial-scale, so pseolint sits one notch stricter than the tool most teams already run, on the grounds that initial-scale alone leaves the layout viewport at the browser fallback. And because the sweep reads HTML as served, a viewport injected by client-side JavaScript after hydration does not count, which is the commonest reason a page that looks correct in DevTools still reports a finding.

On Midland Works, a regional job board covering Ohio, Michigan, and Indiana, this finding arrives 12,000 times in one audit. Employer profile pages migrated to a rebuilt template two years ago and pass cleanly. The listing pages still render through a 2011 head partial whose only concession to mobile is a leftover meta name="MobileOptimized" content="980" tag from the Windows Phone era, which neither this rule nor any current crawler recognises. Twelve thousand warnings from one shared partial is one defect, reported per page because per page is where the consequence lands.

# Why it matters
Google crawls with a smartphone agent, and since July 5, 2024 it has indexed only pages reachable on mobile devices, so the render evaluated for a listing page is the phone render rather than the desktop one the template was designed against. With no width declared, mobile Chrome falls back to a layout viewport near 980 CSS pixels and scales the result down to fit the screen. On a 390-pixel iPhone viewport that works out to roughly 40 percent scale: a 44-pixel Apply button lands near 17 pixels, and 16-pixel body copy near 6. The markup is untouched, every salary figure on the page is accurate, and the page is nonetheless assessed in its least usable state.

For a job board that state is the product. A listing's salary band, its location, and its Apply control are the entire reason the URL exists, and applicants overwhelmingly arrive from phones. There is also no first-party dashboard left to catch it: Search Console's Mobile Usability report and the standalone Mobile-Friendly Test were both retired on December 1, 2023, which moved this class of defect out of a panel somebody occasionally glances at and into the build, where a linter has to find it. Twelve thousand listing pages is far past the point where anyone notices by hand, and the pages that need it most are the newest ones nobody has opened yet.

Knock-on effects run through Core Web Vitals, which are measured on the render real users get. A 980-pixel layout squeezed into 390 pixels produces tap targets small enough to mis-hit, text that forces a pinch-zoom on every visit, and reflow as the browser wrestles with a fixed-width wrapper it cannot honour. The legacy tap delay browsers once applied before dispatching a click was dropped for pages declaring a mobile-configured viewport, so the listing template pays an interaction cost the employer profile template does not. That internal inconsistency is a signal of its own: one domain, two templates, and a measurable usability gap between them tracing back to a single absent line of markup.

# Failing example
midlandworks.example/listings/cnc-machinist-toledo-oh-48210: the head carries a title, a canonical, an og:image, and a meta name="MobileOptimized" content="980" tag left over from the 2011 build, but no viewport tag of any kind. The stylesheet hard-codes the page wrapper at width: 980px. On a 390-pixel phone viewport the whole listing renders at about 40 percent scale, putting the $28.50-per-hour salary band around 6 pixels tall and the Apply button near 17 pixels wide. tech/viewport-meta emits one warning here and 11,999 more across the identical listing template.

# Passing example
The same URL after one line reaches the shared head partial: a meta name="viewport" tag with content="width=device-width, initial-scale=1", shipped alongside a stylesheet change turning the wrapper's width: 980px into max-width: 980px with fluid columns beneath. The content string contains width=, so all 12,000 listing pages clear in a single deploy, and the 390-pixel render now shows the $28.50-per-hour band at full 16-pixel type with a 44-pixel Apply target. Shipping the tag without the CSS would have cleared the finding while leaving applicants scrolling sideways through a 980-pixel layout, which is why the two go out together.

# How to fix
- Add a meta name="viewport" tag with content="width=device-width, initial-scale=1" to the shared head partial the listing template renders. One edit clears all 12,000 findings.
- Ship the tag and the fluid CSS in the same deploy. Declaring width=device-width over a hard-coded 980px wrapper trades a shrunken page for a horizontally scrolling one, which applicants like even less.
- Delete the legacy substitutes. MobileOptimized, HandheldFriendly, and a separate m-dot host satisfy neither this rule nor a smartphone crawler, and leaving them in place makes the head look handled when it is not.
- Keep pinch-zoom alive: content="width=device-width, user-scalable=no" passes the rule because it contains width=, and still strips zoom from applicants reading a salary band at 6 pixels.
- Render the tag server-side. A viewport written by client-side JavaScript is absent from the HTML this rule reads and absent from the crawler's initial parse of the document.
- Group findings by template before triaging. Twelve thousand warnings that all trace to one head partial is a single bug, and treating it as 12,000 is how it stays unfixed.

# Related rules
- [html-size](../tech/html-size.md)
- [heading-structure](../content/heading-structure.md)
- [image-alt-text](../content/image-alt-text.md)

# Sources
- [web.dev: Web Vitals](https://web.dev/articles/vitals): Core Web Vitals are measured on the render a real visitor gets, and for Midland Works's 12,000 listing pages that render is a 980-pixel layout scaled to roughly 40 percent on a 390-pixel phone, where tap targets land near 17 pixels and reflow around the fixed wrapper is unavoidable.
- [Google Search Central: Meta tags and HTML attributes Google supports](https://developers.google.com/search/docs/crawling-indexing/special-tags): Google's list of supported meta tags documents viewport as the tag that tells a mobile browser how to lay out the page. This rule counts it only when the content attribute declares a width, which is exactly the part a content="initial-scale=1" tag leaves undone.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials sets the baseline that a page must work for the crawler fetching it, and since July 5, 2024 that crawler is a smartphone agent for every site, which makes a viewport missing from 12,000 listing pages an indexing-eligibility concern rather than a cosmetic one.
