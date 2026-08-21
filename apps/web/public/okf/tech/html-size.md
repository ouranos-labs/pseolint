---
type: pSEO Audit Rule
title: "HTML Size: The 2 MB Per-File Cutoff That Truncates Your Markup"
description: "Googlebot reads the first 2 MB of each fetched file, uncompressed. How tech/html-size warns at 1.5 MB, errors at 2 MB, and why inlined data payloads bury your JSON-LD."
resource: https://pseolint.dev/rules/html-size
ruleId: "tech/html-size"
tags: [tech, "Googlebot 2MB HTML limit"]
---

# HTML Size: The 2 MB Per-File Cutoff That Truncates Your Markup

> Googlebot reads only the first 2 MB of any single fetched file, uncompressed, so tech/html-size warns the moment a document's UTF-8 byte length reaches 1,572,864 bytes (1.5 MB) and escalates to an error at 2,097,152 bytes (2 MB), the point where markup, links, and JSON-LD past the cutoff stop existing as far as Google is concerned.

_Rule `tech/html-size` · [live explainer](https://pseolint.dev/rules/html-size)_

# What it detects
The rule measures one number: the UTF-8 byte length of the served HTML document, computed with Buffer.byteLength over the page markup. Anything below 1,572,864 bytes (1.5 MB) is skipped before a finding is ever constructed, so most sites never see this rule fire at all. From 1.5 MB up to the cutoff the finding is a warning; at 2,097,152 bytes (2 MB) and above it becomes an error. Both tiers carry high confidence, and both name the page URL alongside its size rounded to one decimal place. There is no site-wide aggregate, no percentage, and no averaging: each document is judged on its own bytes, which is exactly how Googlebot fetches it.

What the rule deliberately does not measure matters as much. Google's Googlebot documentation caps a crawl at the first 2 MB of each fetched file, uncompressed, with PDFs given 64 MB; the February 2026 revision of that page replaced the 15 MB figure most audit tools still quote. The budget is per resource, so a stylesheet, a map bundle, and every JSON file a page loads each carry their own 2 MB allowance. A dataset page whose HTML is 118 kB while it streams 21 MB of vector tiles has a Core Web Vitals conversation ahead of it and no truncation problem whatsoever, and tech/html-size stays quiet on it. Compression is beside the point too: the limit applies to the uncompressed document, so a 340 kB gzip response can be a 2.6 MB file as far as the cutoff is concerned.

On a municipal open-data portal the trigger is almost always a hydration blob. Cascade County's portal renders each of its 1,840 dataset pages by inlining the entire record set into a script tag so a client-side grid can boot without a network round trip; on /datasets/street-tree-inventory that payload is 2.4 MB and the finished document weighs 2.6 MB. The rule reports 2.6 MB at error severity, and the remedy is structural rather than editorial. Nothing about the prose is wrong. The document is simply carrying data that belongs behind an endpoint.

# Why it matters
Truncation is silent. There is no HTTP error, no Search Console message, and no rendering failure to notice, because bytes past the cutoff are never handed to the parser and the crawled copy of the page just ends mid-document. On the street-tree page everything the county actually wanted indexed sits after the 2.4 MB payload: the license notice, the weekly refresh cadence, the 40 links to sibling datasets, and the schema.org Dataset JSON-LD. All of it lands past byte 2,097,152. Google receives an H1, a breadcrumb, and the opening of a script tag.

The link graph is the part that compounds. Each of those 1,840 dataset pages carries 40 outbound links to related records, every one of them on the far side of the cutoff, so a portal that looks densely interlinked in a browser hands Google 1,840 dead ends instead. Crawl economics degrade in parallel: a full pass moves roughly 4.7 GB while each document weighs 2.6 MB, against about 173 MB once the payload is served separately, and Google's crawl-budget guidance for large sites is direct about low-information fetches being deprioritised. A county that publishes 1,840 datasets is spending its entire crawl allowance transmitting a table Google will never read.

For an open-data portal the JSON-LD is not decoration. Google's Dataset structured-data support is what lets a municipal record set surface as a dataset rather than as an ordinary web page, and structured data has to be inside the fetched bytes to register. Cascade County can maintain flawless schema.org Dataset markup on all 1,840 pages and have precisely none of it counted, because in every single case the markup is written after the payload that pushed it past the cutoff. The failure is invisible in a browser, invisible in any check that pastes markup into a validator instead of fetching the URL, and invisible to anything reading the DOM after JavaScript has run.

# Failing example
data.cascadecounty.gov/datasets/street-tree-inventory ships 2.6 MB of HTML. A script tag of type application/json holds the full street-tree table inline, 86,400 rows of species, planting date, and trunk diameter, weighing 2.4 MB on its own so a client-side grid can render without a fetch. The license notice, the 40 related-dataset links, and the schema.org Dataset JSON-LD all sit after that block, past byte 2,097,152. tech/html-size fires an error, and Google indexes a page that appears to consist of a heading and nothing else.

# Passing example
The same URL after the payload moves to /api/datasets/street-tree-inventory.json, fetched on demand and paged 500 rows at a time: the document drops from 2.6 MB to 96 kB, comfortably under the 1.5 MB warning tier, and the rule stays silent. The server now renders a 12-row preview, the row count (86,400), the Monday 06:00 refresh cadence, the license notice, the schema.org Dataset JSON-LD, and all 40 related-dataset links inside the first 100 kB of markup, which puts every one of them not merely inside the 2 MB budget but near the top of it.

# How to fix
- Move hydration blobs out of the document: serve the 2.4 MB record set from a JSON endpoint the grid fetches after paint and keep the HTML a shell around it.
- Server-render a bounded preview instead of the whole table. Twelve rows plus a row count of 86,400 communicate the dataset as well as 86,400 inlined rows do, and cost four orders of magnitude less.
- Order the document so load-bearing markup comes first: JSON-LD, canonical, license text, and outbound dataset links belong above any large payload, so they survive even if a page creeps back over the line.
- Measure the byte length of the served HTML rather than the transfer size. The 2 MB budget is uncompressed, so a 340 kB gzip response can still be a 2.6 MB document.
- Treat the 1.5 MB warning tier as the real deadline. A dataset page sitting at 1.6 MB is one weekly refresh away from silent truncation, and nothing will tell you when it crosses.
- Split by resource rather than trimming blindly: the map bundle and the stylesheet each get their own 2 MB fetch allowance, so relocating bytes into a second file is a genuine fix, not a loophole.

# Related rules
- [viewport-meta](../tech/viewport-meta.md)
- [crawler-access](../aeo/crawler-access.md)
- [llms-txt](../aeo/llms-txt.md)

# Sources
- [Google Search Central: Googlebot and its crawl limits](https://developers.google.com/search/docs/crawling-indexing/googlebot): Google's Googlebot documentation sets the crawl limit at the first 2 MB of each fetched file, uncompressed, with 64 MB for PDFs; the February 2026 revision replaced the older 15 MB figure, and tech/html-size flags against the current number by warning at 1.5 MB and erroring at 2,097,152 bytes.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): Crawl-budget guidance for large sites warns that low-information fetches get deprioritised, which is what a 1,840-page open-data portal invites when every dataset document carries a 2.4 MB inline payload: a full pass moves roughly 4.7 GB to deliver content Googlebot stops reading partway through.
- [web.dev: Web Vitals](https://web.dev/articles/vitals): Core Web Vitals guidance is where total page weight belongs, and this rule deliberately leaves it there. A dataset page with 118 kB of HTML pulling 21 MB of vector tiles is a performance question, not a truncation one, and tech/html-size stays silent on it.
