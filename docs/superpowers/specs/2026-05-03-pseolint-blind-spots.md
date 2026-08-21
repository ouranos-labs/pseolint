# pseolint blind spots: what we don't detect (and why)

**Status:** living document, updated each release
**Date:** 2026-05-03
**Engine version at writing:** v0.5.2

This is the honest counterpart to the README and `/methodology` page. The
README lists 60 rules across 8 categories, what we *do* detect. This
document lists what we *don't*. We treat blind spots as a credibility
asset: a tool that names its limits is more trustworthy than one that
implies omniscience.

Blind spots are categorized by how impactful they are for a pSEO
operator and whether the gap is intentional architecture or a roadmap
item.

---

## Tier 1: meaningful gaps that affect verdict accuracy

These are the gaps a thoughtful operator should know about because they
directly shape how to read pseolint's verdict.

### 1.1 Domain authority / off-page signals

**What we don't detect:** backlinks, brand mentions, domain age, named
editorial leadership at the publisher level, PageRank-equivalent
signals, brand-search-volume.

**Why it's a real blind spot:** Google's quality systems weight authority
heavily. A 200-word integration page on Zapier ranks because it's
Zapier; the same page on a 6-month-old startup gets demoted. pseolint
cannot tell them apart.

**Why we don't fix it today:** the engine is meant to be runnable
offline against a build directory or local dev server. Pulling in
Moz/Ahrefs/Semrush would (a) require a paid SaaS dependency, (b)
disagree across providers, and (c) approximate Google's actual signals
poorly.

**Roadmap fix:** `AuditOptions.authorityScore` (0-100), bring-your-own
authority, verdict ladder shifts one tier in the appropriate direction.
Plus proxy-signal detection (domain age via WHOIS, internal-graph
density, named editorial leadership presence) for callers without
external data. v0.5.3 target.

### 1.2 Core Web Vitals / page speed

**What we don't detect:** LCP, INP (formerly FID), CLS, TTFB, render-
blocking resources, total page weight, JavaScript execution time.

**Why it's a real blind spot:** Google's Page Experience update made CWV
a confirmed ranking signal. A pSEO site with great content but 8-second
LCP gets dampened.

**Why we don't fix it today:** measuring CWV requires actual page-load
instrumentation (Lighthouse or CrUX). pseolint's HTTP audit captures
TTFB indirectly via `BackpressureMonitor`, but doesn't surface it as a
finding. Render-mode audits could in principle measure CWV but currently
focus on rendered DOM not load timing.

**Roadmap fix:** `tech/page-speed` rule running in render mode, leveraging
Playwright's PerformanceObserver. v0.6 target.

**2026-08-19 update (partially closed):** `tech/core-web-vitals` shipped
(lab LCP/CLS under `--render`, real-user p75 including INP with a CrUX
key), and `tech/resource-weight` now reads the browser's Resource Timing
buffer in the same render pass to report total page weight with a
per-kind breakdown. Still open: render-blocking-resource detection and
JavaScript execution time. Note for whoever picks those up: total page
weight has NO documented crawl limit, so it is reported at info severity
as a Core Web Vitals input and must never be presented as one. See
docs/folklore.md #4.

### 1.3 Image SEO

**What we don't detect:** alt-text presence/quality, `<img>` width/height
attributes (CLS prevention), image format choice (AVIF/WebP/JPG), lazy-
loading attribute, `srcset`/responsive images, image filename quality.

**Why it's a real blind spot:** Google Image Search is a meaningful
traffic source. Missing alt text also hurts accessibility scores. Many
pSEO sites have hundreds of images with templated or empty alt text.

**Why we don't fix it today:** never prioritized. The data is in the
parsed HTML; no architectural blocker.

**Roadmap fix:** `content/image-alt-text` rule (alt-text presence + per-
template uniqueness). v0.5.3 target.

**2026-08-19 update (partially closed):** `content/image-alt-text` shipped,
and `tech/resource-weight` now reports image BYTES (the dominant-kind
breakdown) under `--render`, which covers the "oversized images" signal.
Still open: width/height attributes, format choice, `srcset`, lazy-loading
and filename quality, all of which are parse-time checks needing no
network.

### 1.4 Open Graph / Twitter Card metadata

**What we don't detect:** missing `og:title`, `og:description`, `og:image`,
`twitter:card`, `og:type` validity, image dimension validity, missing
fallback for SPA-rendered pages.

**Why it's a real blind spot:** social sharing meta affects click-through
from social platforms and is increasingly used by AI Overviews. README
mentioned `tech/og-completeness` for a while; it never shipped.

**Why we don't fix it today:** never prioritized. `ParsedPage.og` already
captures the data.

**Roadmap fix:** `tech/og-completeness` (despite the irony of having
mentioned it in v0.4.x README without implementing it). v0.5.3 target.

**2026-08-19 update (partially closed):** `tech/og-completeness` now also
checks the two remaining ogp.me-required tags (`og:type`, `og:url`) at
info severity. Still open: image dimension validity and `twitter:card`.
Note for whoever picks those up: og:description length has NO documented
optimum (Meta says "2 to 4 sentences"); see docs/folklore.md #3 before
adding any character-count check.

### 1.5 Title tag uniqueness

**What we don't detect:** title-tag uniqueness across the site (we have
meta-description uniqueness but not title), title-vs-H1 alignment.

**Correction (2026-08-19):** this section used to list "title tag length
(Google truncates ~60 chars)" as a gap to close. That was folklore in our
own blind-spot doc: Google documents NO title-length limit, and SERP
cropping is display-side, not an indexing event. Closing that "gap" would
have shipped a rule the primary source contradicts. See docs/folklore.md
#2. What Google does document is the rewrite triggers (half-empty,
boilerplate-repeated, stale titles), which are template smells and are
worth detecting.

**Why it's a real blind spot:** title is the single highest-impact on-page
signal. Templated pSEO sites very commonly ship duplicate titles
(template field defaults to a generic value when source data is
missing).

**Roadmap fix:** `content/title-uniqueness` rule, parallels
`content/meta-uniqueness`. Trivial to add. v0.5.3 target.

### 1.6 H1 structure

**What we don't detect:** H1 presence, single-H1-per-page (vs multiple),
heading hierarchy violations (H3 before H2), H1-vs-title alignment.

**Why it's a real blind spot:** templated pSEO sites often have
zero-or-multiple H1s. Heading hierarchy is also an accessibility
signal.

**Roadmap fix:** `content/heading-structure` rule. Note: README
historically referenced `content/heading-uniqueness`; that was always
phantom. v0.5.3 target.

---

## Tier 2: known gaps with workarounds

### 2.1 Search Console integration / indexation status

**What we don't detect:** which of your URLs are actually indexed,
which got "Crawled, currently not indexed" status, manual actions,
mobile-usability errors.

**Why it's a real blind spot:** the ground truth for "did this work" is
in Google Search Console, not in our static audit.

**Why we don't fix it today:** GSC OAuth + API integration is in
Pro-tier roadmap (v1.1 per the existing roadmap memory) but isn't open-
source-friendly because it requires per-domain auth.

**Workaround:** the soft-404 rule catches the most common
"crawled-but-not-indexed" cause. Operators with GSC access can
cross-reference manually.

### 2.2 Crawl-budget waste / parameter URLs

**What we don't detect:** infinite-URL-combination problems from filter
parameters, session IDs in URLs, calendar/date archives that generate
duplicate listings, faceted-navigation explosion.

**Why it's a real blind spot:** classic pSEO failure mode. Sites generate
millions of URL variants from a few thousand canonical entities, and
Google decides not to crawl most of them.

**Why we don't fix it today:** detection is heuristic-heavy and
ambiguous. We do detect some related patterns: `cannibal/url-pattern`
flags reordered tokens, `tech/canonical-consistency` catches
canonical-conflicts.

**Roadmap fix:** `tech/parameter-url-explosion`, flag origins where the
sitemap / discovered URL count contains parameter-combination patterns
(`?sort=`, `?filter=`, `?page=`) at scale. v0.6 target.

### 2.3 JavaScript-rendered content edge cases

**What we don't detect:** SPA-specific issues like client-side-only
content that arrives after Google's render budget, lazy-loaded content
behind interactions, hash-routed pages that bots can't crawl.

**What we do detect:** `--render` mode catches most SSR/SSG content. We
don't measure render *timing* though.

**Roadmap fix:** time-to-meaningful-content measurement in render mode.
v0.6 target.

### 2.4 Schema-content drift

**What we don't detect:** when JSON-LD says "Product price $29" but the
rendered page shows $39. We validate JSON-LD shape (`schema/json-ld-valid`,
`schema/required-fields`, `schema/consistency`) but don't cross-
reference the values against rendered content.

**Why it's a real blind spot:** schema-content mismatch is treated as
deceptive markup by Google and can trigger structured-data manual
actions. Common in pSEO when the schema generator runs from one data
source and the page renderer from another.

**Roadmap fix:** `data/schema-content-drift`, for a given page, extract
JSON-LD primary entity values (price, sku, rating) and assert each
appears literally in the rendered DOM. v0.6 target.

### 2.5 Outbound link quality

**What we don't detect:** broken outbound links (404 to external sites),
links to penalized/spammy domains, missing `rel="nofollow"` on paid or
user-generated content, excessive outbound link density.

**Why it's a real blind spot:** sites that link to spammy neighborhoods
get treated as spammy themselves; broken outbound links hurt page
quality scoring.

**Roadmap fix:** `links/outbound-health` (broken-link checking against
external destinations) and `links/outbound-density` (excessive links per
page). v0.6 target.

### 2.6 Title-vs-content alignment + search-intent matching

**What we don't detect:** does the page actually answer what the title
promises? Is it commercial intent dressed up as informational? Does the
content match the H1's stated topic?

**Why it's a real blind spot:** intent mismatch is the most common
quality issue on AI-generated pSEO content. The title says "best CRM
for startups in 2026" but the body is generic CRM definitions.

**Why we don't fix it today:** detection requires semantic understanding
(LLM-based) which we offer via opt-in `--ai` triage but not in the rule
set itself. Available via the AI orchestrator path.

---

## Tier 3: narrow gaps, lower priority

### 3.1 Mobile-friendliness checks

Touch-target size, font-size minimums, ~~viewport meta~~, mobile-usability
proxies. Currently relying on `--render` mode to capture mobile-viewport
HTML, but not asserting on the mobile-specific signals.
**2026-08-19 update:** viewport meta is now checked (`tech/viewport-meta`).
Touch targets and font sizes remain open (need rendered layout).

### 3.2 Pagination markup

`rel="next"`/`rel="prev"` validity (now deprecated by Google but
still used by Bing), `?page=` URL handling, paginated archive
canonicalization.

### 3.3 Anchor text diversity

Over-optimized anchor text on internal links (every link to the
"pricing" page anchored as "best SaaS pricing 2026"). Real but minor
signal.

### 3.4 Content depth distribution

Site-level analysis: are your pages appropriately deep for the topic?
(A 200-word page on a complex regulatory topic vs a 200-word page on a
simple integration are very different.) Requires topic understanding.

### 3.5 Localization quality

Beyond `tech/hreflang-consistency` (which validates declarations), we
don't check whether translations are actually high-quality. Requires
language understanding.
**2026-08-19 update (partially closed):** `tech/hreflang-validity` now
validates the code values themselves (`en_US`, `jp`, `en-UK` → ignored by
Google), and `tech/language-mismatch` catches declared-vs-detected script
mismatches (e.g. `lang="ja"` on Cyrillic content) via Unicode script
analysis. Translation *quality* remains open.

### 3.6 Specialty schema types

VideoObject (video SEO), NewsArticle (news SEO with freshness), full
Product/Offer markup for e-commerce. We validate JSON-LD shape but
don't push operators toward the right *type* for their content.

### 3.7 Cookie-banner / interstitial detection

Google's intrusive interstitial penalty targets above-the-fold pop-ups
on mobile. Detectable in render mode but not currently a rule.

### 3.8 Above-the-fold ad density

The Page Layout Algorithm penalizes pages with excessive ATF ads.
Detectable in render mode but not currently a rule.

### 3.9 HTTPS / mixed-content audit

We fetch HTTPS but don't audit certificate chains, mixed-content
warnings, or HSTS headers. Probably outside pseolint's scope (TLS
auditing belongs in dedicated tools).

### 3.10 AMP, video SEO, news SEO

Specialty surfaces with their own communities of tools. Lower
priority for the pSEO target audience.

---

## Tier 4: intentional non-features

These are blind spots that we've explicitly chosen NOT to fill, with
reasoning.

### 4.1 Keyword research / SERP positioning

We don't tell you what keywords you should target, where you currently
rank, or who your SERP competitors are. That's Ahrefs/Semrush
territory. pseolint is an audit tool, not a keyword tool.

### 4.2 Backlink building / link prospecting

Same reasoning as above.

### 4.3 Real-time rank tracking

Same reasoning. pseolint runs on demand, not on a schedule observing
SERPs.

### 4.4 Real-time crawl frequency analysis

Tracking how often Google actually crawls your URLs requires server-
log access, out of scope for a static analyzer.

### 4.5 Conversion-rate / engagement signals

Bounce rate, dwell time, conversion rate, these are GA-domain signals.
Not part of the audit surface.

---

## How to read pseolint's verdict given these gaps

1. **A `ready` verdict means**: "pseolint's static + graph analysis
   found no significant issues in the dimensions it checks." It does
   NOT mean "you will rank well"; authority, page speed, off-page
   signals, search intent matching, and other factors outside our scope
   matter too.

2. **A `concerning` verdict means**: "pseolint's static + graph analysis
   found enough quality issues that even high-authority sites would
   notice." It usually IS a real signal.

3. **The gap between "passes pseolint" and "ranks well" is filled by**
   authority, content quality at the semantic level, and operational
   discipline (consistent publishing, real editorial oversight, schema
   accuracy).

4. **For lower-authority operators**, treat the verdict as a directional
   minimum, not a literal ceiling. Fixing what pseolint flags is
   necessary; not sufficient.

5. **For higher-authority operators**, the verdict is a closer
   approximation of search-engine treatment, but still misses
   page-speed and intent dimensions.

We update this document each release. If you find a blind spot we
haven't documented, file an issue at
github.com/ouranos-labs/pseolint/issues.
