---
type: pSEO Audit Rule
title: "Sitemap Hygiene: Cross-Host URLs, Build-Stamped lastmod, and Ignored Fields"
description: "One nightly timestamp across 12,000 URLs teaches Google to ignore lastmod. How tech/sitemap-hygiene rolls up cross-host locs, bad dates, and build-stamped sitemaps."
resource: https://pseolint.dev/rules/sitemap-hygiene
ruleId: "tech/sitemap-hygiene"
tags: [tech, "sitemap lastmod accuracy"]
---

# Sitemap Hygiene: Cross-Host URLs, Build-Stamped lastmod, and Ignored Fields

> Google uses lastmod only when the value is consistently and verifiably accurate, so tech/sitemap-hygiene reports a sitemap as build-stamped once at least 100 URLs carry the field and 95% of them repeat one identical value, one of five rollup checks it runs alongside cross-host locs, unparseable URLs, dates more than 24 hours in the future, and non-W3C datetimes.

_Rule `tech/sitemap-hygiene` · [live explainer](https://pseolint.dev/rules/sitemap-hygiene)_

# What it detects
Findings are rollups, one per issue kind, never one per URL. A sitemap with 436 cross-host entries yields a single error carrying the count in its message and at most 10 example URLs in `relatedUrls`, sorted so successive runs stay byte-identical. The check runs over the collected `<loc>` set plus a lastmod map against the audit's source URL, and returns nothing at all when the sitemap is empty. Host comparison normalises both sides: hostnames are lowercased and a leading `www.` is stripped, so `www.example.com` and `example.com` match while `listings.example.com` does not.

Cross-host entries are the only error-severity finding here. The Sitemaps protocol requires URLs to reside on the same host as the sitemap, and non-compliant entries are dropped from consideration; the fix string names Google's two documented exceptions, both hosts verified in the same Search Console account, or the target host's robots.txt declaring the sitemap through a `Sitemap:` directive. Entries that `new URL()` cannot parse at all, such as relative paths or a missing scheme, are reported separately as a warning, because a `<loc>` must be a fully-qualified absolute URL.

Three lastmod checks follow, all at warning severity. A parseable date more than 24 hours ahead of the audit clock is flagged as future-dated, the tolerance absorbing timezone sloppiness rather than genuine forward-dating. A value matching neither `YYYY-MM-DD` nor a full W3C datetime, such as `20/08/2026` or an epoch integer, is flagged as unparseable. The generated-lastmod heuristic is last and is the only medium-confidence finding: once at least 100 URLs carry the field, if 95% or more share one identical value, the sitemap is reported as build-stamped rather than modification-stamped. Note what is absent from all of this. `priority` and `changefreq` are never checked in either direction, because Google documents that it ignores both.

# Why it matters
lastmod is the only sitemap hint Google says it acts on, and the promise is qualified: the value is used when it is consistently and verifiably accurate, and ignored otherwise. That judgement lands on the file, not on individual entries. A pipeline writing the deployment timestamp into all 12,000 rows every night is not supplying a weak signal, it is training Google to stop reading the field for that domain, including on the handful of URLs where the date happened to be real.

The 95% share is set where accident stops being a plausible explanation. Genuine inventory does not update in lockstep; a portal whose listings change price, gain photos, and go under offer at different hours produces a scattered distribution of dates across the week. One value covering nineteen URLs in twenty has exactly one cause, and it is the generator. The companion 100-URL minimum keeps the heuristic off small sitemaps, where a handful of pages legitimately shipping together would otherwise look manufactured.

Cross-host entries fail in a different way: not distrusted, discarded. The protocol drops them from consideration, so a portal listing its detail pages under a `listings.` subdomain from the apex sitemap has effectively submitted those URLs to nobody. They may still be found through internal links, later and more slowly, which is why the symptom presents as sluggish indexing of new inventory rather than as an error on any dashboard.

# Failing example
A real-estate listings portal serves `https://www.harborline-realty.example/sitemap.xml` with 12,480 `<loc>` entries. 436 of them point at `listings.harborline-realty.example` and `photos.harborline-realty.example`, so the rule fires one error naming 436 and lists 10 sorted examples rather than 436 lines of noise. Every entry also carries a lastmod, and 12,061 of the 12,480 read `2026-08-20T03:15:00Z`, the moment the nightly build ran: at 96.6% that clears the 95% share and the 100-URL minimum, producing a second finding at medium confidence. A further 58 entries carry `20/08/2026`, which is not a W3C datetime, and 7 are dated 2026-09-01, eleven days ahead of the audit clock. Four rollups for roughly 12,500 URLs.

# Passing example
The portal splits the file. `listings.harborline-realty.example` gets its own sitemap, declared by a `Sitemap:` line in that host's robots.txt, and the apex serves a sitemap index referencing both, so all 436 cross-host entries disappear and the error clears. The generator now reads each listing's real `updated_at` column instead of calling `Date.now()` once per build, and the most-repeated lastmod value falls to 1,204 of 12,044 URLs, about 10% and far below the 95% share. The 58 day-first strings are reformatted to `2026-08-20`, and the 7 future dates, a staging-server clock skew, are removed by a build-time clamp.

# How to fix
- Give every host its own sitemap and reference them from a sitemap index. Declaring the sitemap with a Sitemap: line in the target host's robots.txt is the documented alternative when splitting is impractical.
- Emit each URL's real modification timestamp from your data layer, or omit lastmod entirely. An absent field is treated better than one that is uniformly false across the whole file.
- Stop writing build time into lastmod. A single Date.now() call at generation is exactly what produces the 95%-identical-value pattern this rule reports.
- Format every date as W3C datetime, either 2026-08-20 or 2026-08-20T09:30:00Z. Day-first strings and epoch integers are rejected outright and count as unparseable.
- Clamp future dates at build time. A lastmod more than 24 hours ahead of now is nearly always a staging clock or a timezone bug rather than a scheduled publication.
- Delete priority and changefreq from the generator. Google documents that it ignores both, so they add file size and review time while changing nothing about how the sitemap is read.

# Related rules
- [publication-velocity](../spam/publication-velocity.md)
- [url-pattern](../cannibal/url-pattern.md)
- [crawler-access](../aeo/crawler-access.md)

# Sources
- [Google Search Central: Build and submit a sitemap (lastmod guidance)](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): Google's build-a-sitemap guidance says lastmod is used only when it is consistently and verifiably accurate and ignored otherwise, and documents that priority and changefreq are ignored outright. That is the basis for the generated-lastmod heuristic (at least 100 URLs with the field, 95% sharing one value) and for the rule checking neither of the two ignored fields.
- [sitemaps.org: Sitemaps XML protocol](https://www.sitemaps.org/protocol.html): The sitemaps.org protocol requires every URL in a sitemap to reside on the same host as the sitemap itself and specifies that non-compliant entries are dropped from consideration; that rule is why cross-host entries are the single error-severity finding here. It also defines <loc> as a fully-qualified absolute URL, which is what the unparseable-entry check enforces.
- [Google Search Central: Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget): The large-site crawl-budget guidance describes Googlebot deprioritising low-information fetches, which is the mechanism that turns a build-stamped sitemap into slower recrawls of genuinely updated listings. Combined with 436 cross-host URLs falling back to internal-link discovery, it explains why the symptom appears as sluggish indexing rather than as a reported error.
