---
type: pSEO Audit Rule
title: "llms.txt: A Draft Convention for Guiding AI Engines, Checked at Your Origin"
description: "llms.txt is a draft, low-adoption convention for pointing AI engines at your best content. How pseolint fetches /llms.txt once at your origin and runs 3 lenient shape checks."
resource: https://pseolint.dev/rules/llms-txt
ruleId: "aeo/llms-txt"
tags: [aeo, "llms.txt file SEO"]
---

# llms.txt: A Draft Convention for Guiding AI Engines, Checked at Your Origin

> llms.txt is a draft, low-adoption convention proposed in September 2023 and championed by Jeremy Howard at Answer.AI, so pseolint runs this as a low-confidence, informational site-level check that fetches /llms.txt once at your origin and verifies 3 shape rules, treating a missing file as a missed opportunity worth roughly 1 hour of work, never a defect.

_Rule `aeo/llms-txt` · [live explainer](https://pseolint.dev/rules/llms-txt)_

# What it detects
This is a site-level check, not a per-page one: it runs exactly once against your origin. pseolint takes the source URL, derives its origin, requests `${origin}/llms.txt` with a 10 second timeout, and only proceeds for http and https targets. If the request fails, times out, or returns a non-200 status, the file is treated as absent.

When the file is present, pseolint runs three deliberately lenient shape checks drawn from the llmstxt.org proposal. First, the opening non-empty line must be an `# ` H1 title (lines that start with `#` but carry no title text are skipped, not rejected). Second, the file must contain at least one `## ` section heading. Third, it must list at least one markdown link of the form `- [Title](https://...)` somewhere under a section. A file that satisfies all three passes silently.

A missing file and a malformed file both surface the same low-confidence, informational finding: one tells you nothing exists at the origin, the other names which of the three rules failed. The check is intentionally forgiving because the specification is still evolving; it rejects only obvious garbage.

# Why it matters
Be candid about what this is: llms.txt is a draft convention with low industry adoption, not a ranking factor and not an established standard. That is exactly why pseolint reports it at low confidence and informational severity. An absent llms.txt is a missed opportunity, never a defect, and you can ship a perfectly healthy site without one.

The upside, where it applies, is editorial control. A well-formed llms.txt lets you hand an AI engine a curated map straight to your most authoritative, citable pages instead of leaving it to infer structure from a sprawling sitemap. For a project with deep, fast-moving content (release notes, an API reference, a migration guide) that curation can be the difference between an assistant quoting your current quickstart or an answer it stitched together from a 2 year old blog post.

No search engine is known to consume llms.txt as a ranking input, and pseolint makes no such claim. Treat a finding here as a 30 minute experiment worth trying, not a penalty to fix. The authoritative reference for the format is llmstxt.org.

# Failing example
An open-source CLI tool publishes docs at docs.example.dev and adds a /llms.txt that opens with a blockquote summary, then jumps straight into bare URLs: `> The official SDK for Example.` followed by `https://docs.example.dev/quickstart` and `https://docs.example.dev/api`. pseolint fetches it, finds no leading `# ` H1 title and no `## ` section headings, and emits a low-confidence finding naming the first failed rule, the file exists but does not match the llmstxt.org shape, so an AI engine reading it gets an unlabeled list with no hierarchy to reason about.

# Passing example
The same documentation site fixes it: `# Example SDK` as the H1, a one-line blockquote summary, then `## Getting Started` listing `- [Quickstart](https://docs.example.dev/quickstart): install and first call in 5 minutes`, followed by `## Reference` with `- [API Reference](https://docs.example.dev/api): every endpoint and type` and `## Releases` linking `- [Changelog](https://docs.example.dev/changelog): updated within the last 7 days`. All three shape checks pass (an H1 title, two-plus `## ` sections, and several markdown links) so pseolint stays silent and an assistant gets a clean, captioned map to the SDK's most citable pages.

# How to fix
- Create a plain-text file at the root of your origin, served as /llms.txt, that opens with a single `# Project Name` H1 title on the first non-empty line.
- Add a short blockquote summary under the title, then break your content into `## ` sections such as Getting Started, API Reference, Guides, and Releases.
- Under each section, list your most citable pages as markdown links in the form `- [Quickstart](https://...): one-line description` so an engine can read both the link and its purpose.
- Point the links at canonical, current pages: your live quickstart, API reference, SDK guides, and changelog: not deep-archived or redirecting URLs.
- Keep it in sync with releases: a stale llms.txt that omits a new major version or a renamed code sample misleads engines more than having none at all.
- Validate against the format described at llmstxt.org and re-run the audit; a passing file is silent, so no finding means the three shape checks are satisfied.

# Related rules
- [freshness-signals](../aeo/freshness-signals.md)
- [crawler-access](../aeo/crawler-access.md)
- [faq-coverage](../aeo/faq-coverage.md)

# Sources
- [llmstxt.org: the /llms.txt proposal](https://llmstxt.org/): The llms.txt proposal, a draft convention championed by Jeremy Howard at Answer.AI and first circulated in September 2023, defines a plain-text file at the site root that AI agents can read to understand what the site contains and how to use it. aeo/llms-txt fetches ${origin}/llms.txt once per audit with a 10-second timeout, accepts only http and https targets, and runs three lenient shape checks drawn from that specification: the file's presence, a non-empty first line, and at least one markdown URL reference.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): Google's AI Overviews documentation explains that AI systems select sources based on quality signals, including how clearly a site communicates its content structure to automated readers. An llms.txt file is one emerging mechanism for making that structure explicit. Because adoption remains low, pseolint treats a missing file as a missed low-effort opportunity and fires only at info severity, not a defect, but a gap worth closing in roughly an hour.
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) (Google's helpful-content guidance asks whether pages are created for people or primarily to serve automated systems) a question that runs in both directions. llms.txt is the reverse gesture: a deliberate, human-authored declaration telling AI systems which parts of a site are intended for them. Providing that file aligns with the spirit of transparency Google's guidance rewards, signalling that the site's content strategy is intentional rather than incidental.
