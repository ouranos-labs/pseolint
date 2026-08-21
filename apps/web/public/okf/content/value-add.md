---
type: pSEO Audit Rule
title: "Value-Add Score: The Composite That Reads Seven Other Rules"
description: "No single rule proves a page is worthless, but seven failing at once do. How content/value-add blends 7 originality signals into one score and fires below a 50% floor."
resource: https://pseolint.dev/rules/value-add
ruleId: "content/value-add"
tags: [content, "page value-add score SEO"]
---

# Value-Add Score: The Composite That Reads Seven Other Rules

> content/value-add is a second-pass composite that reads seven other rules' findings: originality, freshness, citable facts, the four-category E-E-A-T count, translation, cliche reuse, and Wikipedia paraphrase: weights each at one-seventh, averages them into a single 0-to-1 score, and fires an error below 50% or a critical below 30%, the synthesis SpamBrain has rewarded since the March 5, 2024 update.

_Rule `content/value-add` · [live explainer](https://pseolint.dev/rules/value-add)_

# What it detects
content/value-add does not parse a page. It runs after every other rule has finished and reads their findings, turning seven separate originality checks into one number. Each signal is scored 0, 0.5, or 1 for the page, and the rule takes the plain average, every signal weighted at one-seventh, about 14%.

The seven signals are: originality (1 unless content/regurgitated-content fired here, then 0), freshness (from aeo/freshness-signals, 1 if silent, 0.5 at warning, 0 otherwise), citable facts (from aeo/citable-facts, 1 if silent, 0.5 at info or warning, 0 otherwise), E-E-A-T (a four-category count, 1 at four signals, 0.5 at two or three, 0 below two), translation (0 if content/translation-no-op named this page, else 1), cliche reuse (0 if content/common-phrase-reuse fired, else 1), and Wikipedia paraphrase (0 if content/wikipedia-paraphrase fired, else 1).

The average is the value-add score. Below 50% the rule fires one finding per page at error severity; below 30% it escalates that finding to critical. Confidence is fixed at medium.

# Why it matters
Any one of the seven underlying rules can fire on a page that is basically fine. A freshness warning alone is not a verdict. A single missing E-E-A-T category is not a verdict. content/value-add exists because the verdict lives in the pattern, not the part: a page that is regurgitated AND stale AND fact-thin AND anonymous is not seven small problems, it is one worthless page wearing seven labels.

This is why the rule is a synthesis and not a detector. It owns no new logic and looks at no HTML. It simply asks, across the seven independent originality proxies the suite already computed, how many does this page pass? A page scoring below 50% has failed the majority of them, which is the engine's structural definition of a page carrying no proprietary value-add; nothing original, current, sourced, attributed, or freshly written that a competitor's database export would not also contain.

Because it averages, a single weak signal almost never sinks a page. It takes three or four failing signals to cross the 50% line, so the finding lands only when the deficit is broad. That makes it the rule worth reading first: the highest-level summary of whether a URL earns its slot.

# Failing example
/oolong/tie-guan-yin on a specialty-tea importer's catalog. The tasting copy was paraphrased from a supplier sheet (content/regurgitated-content fired), there is no published or updated date (freshness scored 0), no harvest figures or steeping parameters a buyer could cite (citable-facts scored 0), and no byline, about link, or sources block (E-E-A-T scored 0). Four of seven signals sit at zero, the average lands at 43%, and content/value-add fires an error: 'value-add score 43%, the page lacks proprietary value-add and is demoted by SpamBrain.'

# Passing example
The same oolong page, rebuilt with material that exists nowhere else: a first-flush harvest window of 9 days in late April, a single-estate terroir note naming the 1,200-metre Anxi slope, an exact 90-second gaiwan steeping spec at 95 degrees, and a 'Tasted and updated 6 weeks ago by our head buyer' line that resolves both the date and the E-E-A-T author categories. Originality, freshness, facts, and E-E-A-T all climb to 1, the average clears 80%, and the rule stays silent because five of seven signals now pass cleanly.

# How to fix
- Lift originality first: rewrite any copy that tripped regurgitated-content into a page-specific tasting note, because that signal is binary and recovering it adds a full one-seventh to the score.
- Add a real published or updated date so the freshness signal climbs from 0 toward 1: an undated page scores zero on a signal that costs one line of markup to fix.
- Bind citable facts a buyer can quote (a harvest window, a steeping temperature, an estate elevation) so the citable-facts signal stops scoring zero on a page of pure prose.
- Reach four E-E-A-T categories (a byline, an about link, a date, and a sources block) since two or three only earns 0.5 while four earns the full point.
- Clear cliche reuse and any translation-no-op flag: both are binary signals, and a page padded with common phrases or a hollow auto-translation each forfeits a full one-seventh.
- Re-run the audit after fixing the worst two signals: because the score is an average, recovering two zeros to ones usually moves a 43% page past the 50% floor in one pass.

# Related rules
- [unique-value](../content/unique-value.md)
- [eeat-signals](../content/eeat-signals.md)
- [regurgitated-content](../content/regurgitated-content.md)

# Sources
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): People-first guidance is the conceptual frame content/value-add makes computable: the rule converts seven separate originality signals (regurgitation absence, dateModified freshness, citable-fact density, E-E-A-T category count, locale-translation fidelity, bundled-cliché density, and trigram encyclopedia overlap) into a single 0-to-1 composite score.
- [Google Search Central: Spam policies: scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies): Scaled-content-abuse policy penalises volume production yielding little per-page differentiation; content/value-add makes the enforcement threshold explicit: each of seven contributing signals is weighted at one-seventh (≈14%), so a page failing four signals sits at roughly 0.43 (below the 50% error floor) even if the remaining three pass cleanly.
- [Google Search Central: Search Essentials](https://developers.google.com/search/docs/essentials): Search Essentials lists originality and usefulness as foundational quality expectations; content/value-add translates those principles into a deterministic second-pass composite (reading prior rule findings rather than re-parsing HTML) and emits a critical finding below 0.30 to mark URLs where fewer than three of the seven dimensions of substantive contribution pass.
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): AI Overviews and similar extraction pipelines prefer content that clears multiple originality dimensions simultaneously; content/value-add's 0-to-1 composite score surfaces URLs that individually pass each contributing rule at warning level but collectively fall short of the 50% average originality floor that separates extractable depth from surface filler.
