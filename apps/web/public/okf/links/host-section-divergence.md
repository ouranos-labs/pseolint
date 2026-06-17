---
type: pSEO Audit Rule
title: "Site Reputation Abuse — Detecting Parasite Sections on a Trusted Host"
description: "Google's May 7, 2024 site-reputation-abuse policy targets sections that ride a host's authority without integrating. How links/host-section-divergence measures it."
resource: https://pseolint.dev/rules/host-section-divergence
ruleId: "links/host-section-divergence"
tags: [links, "site reputation abuse detection"]
timestamp: 2026-06-17T06:42:03.371Z
---

# Site Reputation Abuse — Detecting Parasite Sections on a Trusted Host

> Google's May 7, 2024 site-reputation-abuse policy demotes subfolders that borrow a host's reputation without earning it — links/host-section-divergence flags a URL section (e.g. /coupons/, /deals/) only when it diverges from the rest of the host on at least 2 of 4 independent structural signals, and it deliberately fires on the minority section, never on a balanced multi-topic split.

_Rule `links/host-section-divergence` · [live explainer](https://pseolint.dev/rules/host-section-divergence)_

# What it detects
The rule groups every crawled URL by its first path segment (/coupons/, /reviews/, /best/) and tests each section that holds at least 10 pages while leaving at least 10 pages in the rest of the host. It only considers sections that are a strict minority of the corpus (under 50%) — reputation abuse is, by definition, a small parasite section riding a larger host, so a 50/50 split is read as a multi-topic site and skipped.

For each qualifying section it measures four signals against the rest of the host: (1) inbound-link integration — the fraction of section pages that receive at least one internal link from outside the section, flagged when under 0.20 (the section is an island the host barely references); (2) topic divergence — Jaccard distance between the top-100 TF-IDF terms of the section versus the rest, flagged above 0.75 (under ~25% vocabulary overlap); (3) template isolation — the fraction of section pages whose structureSignature also appears anywhere else on the host, flagged when under 0.10 (the section ships its own template the host never uses); and (4) authorship mismatch — flagged when section and host byline coverage differ by at least 0.40 and one pool is mostly anonymous (≤0.30) while the other is mostly bylined (≥0.70).

A section that trips 2 or more signals emits a warning naming the section, the signal values, and a 20-URL sample; a section that trips 3 or more and holds over 50 pages escalates to error. The rule reasons about structure, not contracts — it cannot read a revenue-share agreement or see a manual action, only the structural fingerprint those arrangements leave behind.

# Why it matters
Site reputation abuse — colloquially 'parasite SEO' — became an explicit Google spam policy on May 7, 2024 (https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse), and unlike most quality signals it is enforced partly by hand: affected domains receive a 'Third-party content abuse' manual action in Search Console with a defined reconsideration path.

The policy targets a specific asymmetry — a high-authority host lends its reputation to a section of content that was produced by or for a third party with minimal first-party editorial involvement, so the section ranks on borrowed trust rather than its own. The classic shapes are a /coupons/ or /deals/ subfolder run by a syndication partner under a newspaper's domain, a vendor-generated /locations/ template on a directory site, or a sponsored /best/ directory with no real editorial review.

Enforcement is surgical: field reports after the May 2024 and November 5, 2024 waves show 70% to 100% traffic loss confined to the offending subfolder while the rest of the domain is untouched. The four signals this rule reads are the same structural tells a reviewer looks for — is the section cross-linked from the host's own navigation, does it talk about the same things, was it built with the host's design system, and is it signed by the same people. None of those is conclusive alone, which is why the rule requires at least two to agree before it says anything.

# Failing example
A regional news domain with 1,200 editorial articles and a 180-page /coupons/ section supplied by an affiliate network. The coupon pages receive almost no inbound links from the newsroom's own pages (inbound-integration 0.06), share under 20% of their vocabulary with the news content (topic-divergence 0.81), render from a template the rest of the site never uses (template-isolation 0.04), and carry no bylines while the editorial side is 90% bylined (authorship mismatch: 0.00 vs 0.90). All four signals trip and the section holds more than 50 pages, so the rule fires at error severity — the structural signature of exactly the arrangement the May 2024 policy was written to catch.

# Passing example
The same news domain, but the /reviews/ section is produced in-house: every review is linked from the relevant news category, written by named staff who also write the news, and built with the site's standard article template. Inbound integration is 0.74, topic vocabulary overlaps the host's coverage (topic-divergence 0.38), the template is shared (template-isolation 0.61), and byline coverage matches the rest of the host. Zero signals trip. The section is a genuine part of the publication, not a parasite riding its authority — and the rule stays silent, because structural integration is exactly what the policy asks for.

# How to fix
- Decide per section whether you actually own it editorially. If a third party produces the content with minimal first-party review, the honest fixes are to integrate it properly or to move it off the host — not to game the four signals.
- Integrate, option A: cross-link the section from your primary navigation and from topically-related host pages so it stops reading as an island. Low inbound integration is the cheapest signal to flip and often the most diagnostic.
- Integrate, option B: share authorship and schema. Put real, named reviewers on the pages who actually vet them, and align the section's template with the rest of the host so it isn't a structurally foreign body.
- Separate, the clean alternative: move the section to a subdomain or a partner-owned domain and 301 the old URLs. It stops borrowing your reputation — which is the point of the enforcement — and stops being a liability.
- Do not try to defeat the rule by sprinkling a few host links into the section while leaving it editorially third-party. The policy is about substance, not surface signals; a reviewer applies the same 'would a reasonable user see this as the host's own content' test the rule only approximates.

# Related rules
- [doorway-pattern](../spam/doorway-pattern.md)
- [template-diversity](../spam/template-diversity.md)
- [boilerplate-ratio](../spam/boilerplate-ratio.md)

# Sources
- [Google Search Central — Spam policies: site reputation abuse](https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse) — Google's May 7, 2024 site-reputation-abuse policy targets subfolders — /coupons/, /deals/, /reviews/ — that borrow a host's ranking authority without earning it through topical alignment; links/host-section-divergence fires only on minority sections (under 50% of the corpus) that diverge from the host on at least 2 of 4 structural signals, the minimum-section-size threshold being 10 pages on each side of the split.
- [Google Search Central — Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies) — Google's spam-policies overview frames site-reputation abuse as a subcategory of manipulative ranking behaviour; the rule's requirement that a divergent section hold at least 10 pages before the host-comparison runs prevents single-page anomalies from triggering the same enforcement signal as a genuine parasite subfolder.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — A parasite section that structural signals identify as topically misaligned wastes crawl allocation on pages Google's quality heuristics will already penalise; the crawl-budget guidance for large sites notes that thematically divergent subdirectories are crawled at lower priority, making host-section-divergence a predictor of suppressed fetch frequency.
