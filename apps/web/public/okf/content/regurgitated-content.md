---
type: pSEO Audit Rule
title: "Regurgitated Content: When Your Directory Is Just the Google Places API Reskinned"
description: "Lifting names, reviews, and photos from the Google Places API with no curation is a redistribution layer, not a page. How content/regurgitated-content flags it."
resource: https://pseolint.dev/rules/regurgitated-content
ruleId: "content/regurgitated-content"
tags: [content, "google places api regurgitation SEO"]
---

# Regurgitated Content: When Your Directory Is Just the Google Places API Reskinned

> content/regurgitated-content is a low-confidence v1 heuristic that fires a warning when a page shows at least 2 of 5 Google-Places-regurgitation tells: Powered by Google attribution, googleusercontent images over 60%, a Static Maps embed, Places API JavaScript, or an aggregator footprint of 5 or more unsigned star-rating blocks.

_Rule `content/regurgitated-content` · [live explainer](https://pseolint.dev/rules/regurgitated-content)_

# What it detects
content/regurgitated-content looks for one shape: a page that lifts business names, reviews, addresses, and photos straight from the Google Places API and presents them as a directory with nothing of its own added on top. It reads five independent signals per page and fires only when at least 2 of them are present.

The signals are specific. (1) Google Places attribution: a 'powered by google' string, or a noopener anchor pointing at google.com/maps. (2) Google images dominate: once a page has 3 or more images, the rule fires this signal when over 60% of them are hosted on googleusercontent.com, the Places photo endpoint, or Street View pixels. (3) Static Maps or Maps embed: a maps.googleapis.com/maps/api/staticmap source, or a google.com/maps/embed iframe. (4) Places API JavaScript: a google.maps.places.PlacesService or AutocompleteService marker in the markup. (5) Aggregator footprint: 5 or more elements carrying a star rating (Unicode stars, a 4.5/5 fraction, or the word 'stars') on a page that shows fewer than 2 of 3 E-E-A-T signals (author, published date, an /about link).

Severity is fixed at warning and confidence is low. This is a v1 heuristic that reasons about structure, never about a licence: it cannot read a Places API contract or know whether you have permission. It only sees the fingerprint that raw redistribution leaves behind.

# Why it matters
The Places API is a fine data source. The problem this rule names is using it as the entire product: a redistribution layer with no proprietary value, where every fact, photo, and rating on the page is something a reader could have pulled from Google Maps in one tap. When a directory adds nothing a user cannot already get from the source, the page is competing with Google using Google's own data, which is a losing position in the index and an obvious scaled-content tell.

The 2-of-5 threshold is deliberately loose because each signal alone is innocent, plenty of legitimate pages embed one map. Two signals together start to describe a page whose substance is borrowed: Google-hosted photos plus a Static Maps embed, or Places attribution plus a wall of unsigned star ratings. The pattern, not any single tell, is what the heuristic is reaching for.

Because confidence is deliberately low, a finding here is a prompt to audit, not a verdict. A genuine local guide that embeds a map and quotes a couple of reviews can trip two signals while adding real editorial value the rule cannot see. Treat the warning as 'this page looks like a thin redistribution layer: confirm it adds something the API does not.'

# Failing example
TikiFinder, a 600-page craft-cocktail-lounge directory, ships a page per bar that is pure Places API reskin. The lounge's name, address, and 5 most recent reviews come straight from the API; 9 of its 11 photos are googleusercontent.com hero shots of the bar's signature mai tai and ceramic tiki mugs (82% Google-hosted); a Static Maps embed pins the entrance; and a star-rating block repeats '4.6/5 stars' under every review with no byline, no published date, no /about page. Four of the five signals trip. There is not one sentence about the rum flight, the bitters program, or the garnish work that a reader could not have read on Google Maps 12 seconds earlier.

# Passing example
The same TikiFinder page, rebuilt as an actual guide. The embedded map and a single attributed Google review stay (that is fine) but the page now leads with 300 words the API does not hold: the editor visited, ranked the lounge's 8 rum flights, photographed the house orgeat and the hand-carved tiki mug collection with the directory's own camera (so only 18% of images are Google-hosted), and named the bartender who built the bitters menu in a signed byline with a published date. Two Places signals remain, but the page now carries proprietary tasting notes, original garnish photography, and a named author, substance the raw Places API never had.

# How to fix
- Add proprietary substance the API does not hold: original tasting notes, a ranked verdict, a first-person visit log, so the page is more than a redistribution layer.
- Shoot and host your own photography. When your own images outnumber googleusercontent.com hero shots, the Google-images-dominate signal stops firing and the page stops looking lifted.
- Keep one attributed Google review if you like, but write your own editorial summary alongside it rather than republishing a wall of 5-plus star-rating blocks verbatim.
- Attach E-E-A-T: a named byline, a published date, and an /about page describing how you evaluate each venue, which both clears the aggregator-footprint signal and answers the trust question.
- Use the embedded map as a convenience, not the content: one Static Maps embed is fine when the words around it are yours and not the API's.
- If a page genuinely has nothing to add beyond the Places data, merge it or cut it rather than shipping a thin reskin that competes with Google using Google's own facts.

# Related rules
- [unique-value](../content/unique-value.md)
- [thin-content](../spam/thin-content.md)
- [value-add](../content/value-add.md)

# Sources
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): Scaled-content-abuse policy prohibits pages produced at volume with little original contribution; content/regurgitated-content operationalises that boundary by requiring at least 2 of 5 Places-API tells (including image CDN saturation above 60% and map embeds) before accusing a directory page of adding nothing beyond a third-party data feed.
- [Google Search Central: Spam policies: site reputation abuse](https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse): Site-reputation-abuse policy targets sections that borrow a host's authority to re-surface third-party data; a directory relying on location and fake-authority cliché families alongside Places API image and markup tells is a structural match for that policy, which is why content/regurgitated-content fires only when multiple independent signals converge.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): People-first guidance asks whether a page offers meaningful value beyond what aggregator feeds already provide; unsigned star-rating clusters and attribution footprints are the concrete absence-of-original-contribution signals content/regurgitated-content weighs in its 2-of-5 threshold.
