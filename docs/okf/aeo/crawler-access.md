---
type: pSEO Audit Rule
title: "Crawler Access — Is Your robots.txt Blocking AI Answer Engines?"
description: "Your robots.txt decides whether GPTBot, ClaudeBot, and PerplexityBot can read your pages. How aeo/crawler-access parses it per user-agent and surfaces the AI crawler tradeoff."
resource: https://pseolint.dev/rules/crawler-access
ruleId: "aeo/crawler-access"
tags: [aeo, "AI crawler robots.txt"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Crawler Access — Is Your robots.txt Blocking AI Answer Engines?

> aeo/crawler-access parses your robots.txt user-agent by user-agent and checks 8 named AI crawlers — GPTBot from OpenAI, ClaudeBot from Anthropic, PerplexityBot, Google-Extended, and four more — warning once per fully blocked bot and escalating to an error only when every one is disallowed, so blocking them stays a deliberate choice you make, not a verdict the rule hands down.

_Rule `aeo/crawler-access` · [live explainer](https://pseolint.dev/rules/crawler-access)_

# What it detects
The rule reads your robots.txt and parses it into a map of user-agent to its Disallow patterns, lowercasing every agent name so the lookup is case-insensitive and stacking consecutive User-agent lines that share one rule block. It then walks a default list of 8 AI crawler user-agents: GPTBot (OpenAI), ChatGPT-User (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), Bytespider (ByteDance), Google-Extended (Google), CCBot (Common Crawl), and Applebot-Extended (Apple). You can override this list in pseolint.config.ts to add or remove agents.

For each crawler the rule asks one question: is this bot fully disallowed? A bot counts as blocked when its own block contains a root Disallow (`Disallow: /` or `Disallow: /*`), or when it has no rule of its own and falls back to a wildcard `User-agent: *` block that is itself fully disallowed. A bot with its own narrower block — say `Disallow: /admin/` — is not counted as blocked, because the rest of the site is still readable.

Every fully blocked crawler produces one warning naming that bot. If the count of blocked crawlers equals the full configured list — every AI agent disallowed — the warnings collapse into a single error instead, because total blocking is an unambiguous, site-wide decision worth one clear finding rather than 8 scattered ones.

# Why it matters
Answer engines like ChatGPT, Claude, Perplexity, and Google's AI Overviews build their responses from pages their crawlers are allowed to fetch. If GPTBot, ClaudeBot, or PerplexityBot hit a `Disallow: /` in your robots.txt, your pages are simply absent from the pool those systems draw citations from — you cannot be quoted by a model that was never permitted to read you.

This is a tradeoff, not a mistake. Blocking AI crawlers is a legitimate, defensible choice: you may not want your writing used as model training data, you may sell the same content you would otherwise be giving away, or you may have a licensing arrangement that forbids it. The rule does not tell you that you must let these bots in. What it does is make the consequence visible — a fully blocked crawler means zero AI-answer citations from that engine — so the decision is one you took on purpose rather than one a stray wildcard rule made for you.

The severity split mirrors that intent. A single blocked bot is a medium-confidence warning, because partial blocks are often deliberate — many sites allow GPTBot and ClaudeBot while blocking Bytespider for policy reasons. Blocking all 8 at once is a high-confidence error, because whether it is intentional or an accident, the effect is the same and unambiguous: total invisibility to answer engines.

# Failing example
Brasswind Press, an independent tabletop-RPG publisher, ships this robots.txt across its store and SRD pages:

```
User-agent: *
Disallow: /admin/

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /
```

The wildcard block only hides /admin/, so most bots are fine — but GPTBot, ClaudeBot, and PerplexityBot each carry a root `Disallow: /`. The rule emits 3 warnings, one per bot. When a player asks ChatGPT "what's the best beginner d20 sourcebook," Brasswind's flagship rulebook cannot be cited because GPTBot was never allowed past the front door. Within 3 weeks of launch the team noticed every rival publisher surfacing in AI answers while their own 12 sourcebook pages stayed dark.

# Passing example
Brasswind Press narrows the blocks so AI crawlers can read the free content while the unreleased campaign setting stays private:

```
User-agent: *
Disallow: /admin/
Disallow: /unreleased-campaign/

User-agent: GPTBot
Disallow: /unreleased-campaign/

User-agent: Bytespider
Disallow: /
```

GPTBot now has its own block, but it is narrow — only the secret setting is hidden, so GPTBot is not counted as fully blocked. ClaudeBot and PerplexityBot fall back to the wildcard, which leaves the SRD, the d20 quickstart, and the miniature painting guides readable. Only Bytespider is fully disallowed, a deliberate single choice. The rule fires one warning for Bytespider and stays silent on the rest, and within 2 months the quickstart guide was being quoted directly in Perplexity answers about character-sheet creation.

# How to fix
- Open robots.txt and find every block with a root `Disallow: /`. For each named AI crawler you want quotable, delete that root rule so the bot can reach your public pages again.
- If you only meant to hide private areas, replace `Disallow: /` with the specific paths — for example `Disallow: /drafts/` and `Disallow: /admin/` — so the rest of the site stays crawlable by answer engines.
- Decide deliberately which bots you keep out. Blocking a scraper like Bytespider while allowing GPTBot and ClaudeBot is a valid stance; just confirm it is the stance you actually want.
- Remember the wildcard fallback: a `User-agent: *` block with `Disallow: /` silently blocks every AI crawler that has no rule of its own. Give bots you want to allow their own narrower block to escape it.
- After editing, re-run the audit. The rule downgrades from a site-wide error to per-bot warnings to silence as you reopen access, so you can watch each decision take effect.

# Related rules
- [llms-txt](../aeo/llms-txt.md)
- [freshness-signals](../aeo/freshness-signals.md)
- [faq-coverage](../aeo/faq-coverage.md)

# Sources
- [Google Search Central — Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro) — Google's robots.txt documentation explains that user-agent directives apply to specific crawlers, and that a Disallow rule for a given agent blocks it completely from the matched paths. aeo/crawler-access parses your robots.txt into a user-agent-to-Disallow-patterns map, lowercases every agent name for case-insensitive matching, and stacks consecutive User-agent lines that share a rule block — the same parsing behaviour Google's own robots.txt specification describes.
- [Google Search Central — Block search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) — Google's noindex documentation notes that blocking a crawler and blocking indexing are distinct controls: a disallowed bot never fetches content at all, so it cannot participate in answer generation regardless of any index-level directive. aeo/crawler-access checks 8 named AI crawler user-agents — GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Bytespider, Google-Extended, CCBot, and one more — warning once per fully blocked bot and escalating to an error only when every agent in the list is disallowed, so the finding distinguishes a targeted exclusion from an accidental wholesale block.
- [Google Search Central — Large site owner's guide to managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) — Google's crawl-budget guidance notes that robots.txt is the authoritative gate for crawler access, evaluated before any fetch occurs. The aeo/crawler-access rule reads that gate specifically for AI agents rather than Googlebot, surfacing a category of access restriction that crawl-budget analysis traditionally ignores. A site that inadvertently inherits a broad Disallow: / rule from a template may block every AI answer engine without realising it — which is why the rule separates per-bot warnings from the all-blocked error.
