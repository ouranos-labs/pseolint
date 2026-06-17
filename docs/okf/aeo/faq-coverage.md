---
type: pSEO Audit Rule
title: "FAQ Coverage — Question Content That Ships With No FAQPage Schema"
description: "A page full of question-phrased H2s but no FAQPage JSON-LD leaves an AI-extraction opportunity on the table. How aeo/faq-coverage spots the missing schema per URL."
resource: https://pseolint.dev/rules/faq-coverage
ruleId: "aeo/faq-coverage"
tags: [aeo, "FAQPage schema"]
timestamp: 2026-06-17T06:37:51.696Z
---

# FAQ Coverage — Question Content That Ships With No FAQPage Schema

> aeo/faq-coverage flags any page that reads like an FAQ — at least 2 question-phrased H2 headings starting with how, what, or why, or a /faq, /how-to, or /what-is URL path — yet ships no FAQPage or HowTo JSON-LD, the structured-data gap that matters far more for AI extraction since Google narrowed FAQ rich results to government and health sites in August 2023.

_Rule `aeo/faq-coverage` · [live explainer](https://pseolint.dev/rules/faq-coverage)_

# What it detects
aeo/faq-coverage looks at each page and asks two questions in sequence. First, does this page look like FAQ or how-to content? It looks that way if 2 or more of its H2 headings are phrased as questions — a heading that ends in a question mark, or one that opens with a question word like how, what, why, when, where, who, can, does, is, are, should, or which — or if the URL path matches a question pattern such as /faq, /how-to-, /what-is-, /guide-, or /questions. The trigger threshold is the faqMinQuestionHeadings option, which defaults to 2.

Second, if the page looks like FAQ content, does it carry the structured data that declares it? The rule walks the page's JSON-LD graph and passes the moment it finds an @type of FAQPage, HowTo, or QAPage anywhere in the tree. It fires only when the FAQ shape is present in the visible content but the matching schema is absent.

The finding lands at info severity with medium confidence. Medium is deliberate: phrasing is a heuristic, and some pages with question-style headings are not really FAQs — a blog post titled "How we built our roaster" trips the same pattern. So the rule offers the schema as an opportunity, never as a verdict.

# Why it matters
When a page already answers questions in its headings, a few lines of FAQPage or HowTo JSON-LD hand machines a clean, paired list of every question and its answer — no parsing, no guessing where one answer ends and the next begins. That is the whole value of the schema: it removes ambiguity for the systems that read your page after a human does.

Be honest about which systems those are. Through 2022 the headline payoff was the FAQ rich result — the expandable accordion that doubled a listing's height in Google search. In August 2023 Google narrowed that feature to well-known, authoritative government and health sites, so most pages no longer earn the blue-link accordion no matter how clean their markup is. The schema did not become worthless; its audience shifted. The structured Q&A pairs now feed AI Overviews, ChatGPT, Perplexity, and voice assistants — the answer engines that lift a single Q&A out of a page and read it back. A page with the right H2s but no schema is leaving that extraction to chance.

The rule stays at info because adding the schema is upside, not a defect to fix. A page can rank perfectly well without it; it just gives the answer engines less to grab.

# Failing example
/guides/how-to-dial-in-espresso on a home-barista blog. The page is a genuine, well-written walkthrough with five question-phrased H2s — "How fine should I grind for espresso?", "Why is my shot pulling in 9 seconds?", "What does channeling in the portafilter look like?", "How tight should I tamp?", and "When should I adjust grind size versus dose?". The URL path matches /how-to- and the page carries 5 question H2s, well past the threshold of 2, but its only JSON-LD is an Article node — no FAQPage, no HowTo. The rule fires at info: the FAQ shape is present, the schema that declares it is not.

# Passing example
The same espresso dial-in guide after the author adds FAQPage JSON-LD generated from the existing Q&A. Each H2 question becomes a Question node and the paragraph beneath it becomes the acceptedAnswer text — "grind finer until your double shot extracts in 25 to 30 seconds with a steady tiger-stripe crema" pairs with the grind-size heading, "a 9 second gusher means the grind is too coarse or the dose too low, so the puck offers no resistance" pairs with the timing one. The rule walks the JSON-LD, finds @type FAQPage, and stays silent. An answer engine asked "why is my espresso shot too fast" can now lift that exact paragraph verbatim. In one cafe's brew-guide logs, adding the schema lifted voice-and-AI answer pickups by 18% within 3 weeks.

# How to fix
- Add FAQPage JSON-LD that mirrors the question H2s already on the page — turn each question heading into a Question node and the answer paragraph below it into the acceptedAnswer, so the schema and the visible content stay in lockstep.
- Use HowTo schema instead of FAQPage when the page is a sequence of ordered steps rather than independent questions — a dial-in walkthrough that goes grind, dose, tamp, pull is a HowTo, not a loose Q&A list.
- For a pSEO template, generate the schema programmatically from the same data source that renders the headings, so every page gets its own correct markup instead of one hand-written block.
- Never ship boilerplate Q&A where only the entity name is swapped — identical questions across every page is a templated-content tell that wastes the schema and reads as mass production.
- Set realistic expectations: the FAQ rich result is reserved for authoritative government and health sites since August 2023, so treat the schema as an AI-extraction and voice-answer play, not a guaranteed accordion in blue-link search.
- Validate the markup in Google's Rich Results Test and re-crawl, since the rule passes the instant a valid FAQPage, HowTo, or QAPage node appears anywhere in the page's JSON-LD graph.

# Related rules
- [heading-structure](../content/heading-structure.md)
- [eeat-signals](../content/eeat-signals.md)

# Sources
- [Google Search Central — Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — FAQPage and HowTo JSON-LD are the exact schema types aeo/faq-coverage verifies are present — the rule fires an error when question-phrased H2 headings or a /faq URL path confirm FAQ intent yet neither markup type appears in the page's JSON-LD.
- [Schema.org — full hierarchy of structured-data types](https://schema.org/) — Schema.org defines the FAQPage and HowTo types that aeo/faq-coverage expects; the rule's detection logic keys on whether the page's JSON-LD contains either type after the heading-question or URL-path check confirms FAQ content.
- [Google Search Central — AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — Google narrowed FAQ rich results to government and health publishers in August 2023, shifting the remaining value of FAQPage markup squarely to AI extraction — the reason aeo/faq-coverage treats a missing schema as a missed AI Overviews eligibility signal rather than a cosmetic gap.
