<!--
  STATUS: DRAFT — DO NOT PUBLISH YET.
  Gate: publish only once GSC shows the paperforge.dev "Crawled – currently
  not indexed" set recovering (re-indexing), so the results section below is
  a verified before/after and not a process story dressed up as a result.

  Angle: woven — operator story (real 5,600-page site, indexing problem, what
  the audit found, what we fixed) as the spine; the false "READY" dogfood as
  the integrity turn that motivated real product changes (incl. the pre-flight
  origin health check).

  Publish target: a hand-built TSX page under /research/ (mirror
  apps/web/src/app/research/state-of-pseo-2026/page.tsx — Article JSON-LD,
  metadata, sitemap entry), then link it from the landing-page proof section.

  Every number below is sourced from the internal dogfood
  (docs/case-studies/2026-06-09-sitemap-index-false-negative.md, commit
  96a78dd). Sections marked TODO must be filled from live GSC + a fresh
  re-audit at publish time. Do not invent the outcome.
-->

# Field notes: we pointed pseolint at our own 5,600-page site — and it lied to us

**TL;DR.** paperforge.dev is our own programmatic-SEO site: ~5,602 legal-template
pages from one template, ~1,060 of them stuck on "Crawled – currently not
indexed" in Google Search Console. We reached for our own tool first. The
documented quick-start — `pseolint https://paperforge.dev` — came back
**READY ✓**. That was wrong. The real verdict was **CONCERNING**, and finding it
exposed both a real content problem on the site *and* a class of bug in pseolint
itself. This is the whole story: what was broken, what we shipped to fix it on
both sides, and — once Google catches up — whether the fixes actually got the
pages re-indexed.

---

## The site

paperforge.dev generates legal templates programmatically: 55+ roles × 22
document types × ~20 states ≈ **5,602 published pages**, all from one URL
template, `/templates/:slug`. Classic pSEO shape — exactly the thing pseolint
exists to audit.

The symptom was the one every pSEO operator dreads. Google Search Console
reported **~1,060 URLs as "Crawled – currently not indexed"**: Googlebot had
fetched the pages and *declined to index them*. On a template site that's rarely
1,060 separate problems — it's one template-level quality problem, replicated
1,060 times. So we ran the audit.

## What the audit said (and why it was a lie)

```
$ pseolint https://paperforge.dev
✓ Discovered 1 content page
✓ Site type: small-marketing (confidence 90%, 1 URLs, / covers 100%)
✓ Suppressed 5 pSEO-only rules — pass --strict to run all 32
Verdict: READY ✓
Integrity A · Discoverability A · Citation A · Data A
```

A 5,602-page programmatic directory was audited as a **one-page brochure** — and
passed. Pointing pseolint directly at one child sitemap told a very different
story:

```
$ pseolint https://paperforge.dev/sitemap/<doc-uuid>
✓ Discovered 392 content pages
✓ Site type: programmatic-directory (confidence 70%, /templates/:slug covers 100%)
Verdict: CONCERNING ⚠   Integrity F · Discoverability A · Citation A · Data A
3 ship-blockers — content/unique-value (385 pages, worst 18 unique words),
spam/near-duplicate (×11), spam/publication-velocity (382 @ one date)
```

`Integrity F`. 385 pages where the genuinely-unique content was as thin as **18
words**, the rest drowned in shared template scaffold. *That* is what "Crawled –
currently not indexed" looks like from the inside: Google crawled the pages,
found almost nothing on each that it couldn't already see on a thousand
siblings, and passed.

The gap between the two runs is the uncomfortable part: **the default invocation
returned the opposite of the truth.**

## Why our own tool got it wrong

Three failures stacked:

1. **Discovery.** paperforge's sitemap is a standard two-level index
   (`/sitemap.xml` → 22+ child `<urlset>` files). pseolint didn't recurse the
   index from the root URL, so it discovered only the homepage.
2. **Classification.** Off a single discovered page, the classifier confidently
   called the site `small-marketing` (90%) — and that classification
   *suppressed the five pSEO rules* that would have fired.
3. **No sanity check.** pseolint had seen a sitemap *index* at discovery time
   but never compared "URLs declared" against "URLs audited." One page audited
   against 5,600 declared should be a screaming red flag. It was silent.

A discovery miss became a confident-but-wrong site type, which disabled the
relevant rules, which produced a green verdict. For a tool whose entire reason
to exist is auditing large pSEO sites, **silently passing one is the most
damaging failure mode we have.** We're documenting it rather than quietly
patching it because a SpamBrain linter that can't survive its author's own
scrutiny has no business asking you to trust it with yours.

## What we shipped to fix pseolint

This dogfood drove a batch of real changes (core 0.6.5, commit `96a78dd`, and
follow-ups):

- **Sitemap-first discovery.** pseolint now reads `robots.txt` `Sitemap:`
  directives (or probes `/sitemap.xml`), fetches declared URLs *before*
  link-crawling, and recurses `<sitemapindex>` children — with a regression test
  for a nested index discovered from `robots.txt`.
- **A coverage guardrail.** When a sitemap index references children that can't
  be fetched, or far fewer pages get fetched than the sitemap declares, the run
  is flagged `truncated` with `truncatedKind: "coverage"` — a first-class
  "don't trust this verdict" signal, with false-positive guards so deliberate
  sampling and small crawl caps don't trip it.
- **Honest verdicts on thin runs.** A run truncated *before* classification is
  forced to site type `unclear` (no rule suppression), and **any** truncated run
  is floored to at least `caution` — it can never read `READY` again.
- **Axis-aware fix guidance.** `content/unique-value` now warns that content
  repeated across same-axis sibling pages (a role's boilerplate, a state's
  statutes) doesn't count toward uniqueness — see the next section for why that
  mattered.

### The part that became a product feature: the origin couldn't take the crawl

There was a second path to the same false "READY," and it's the one worth
dwelling on. On a live re-run *with discovery fixed*, the result depended
entirely on pseolint's backpressure watchdog:

- **Watchdog off:** pseolint found all **5,680** URLs, classified
  `programmatic-directory`, and returned **CAUTION · risk 33** — the truth.
- **Watchdog on (the default):** paperforge's cold-start origin degraded under
  the crawl (rolling p95 latency **~2.8s vs a ~0.44s warm baseline**) because
  each uncached page fanned out into a chain of database queries. The watchdog
  **correctly aborted after ~11 fetches** — it exists precisely to stop a crawl
  from hammering a struggling origin — but the 1-page salvage was then
  misclassified as `small-marketing` and scored `READY`.

The watchdog was doing its job; the salvaged report just wasn't honest about it
(now fixed, above). But the deeper lesson is the one that shaped the roadmap:
**by the time the watchdog tripped, the crawl had already piled load onto an
origin that was visibly struggling.** The actionable signal for this site was
"the origin can't sustain a full crawl — audit a child sitemap directly, or a
faster environment."

So pseolint now does that check *up front*: a **concurrent pre-flight origin
probe** runs before the crawl on every audit path — one-off scans *and* the
monitoring runs that caused this incident in the first place. If the origin is
unreachable, pseolint refuses to start; if it's degraded, pseolint drops to a
gentle, low-concurrency crawl instead of finishing off a struggling server.
"We check your origin can take the crawl first" is a feature paperforge paid for
in downtime.

<!-- TODO at publish: confirm the released version that ships checkOriginHealth /
the pre-flight check and reference it precisely (it landed on the launch-strategy
branch; verify it's in a tagged release before publishing this claim). -->

## What we changed on the site

The audit was right about the disease: each page is a thin unique lead (~30–90
words) wrapped in a large shared scaffold plus axis-shared data. Fixing it was
not what we first assumed.

- **First attempt (wrong):** we surfaced ~296 words/page of genuinely useful,
  pre-researched data (per-role licensing/insurance, per-state statutory
  provisions). A re-audit showed **no movement** (385 → 354 flagged). Why: that
  data is unique per *axis* — a role's regulations are identical across that
  role's 22 documents — so it's *shared* across siblings and correctly doesn't
  count. (This is exactly the trap the new axis-aware guidance now warns about.)
- **What actually moves it:** genuine per-page regeneration of the lead
  narrative, FAQs, and cited clauses. The generation schema already enforces
  ≥180-word, citation-bearing output — the corpus simply predated it and was
  never re-run. We chose a hybrid path: bulk model-regeneration for the long
  tail, hand-authoring for high-value hubs.

## Did it work?

This is the part that matters, and the part we won't claim until Google says so.

<!-- TODO at publish — fill ONLY with verified numbers, no estimates:
  - Baseline (pre-fix): GSC "Crawled – currently not indexed" count (~1,060 at
    the start), pseolint verdict CAUTION · risk 33, fix-deploy date.
  - Outcome (post-recrawl): GSC indexed-count delta over time, fresh pseolint
    re-audit verdict + risk score, and — if available — impressions/clicks from
    GSC for the affected templates.
  - Link the public pseolint report (/r/<slug>) for the re-audit so readers can
    verify the score themselves, and the live badge.
  If the pages do NOT recover, say so plainly and analyze why — an honest null
  result is still a better artifact than a vague win. -->

> **Status: pending re-index.** Fixes deployed [DATE]. "Crawled – currently not
> indexed" recovery on a regenerated pSEO corpus typically takes weeks. We'll
> update this section with the verified before/after — including a public,
> re-runnable pseolint report — once GSC shows the recrawl landing.

---

*pseolint is the open-source linter for programmatic SEO. The dogfood findings
above are documented in full, with commit references, in the repo. Audit your
own site: [pseolint.dev](https://pseolint.dev).*
