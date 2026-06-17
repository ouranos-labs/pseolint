# pseolint extension — SERP competitive teardown (the "climax" reframe)

**Date:** 2026-06-17
**Status:** Design — awaiting approval
**Builds on:** the two-tier UX (`docs/superpowers/specs/2026-06-17-pseolint-extension-ux-redesign-design.md`, shipped)
**Architecture base:** `docs/extension-architecture.md` (§2 in-context thesis, §6 credibility, §11 flags-not-accusations, §14 thin-wedge)

## 1. Problem

The deep scan answers a **QA question** — "are any of these pages broken?" — about results Google already filtered to be unbroken. So it almost always returns "0 flagged," which reads as anticlimactic. Worse, it fetches + parses 10 pages of rich data and shows only the rare flag. SEO practitioners get value from **strategy** (competition, opportunity, the AEO race), not QA.

## 2. Reframe

**QA linter → live-SERP competitive teardown.** The extension's one unfair advantage over the hosted audit (§2) is that it sees the *live ranked SERP*. Turn each deep scan into a screenshottable competitive read of that exact SERP — always interesting on a commercial query, computed from data we already fetch.

## 3. Monetization boundary (load-bearing — free + OSS, but a wedge)

The extension stays **free, unlimited, MIT, no auth** (gating a SERP overlay defeats the wedge; deep-scan cost is client-side so free is sustainable). The moat is the hosted service (AGPL `apps/web`), not the client. To avoid the §14 trap (a free tool so complete it never funnels), the dividing line is:

**The extension does recon on *competitors'* pages on *one live SERP*. The SaaS audits, fixes, and monitors *your* site.**

| Free in the extension (provocation) | Paid/SaaS (resolution) |
|---|---|
| How programmatic this SERP is, who dominates | **Your** site audited, by template |
| Which ranking pages are thin / templated / no-schema | **How** to beat them — the fix queue |
| The content-depth bar to clear | Your gap vs that bar, page by page |
| Who's AEO-ready (and who isn't) | Make *your* pages citable + monitor drift |

The want is **created** (their weaknesses, the opening) and deliberately **left unmet** (your fix) → the teardown pulls *harder* to pseolint.dev than the QA version. Every result links to "audit this →" / the headline CTA is "audit your own site →".

## 4. The reads (all descriptive facts — §6/§11, no verdicts, no accusations)

Computed from the SERP DOM + the existing per-result fetch:

- **A · Saturation** *(zero-fetch, Tier-1, always on):* "N/M results templated · dominated by `host` (k)." Already partly built (landscape) — elevate it to a headline.
- **B · Content bar** *(fetch):* median `contentText` word count across fetched results = the depth bar to clear; per-result depth as a mini bar chart.
- **C · Vulnerability map** *(fetch):* classify each fetched result by *fact*, not judgment — `thin (240w)`, `templated`, `no-schema`, `soft-404`, or `strong`. The strategic framing ("the opening: #4 ranks on 240w") appears as **pseolint's read in the summary line**, never stamped on a competitor's row as an accusation (§11).
- **D · AEO-ready** *(fetch + core `aeo/*`):* tag results structured for AI-Overview citation (single-page-sound subset: `aeo/answer-first`, `aeo/citable-facts`, `aeo/content-modularity`, `aeo/faq-coverage`; `schema/json-ld-valid` presence). "2 of 10 are AEO-ready — including none of the top 3."

**Soundness notes (resolve ambiguity up front):**
- The per-row **`templated`** tag = **cluster membership** from `landscape.js` (≥2 results sharing host+parent), NOT `pattern.js`'s single-URL guess — a lone templated-looking URL is not reliably templated.
- The **content bar** is the median word count over results that were **actually fetched and parsed** (`ok && !isLikelyShell`); failed/shell fetches are excluded from the bar and shown as "unscanned," never as 0 words.
- Per-row tags are a **non-exclusive set of facts** (a row can be `thin` + `templated` + `no-schema`); **`strong`** means none of the negative facts fired.

## 5. Surfaces & UX

- **Deep scan → a SERP scorecard in the side panel** (recommended placement: side panel only — keeps Google's page uncluttered; per-result inline stats are a deferred option):
  - Headline: saturation + content bar ("60% programmatic · bar ≈ 1,800 words").
  - A horizontal **depth bar-chart** across all results (vanilla SVG/divs), worst→best, color by fact tag.
  - Per-result rows: `rank · host · 240w · /city/:slug · no-schema · [thin]` with the full-audit link.
  - One read line: *"The opening: bulk-pages.net ranks #4 on 240 words, no schema."*
  - Funnel CTA: **"Audit your own site →"** (pseolint.dev).
- **In-page (Tier-1) unchanged:** the auto landscape chip + neutral `templated` markers remain the zero-permission reach layer.
- A **clean SERP is still a result:** "All 10 clear the bar — strong field" (not an empty void).

## 6. Data flow

- **SW (`background.js`):** `analyze(url)` returns a compact **signal set per result** — `{ url, ok, status, words, og:{...present flags}, template, headings, aeoTags[] }` — not just `{verdict}`. Still parsed-and-discarded in-worker; only the small signal set crosses back (no raw HTML, no egress).
- **Content script:** passes through results + their SERP rank/host; mounts the existing Tier-1 markers.
- **Side panel:** computes the reads (median, classification, saturation) from the signal sets and renders the scorecard. All pure functions → unit-testable.

## 7. Reuse vs new

- **Reuse:** the fetch pipeline, `parse.js` (already extracts words/og/title/headings), `rules-client` Tier-1, `landscape.js`, the side panel, Path B deep link, coverage.
- **New:** surface the full signal set from the SW (vs verdict-only); pure read-computations (`teardown.js`: median/content-bar, vulnerability classification, AEO tagging); the scorecard UI (vanilla bar chart); imports of single-page `aeo/*` rules from core via subpath exports (Phase 3).

## 8. Non-goals

- No "how to beat them" guidance, no your-own-site audit, no fix queue, no monitoring — all SaaS (§14).
- No gating, no auth, no payment in the extension.
- No verdicts or accusations on competitors' rows — descriptive facts only (§6/§11).
- No UI framework (§4); no new server endpoint (funnel is the deep link).

## 9. Testing

Pure, runnable `node` checks (repo convention): content-bar/median, vulnerability classification (facts from a signal set), saturation, AEO tagging, scorecard ranking. Live-verify the scorecard in a loaded Chrome on a templated query (`things to do in <city>`).

## 10. Phasing (for the plan)

1. **Signal surfacing** — SW returns the per-result signal set; side panel consumes it; existing behavior preserved.
2. **The reads + scorecard** — `teardown.js` (content bar + vulnerability classification + saturation headline) + the side-panel scorecard UI (bar chart, rows, opening line, "audit your own site →" CTA). This is the climax; ships A+B+C.
3. **AEO race (D)** — import single-page `aeo/*` rules; add the `AEO-ready` tag + "who's citable" line. (Boldest hook; cut to fast-follow if Phase 2 is enough.)
4. **Docs/store** — reposition copy: "competitive recon on any SERP, free" + the recon→resolution funnel.
