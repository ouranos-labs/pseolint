---
name: aeo
description: >-
  Answer-engine optimization (AEO / GEO): make pages that get cited in AI answers
 (Google AI Overviews, ChatGPT, Perplexity, Claude) not just ranked in blue
  links. Use when the user mentions "AEO", "GEO", "answer engine optimization",
  "generative engine optimization", "AI Overviews", "get cited by ChatGPT /
  Perplexity / Google AI", "AI search visibility", "llms.txt", "answer-first
  content", "featured snippet", "FAQ schema for AI", or "why isn't my content
  showing up in AI answers". Every guideline here binds to a named, runnable
  pseolint `aeo/*` rule, so you can verify it instead of guessing. For building
  the pages at scale, see the `pseolint` (programmatic-seo) skill; for the audit
  itself, run the pseolint CLI/MCP.
metadata:
  version: 0.1.0
  homepage: https://pseolint.dev
---

# Answer-engine optimization, with teeth

Search is splitting in two: classic ranking, and **being the source an AI answer
cites**. AEO (a.k.a. GEO) is optimizing for the second. The May 2026 spam-policy
revision put manipulation of AI answers explicitly in scope, so the upside and
the risk are both real.

This skill is different from generic AEO advice: **every recommendation maps to a
pseolint `aeo/*` rule you can actually run.** You don't *hope* a page is
citable; you run `pseolint` and the rule tells you.

## The AEO checklist: each line is an enforced rule

Thresholds live in the engine and drift; cite the rule and let
`pseolint --explain <rule>` (or the MCP rule resource) give the current number.

1. **Lead with the answer.** A direct, self-contained answer (≈ first 300 chars,
   in a `<p>` right under the heading) is what gets extracted. Enforced by
   `aeo/answer-first`.
2. **Be citable, not vague.** Concrete, attributable facts: numbers, dates,
   named sources: are what AI engines quote. Enforced by `aeo/citable-facts`.
3. **Don't bait, deliver.** Headlines that promise an answer the body never gives
   get skipped (and look spammy). Enforced by `aeo/summary-bait`.
4. **Modular, extractable structure.** Self-contained sections under clear
   headings extract cleanly; walls of prose don't. Enforced by
   `aeo/content-modularity`.
5. **Answer the actual questions.** Real FAQ coverage of the query's sub-questions.
   Enforced by `aeo/faq-coverage`.
6. **Show freshness.** Visible, structured publish/modified dates: AI answers
   favor current sources. Enforced by `aeo/freshness-signals`.
7. **Let the answer engines in.** Don't block AI crawlers (GPTBot, PerplexityBot,
   Google-Extended, ClaudeBot) in robots. Enforced by `aeo/crawler-access`
   (honors `Allow` per RFC 9309).
8. **Ship `llms.txt`.** A machine-readable map of your canonical, citable content.
   Enforced by `aeo/llms-txt`.

## Verify: don't eyeball it

```bash
# Crawl the site and get the per-page AEO findings
npx pseolint https://yoursite.com
```

Or call the pseolint MCP audit tool in an agent and read the `aeo/*` findings.
The same `risk` gate works in CI via `@pseolint/action`, so an AEO regression
can't ship silently.

## The trap

AEO and anti-spam pull in opposite directions if you cheat: stuffing fake FAQs,
baiting summaries, or mass-generating "answer" pages is exactly the scaled-content
/ summary-bait pattern the engine (and SpamBrain) flags. Earn the citation with
real, well-structured answers: `aeo/summary-bait` and the `spam/*` family are
there to catch the shortcut.

## Works with

- **`pseolint` (programmatic-seo) skill**: when you're producing answer pages
  *at scale*, design the template there (it covers thin-content, entity-swap,
  and doorway risk); come back here for the per-page AEO layer.
- **pseolint engine**: the MCP server (`@pseolint/mcp`), CLI (`npx pseolint`),
  and Action (`@pseolint/action`) are what turn this checklist into a verdict.
- **OKF rule bundle** (`/okf`) + **`/methodology`**: the open knowledge behind
  each `aeo/*` rule, with current thresholds.
