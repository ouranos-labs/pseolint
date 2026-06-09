# Case study: a false "READY" on a 5,600-page pSEO site (2026-06-09)

**TL;DR.** Running `pseolint https://paperforge.dev` — the documented quick-start — on a programmatic-SEO site with **5,602 indexable pages** discovered **1 page**, classified the site as `small-marketing`, suppressed the pSEO-only rules, and returned **Verdict: READY ✓**. The real verdict (found only after manually pointing pseolint at a child sitemap) was **CONCERNING · Integrity F**. For a tool whose entire reason to exist is auditing large pSEO sites, silently passing one because its sitemap is a 2-level index is the most damaging failure mode we have. This documents what happened and the changes that would have caught it on the first run.

## Context

paperforge.dev is a programmatic legal-template site: 55+ roles × 22 documents × ~20 states ≈ 5,602 published pages, one URL template `/templates/:slug`. Google Search Console reported ~1,060 URLs as **"Crawled – currently not indexed."** We reached for pseolint first.

Its sitemap is a standard **two-level index**:

```
/sitemap.xml            -> <sitemapindex> with 22 + 1 children
/sitemap/<doc-uuid>     -> <urlset> of that document type's pages
/sitemap/static         -> <urlset> of hubs/legal pages
```

`robots.txt` advertises `Sitemap: https://paperforge.dev/sitemap.xml`. All of it returns HTTP 200 and is well-formed (verified by hand).

## What happened, step by step

1. **`pseolint https://paperforge.dev` (cache on, default flags):**
   ```
   ✓ Discovered 1 content page
   ✓ Site type: small-marketing (confidence 90%, 1 URLs, / covers 100%)
   ✓ Suppressed 5 pSEO-only rules — pass --strict to run all 32
   Verdict: READY ✓
   Integrity A · Discoverability A · Citation A · Data A
   ```
   A 5,602-page pSEO directory was audited as a one-page brochure and passed.

2. **`pseolint https://paperforge.dev/sitemap/<doc-uuid>` (a child `<urlset>` directly):**
   ```
   ✓ Discovered 392 content pages
   ✓ Site type: programmatic-directory (confidence 70%, /templates/:slug covers 100%)
   Verdict: CONCERNING ⚠   Integrity F · Discoverability A · Citation A · Data A
   3 ship-blockers — content/unique-value (385 pages, worst 18 unique words),
   spam/near-duplicate (×11), spam/publication-velocity (382 @ one date)
   ```
   The real picture only appears when the operator already knows to bypass the index.

The gap between (1) and (2) is the whole problem: **the default invocation gives the opposite of the truth.**

## Status (most of this was fixed the same day, in core 0.6.5 / commit `96a78dd`)

This dogfood directly drove `96a78dd` ("dogfood reliability hardening + sitemap-first discovery"). Against that source the findings below stand as follows:

- **Gap 1 — FIXED.** `feat(auditor): sitemap-first discovery` reads `robots.txt` `Sitemap:` directives (else probes `/sitemap.xml`) and fetches declared URLs *before* link-crawl, with depth-capped `<sitemapindex>` recursion and a regression test ("follows a nested `<sitemapindex>` discovered from robots.txt"). The repro above was on the stale 0.6.4 dist.
- **Gap 2 — mostly addressed.** The classifier now emits a `core.warning` naming the reason + page count when it suppresses pSEO rules, and `templateCoverageRule` / `templateCoverageMinPages` were added.
- **Gap 5 — added.** `spam/template-diversity` (`templateDiversityRule(pages, minUniqueRatio)`) now reports a per-site unique-content ratio — the metric this case study asked for.
- **Gap 3 — FIXED (#4).** A declared-vs-discovered coverage guardrail flags the run `truncated` with `truncatedKind: "coverage"` (distinct from the backpressure kind) on two independent signals: **(A)** a sitemap **index** referenced child sitemaps that couldn't be fetched/parsed (the unreachable-children case — the original false-negative class, which a URL-count comparison can't see), and **(B)** far fewer pages were **fetched** than the sitemap declares. (B) compares against pages actually fetched and is bounded by every deliberate limit (sample size, crawl cap, declared total), so noindex/non-HTML pages, intentional sampling, and a small crawl cap don't false-fire. Surfaced by the existing CLI/Action/MCP/web `truncated` plumbing. Tests: `tests/integration/coverage-guardrail.test.ts` (5 cases incl. three false-positive guards).
- **Gap 4 — FIXED (#3).** `content/unique-value` is now axis-aware: the message surfaces the shared-vs-unique word split (`N of its M distinct words also appear on other pages`) and the fix string explicitly warns that content repeated across same-axis sibling pages (boilerplate, per-axis data) does **not** count.

The remainder of this document is the original analysis. **All five gaps are now addressed** — Gaps 1/2/5 in `96a78dd`, Gaps 3/4 in the follow-up (issues #3, #4).

## Gap 1 (critical): root-URL discovery doesn't surface a sitemap-index corpus

pseolint already has the machinery — `isSitemapIndex()`, a depth-capped recursive walker (`packages/core/src/auditor.ts` ~L1471–1509), and `parseSitemapUrlsWithLastmod()` which matches both `<url>` and `<sitemap>` blocks (~L1372–1390). And there is a homepage-crawl fallback: *"Sitemap URL returned non-200 — fallback to crawl from origin homepage"* (~L1657).

Yet from a **root URL** the run discovered only the homepage. So on this path the corpus was never reached through the index — either the index→child recursion isn't invoked for root-URL discovery, or the child fetch fell through to the homepage-crawl fallback and stopped there. Whatever the internal cause, the observable contract is broken: a healthy 2-level index advertised in `robots.txt` produced 1 discovered URL.

**Recommended fix.** On root-URL discovery, fetch `robots.txt` → each declared sitemap → if `isSitemapIndex`, recurse children before falling back to crawl. The homepage-crawl fallback should be a *last resort after* index recursion fails, not a substitute for it. Add a regression fixture: a root URL whose only sitemap is a 2-level index ⇒ expect N>1 discovered.

## Gap 2 (compounding): discovery failure silently downgrades the verdict

With 1 URL discovered, pseolint classified the site `small-marketing` at **90% confidence** and **suppressed the 5 pSEO-only rules** — the exact rules (`spam/near-duplicate`, `spam/entity-swap`, doorway/template checks) that would have fired. So a discovery miss cascades into a confidently-wrong site type, which disables the relevant rules, which yields a green verdict. Three layers, each amplifying the first.

**Recommended fix.** Site-type classification should treat *very low page count* as **low-confidence / inconclusive**, not as positive evidence of `small-marketing` — especially when a sitemap (let alone a sitemap *index*) was present at discovery time. Never suppress pSEO rules and emit `READY` off a single-URL crawl; downgrade to an explicit "inconclusive — discovery too thin to audit" outcome.

## Gap 3 (the guardrail that makes the rest non-fatal): discovered-vs-declared mismatch warning

The single highest-leverage change. pseolint sees the sitemap(s) at discovery time and therefore knows roughly how many URLs are *declared*. If it then audits **≪** that many, it should say so, loudly, as a first-class finding:

> ⚠ Discovered 1 page but `sitemap.xml` (a `<sitemapindex>`) references 23 child sitemaps. Discovery likely failed — verdict is not representative. Try a child sitemap URL, or check robots/sitemap reachability.

This one warning would have flipped our first run from a misleading green to "something's wrong, don't trust this," regardless of any recursion edge case. Cheap, defensive, and exactly the kind of "between-pages" sanity check pseolint is built around.

## Gap 4: `content/unique-value` fix guidance misleads pSEO authors

The rule itself is sound (`packages/core/src/rules/content/unique-value.ts` ~L7–28: counts cross-page-unique tokens vs `minUniqueWords`). The *fix string* is not:

```
Add 81 more words of content not found on any other page.
```

Acting on exactly this, we surfaced ~**296 words/page** of pre-researched, genuinely useful data (per-role regulations/licensing/insurance, per-state statutory provisions). A re-audit showed **no movement** (385 → 354 flagged, worst still 19 unique words). Why: that data is unique per *axis* (a role's regulations are verbatim across that role's 22 documents; a state's provisions across that state's ~95 pages), so it is *shared* across sibling pages and correctly doesn't count. The guidance never warns about this, so it steers authors straight into adding axis-shared boilerplate that can't clear the rule.

**Recommended fix.** Make the message axis-aware: *"Added content must be unique to this page. Content shared across pages that share the same role/location (e.g. boilerplate repeated on N sibling pages) does not count."* Where detectable, name the offending overlap: *"~210 of your words also appear on 21 sibling pages."* That turns a day of wasted enrichment into a one-line correction.

## Gap 5 (nice-to-have): no headline "unique-content ratio" for the template

The systemic disease — each page is a thin unique lead (~30–90 words) drowned in a large shared scaffold + axis-shared data — we ultimately quantified with our *own* scripts (entity-masked shingle similarity, per-doc-type word-count distributions). pseolint had the data to say it directly. A per-template headline like *"median 5% of each page is unique vs the template; 354/356 pages below threshold"* would make the real problem the first thing the operator sees, instead of something they reverse-engineer.

## What we changed on the site side (for completeness)

- Surfaced the unused researched ground truth + uncapped liabilities/statutes (+296 words/page) — good for E-E-A-T, but **did not** clear `unique-value` (see Gap 4).
- Confirmed the only thing that clears it is genuine per-page regeneration of the lead narrative + FAQs + cited clauses (a stale-data problem: the generation schema already enforces ≥180-word, citation-bearing output; the corpus predated it and was never re-run).
- Chose a hybrid enrichment path (bulk model regen for the tail + hand-authoring for high-value hubs).

## Recommended pseolint changes, prioritized

1. **Gap 3 — discovered-vs-declared mismatch warning.** Smallest change, catches the whole failure class even if recursion has edge cases. Do this first.
2. **Gap 2 — don't classify `small-marketing` / suppress pSEO rules / emit READY off a sub-threshold discovery.** Add an "inconclusive" outcome.
3. **Gap 1 — root-URL discovery must recurse sitemap indexes before the homepage-crawl fallback.** Add the 2-level-index regression fixture.
4. **Gap 4 — axis-aware `unique-value` fix guidance.**
5. **Gap 5 — per-template unique-content-ratio headline metric.**

Gaps 1–3 are one coherent fix to the discovery → classification → verdict pipeline; that pipeline returning a confident green on an undiscovered corpus is the bug that matters most.
