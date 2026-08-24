---
type: pSEO Audit Rule
title: "Generic Anchor Text: When Half Your Internal Links Say Read More"
description: "Read more tells Google nothing about the destination. How links/generic-anchor-text scores internal anchors against a 16-phrase set and reports at the 50% mark."
resource: https://pseolint.dev/rules/generic-anchor-text
ruleId: "links/generic-anchor-text"
tags: [links, "generic anchor text"]
---

# Generic Anchor Text: When Half Your Internal Links Say Read More

> links/generic-anchor-text reports at info severity as soon as half or more of a page's internal links carry one of 16 generic labels such as read more, click here, learn more or details, evaluated only on pages holding at least 5 internal links, because anchor text is the description Google and AI answer engines attach to whatever sits at the other end.

_Rule `links/generic-anchor-text` · [live explainer](https://pseolint.dev/rules/generic-anchor-text)_

# What it detects
Half is the line. The rule computes one ratio per page, generic internal anchors divided by total internal anchors, and reports at info severity with medium confidence once that ratio reaches 0.5 on a page carrying at least 5 internal links. Below 5 internal links the page is skipped without evaluation, so a sparse footer never trips it. Scope is strictly internal: each href is resolved against the page URL, and only http and https targets whose host matches the page's own host are counted. A relative href such as /clinics/riverside-veterinary-hospital always qualifies as internal; an outbound link to a state veterinary licensing board is never counted in either the numerator or the denominator. Pages with empty HTML, and pages whose own URL fails to parse, are dropped before counting begins.

An anchor's effective text is its trimmed text content, falling back to the alt attribute of its first nested <img> so that image links are judged by the label they actually present. That string is lowercased and stripped of trailing punctuation from the class [.!?,:;>-] plus ellipsis and arrow characters, then matched against a fixed set of 16 phrases: click here, here, read more, learn more, more, link, this, this page, see more, details, more info, continue, continue reading, click, go, start. Empty effective text counts as generic too, since an unlabelled anchor carries no destination signal whatsoever. Read more and Read more. and Read more with a trailing arrow all normalise to the same entry, which is why decorating the label defeats nothing. The finding reports the generic count, the internal total, the rounded percentage, and up to 3 verbatim samples.

# Why it matters
A veterinary clinic directory covering 1,900 practices renders each listing as a card: practice name in an h3, street address, an opening-hours line, and a single link reading Read more. On a county page showing 24 cards, that is 24 internal links out of roughly 30 once the breadcrumb and pagination are included, a ratio near 0.8 that clears the 0.5 threshold with room to spare. Google's link guidance describes anchor text as how it works out what the linked page is about, so the directory spends its entire internal-linking vocabulary on the same two words 1,900 times. The destination pages are genuinely differentiated (species treated, emergency hours, whether the practice runs an on-site laboratory) and none of that reaches the crawler through the links.

The cost shows up twice. Internally, every clinic page is described to Google identically, so a search for an emergency exotic-animal vet has nothing in the link graph pointing it toward the four practices that actually offer it. Externally, answer engines increasingly label a citation with the anchor or heading text that led to it, and Google's AI-features documentation ties eligibility to content being clearly structured and understandable. This rule is deliberately the mildest in pseolint's link family, info severity at medium confidence, because generic anchors are a wasted opportunity rather than a policy violation. Nothing in Google's spam policies prohibits the phrase read more; competitors that report it as a critical error are inventing a severity the documentation does not support.

# Failing example
/vets/marion-county on the clinic directory renders 24 practice cards, each closing with <a href="/clinics/riverside-veterinary-hospital">Read more</a>. Adding the breadcrumb and the two pagination links gives 27 internal links, of which 24 normalise to read more, a ratio of 0.89. One card uses an image link whose img alt is empty, so it is counted as generic as well, taking the total to 25 of 27 (93%). The rule reports at info severity and quotes three samples, all of them the identical string.

# Passing example
The same /vets/marion-county page after each card's link is rewritten to name its destination: <a href="/clinics/riverside-veterinary-hospital">Riverside Veterinary Hospital: 24-hour emergency and exotics</a>. The image link's img alt becomes the practice name rather than an empty string. Generic anchors fall to 2 of 27 (7%), well under the 0.5 threshold, and every clinic page now receives an internal link whose text states both its identity and its differentiating service, which is the label an answer engine reuses when it cites the page.

# How to fix
- Replace card call-to-action labels with the destination entity's own name, and append the one attribute that distinguishes it from sibling entries.
- Fix the shared card component rather than individual pages; a directory template repeats the same anchor thousands of times from one line of JSX.
- Give image links a meaningful img alt, because the rule falls back to that alt and treats an empty one exactly like the phrase click here.
- Keep the visible affordance if designers want one, by wrapping the descriptive text and styling it as a button rather than shortening the label.
- Audit the 16 matched phrases against your own copy deck so writers stop reintroducing them in new templates after the fix ships.
- Re-run pseolint and check the reported percentage rather than the raw count; the threshold is a ratio, so adding more generic links to a longer page does not help.

# Related rules
- [crawlable-anchors](../links/crawlable-anchors.md)
- [image-alt-text](../content/image-alt-text.md)
- [dead-ends](../links/dead-ends.md)

# Sources
- [Google Search Central: Make your links crawlable](https://developers.google.com/search/docs/crawling-indexing/links-crawlable): The anchor-text section of Google's links documentation states that link text is how Google works out what the destination is about, which is what the rule measures when it counts the 16 tracked generic phrases against a page's internal links and reports at the 0.5 ratio.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): Google's AI-features guidance ties eligibility for generated answers to pages whose subject is plainly stated; a clinic card linked as its practice name plus its emergency-hours policy supplies that label directly, whereas 24 anchors reading read more supply none.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials frames descriptive linking as baseline quality rather than a spam boundary, which is why this rule stays at info severity with medium confidence instead of joining the critical stack that near-duplicate and doorway findings feed.
