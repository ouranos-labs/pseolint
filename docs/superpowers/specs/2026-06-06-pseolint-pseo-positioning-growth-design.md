# pseolint.dev — Positioning & pSEO Growth Design

**Date:** 2026-06-06
**Status:** Draft for review
**Author:** Brainstormed with Claude (3 critique rounds + positioning resolution)

## Origin

The trigger for this work: a feeling that pseolint.dev's *own* programmatic-SEO
potential is wasted. The irony is sharp — a tool whose entire job is auditing
programmatic-SEO sites publishes only ~20 marketing pages of its own while
sitting on a self-replenishing firehose of structured audit data.

This spec is deliberately the *opposite* of "build a huge pSEO page farm." It
is the version of a growth program that survived being attacked from ~22
standpoints across three critique rounds. The headline finding: **pSEO-at-scale
is not the answer; positioning + measurement are.**

## What we explicitly rejected (and why)

These were considered and killed. Recording them so they don't get
re-proposed:

1. **Named-domain firehose** — `/site/[domain]` pages at scale for every
   audited site. Rejected: (a) it *is* scaled content abuse — pseolint would
   fail its own audit and risk deindexing the root domain; (b) defamation /
   trade-libel exposure, made worse by our own documented blind spots
   (`blind_spots_audit`); (c) intent mismatch — people looking up a
   competitor's site don't convert to monitoring *their own* site.
2. **Large prose topic corpus on a young domain** — won't rank without an
   authority/link foundation; won't convert; clonable by any competitor with a
   writer.
3. **AEO-first reorientation** — *less* measurable than Google SEO (no
   Search Console for LLMs) and *more* zero-click. Wrong response to a
   measurement gap. AEO stays a *byproduct* of good structured pages, not the
   strategy.
4. **Free public "rate any URL" tool, ungated** — gives away core compute at
   scale, invites abuse/crawler-blacklisting, and cannibalizes Pro.
5. **Broad "content-quality / SEO audit" repositioning** — commodity
   competition vs. Surfer/Clearscope/Semrush/Ahrefs; dilutes the moat;
   un-rankable on a young domain.

## Positioning (locked)

> **pseolint is the penalty-risk audit for sites that publish at scale.**

The key move is decoupling two things niche tools usually collapse:

- **Identity / engine / moat → stays narrow.** We remain THE authority on
  scaled-content / SpamBrain penalty risk. We do *not* become a generic content
  tool.
- **Entry language / front door → broadens to symptoms & outcomes.** The buyer
  does not search "programmatic SEO" or "doorway pages." They search *"traffic
  dropped after core update,"* *"Google deindexed my pages,"* *"are my
  programmatic pages a penalty risk."*

### ICP

Sites that publish **many pages programmatically** *and* **fear Google
penalties**: programmatic SaaS, marketplaces, directories, AI-content
publishers, large affiliate/blog operations.

### Trigger event

A **traffic drop** or a **core-update scare**. This is when the buyer goes from
indifferent to urgent — the moment the funnel is built around.

### Why A beats the alternatives

- Grows the addressable pond (symptom-searchers in panic mode) without becoming
  a commodity, because the engine and authority stay specialized.
- A panicked symptom-searcher converts far better than a curious "best pSEO
  sites" browser.
- It contains the purist option: we still build `/rules` and `/tools` pages —
  they become the *authority-proof layer*, not the front door.

## The surviving kernel (what we build)

Ordered by dependency, not by excitement.

### 1. GSC-live first — the load-bearing dependency

Currently stubbed (roadmap v1.1). Everything else depends on it:

- **Measurement:** without GSC we cannot measure whether our own pSEO program
  works — flying blind on our own dogfood, the exact malpractice pseolint sells
  against.
- **Product value:** GSC-live is what converts a one-time penalty scare into
  ongoing $19/mo monitoring. Without it, Pro isn't compelling enough for the
  symptom-searcher to stay.

**Decision:** GSC-live is sequenced *before* the growth surfaces below. The
growth program is designed assuming it exists.

### 2. Symptom / outcome pages — the centerpiece

Substantive, schema-rich pages targeting high-intent symptom queries. Buyer
intent, not jargon. Each must *pass pseolint's own audit by design* (the
dogfood proof — see Guardrails).

Candidate surfaces (validated against real demand before building — see
Validation):

- `/symptoms/traffic-drop-after-core-update`
- `/symptoms/pages-deindexed`
- `/symptoms/[symptom]` (extend existing infrastructure)
- `/penalty-recovery/[type]`
- `/core-update/[date]` — what changed, who got hit, how to check your risk

These reuse the existing `/symptoms` route + `MARKETING_SYMPTOMS` data layer.
Each page ends in a single clear action: run the free audit.

### 3. One throttled free tool — the wedge

A single emotionally-resonant free tool, e.g. **"Will the next core update hit
your site?"** — crawls a sample, returns a penalty-*risk* read tied to the
symptom.

The cannibalization line is drawn **deliberately**, not by accident:

- **Free shows the *problem*** — your risk read, which symptoms you trip, a
  sample of affected pages.
- **Pro shows the *fix + monitoring*** — the full fix queue, GSC-grounded, and
  ongoing change-driven alerts so you're warned *before* the next update.

Throttling/abuse controls are required (rate limits, sample-size caps) because
this is public-facing compute. See Open Questions.

### 4. Authority-proof layer — `/rules`, `/tools`, `/symptoms` (jargon)

Keep and expand the existing curated pages, but demote them from "front door"
to "proof of expertise." They are what a skeptical buyer (or an LLM) reads to
trust the metric. This also addresses the **metric-independence** concern: open
methodology + calibration corpus is a credibility strategy, not just content.

### 5. Aggregate / anonymized data — original-data content

The defensible, citable version of the audit firehose: *"the median jobs-board
trips 4 doorway signals,"* *"sites like yours score X."* No named domains, no
defamation surface. Extends the `/research` instinct.

**Consent gate:** free-tier users' audit results may not be used as public
benchmark data without a ToS/consent update. This is a prerequisite, not an
afterthought.

## Guardrails

### Dogfood: pseolint must pass its own audit

Every indexable page we generate must clear pseolint's own rule set before it
enters the sitemap. This is both the safety mechanism (don't become a spam
farm) and the single most persuasive marketing asset (a live "this site,
audited by itself" proof). Build a CI/check step that audits the site's own
generated pages.

### Versioning against a moving engine

The v0.4 engine redesign is a breaking change in flight. Every rule page,
score, and audit-derived claim is a staleness liability. Pages that cite rule
behavior must be generated from the engine's current rule definitions (single
source of truth), not hand-authored copies that drift.

## Measurement & kill criteria

Defined now, executable once GSC-live ships:

- **Leading indicator:** impressions on symptom pages in GSC within 8–12 weeks.
- **Conversion indicator:** free-audit runs originating from symptom pages →
  Pro signups.
- **Kill criterion (example, to be finalized):** if symptom pages haven't
  earned a defined impression threshold by month 3, stop expanding the corpus
  and reassess channel vs. tool-led growth / integrations.

## Validation before scaling

Because pSEO compounding cannot be validated in a week, validation is scoped to
what *is* knowable upfront:

1. Pull real search demand for ~20–30 candidate symptom/outcome query clusters.
   Kill the ones with no volume or no buyer intent.
2. Confirm at least a handful have realistic rankability for a young domain
   (long-tail, low-competition symptom phrasing).
3. Ship a *small* first batch (not a farm), instrument with GSC, and let
   time-in-market provide the real signal.

This avoids both the "build 200 pages and pray" failure and the
"analysis-paralysis, never plant the tree" failure.

## Explicit non-goals

- No `/site/[domain]` named-domain pages.
- No hall-of-shame / "worst sites" rankings (positive-only leaderboard stays).
- No broad "SEO audit" repositioning.
- No AEO-first reorientation (AEO is a byproduct, not the strategy).
- No large speculative prose corpus.

## Open questions

- Exact free-tool abuse/throttling design (rate limits, sample caps, auth-gating
  partial results).
- Whether GSC-live's current v1.1 timeline blocks this or runs in parallel.
- Finalize the kill-criterion thresholds once baseline traffic is known.
- ToS/consent wording for anonymized audit-data usage.

## Sequencing summary

1. GSC-live (dependency).
2. Demand validation of symptom clusters (parallel, cheap).
3. First small batch of symptom/outcome pages (dogfood-checked).
4. One throttled free tool wedge.
5. Aggregate-data content (after consent gate).
6. Measure → kill or scale.

## Strategic refinement — 2026-06-06 (post slice-1/1b)

Question raised: "pSEO means volume — are we on the most intelligible path given Google's behavior?" Decision (owner deferred to assistant):

**The "volume vs. not" axis is wrong. The real axis is data-moat × template, safe to dogfood.**

- What slice 1/1b shipped (11 symptom pages) is **topical-authority editorial SEO on a programmatic shell — not programmatic SEO.** Name it honestly. Stop equating "pSEO potential" with page count.
- **Volume is the wrong goal for this site**, for three compounding reasons: (1) it fails pseolint's own audit (scaled-content-abuse / dogfood); (2) post-March-2024 Google leaves volume-without-a-data-moat in "Crawled/Discovered — not indexed"; (3) **young, low-authority domain** → volume simply won't index until trust is earned. Reason (3) makes depth-first the mandatory phase 1 regardless of endgame.
- **Genuine pSEO is bounded, not infinite.** The only dataset that is simultaneously proprietary + demand-relevant + safe-to-template is **aggregate/anonymized audit statistics** (e.g. boilerplate-ratio / template-diversity benchmarks by industry or pattern). That is the real phase-2 engine. The large per-domain dataset stays rejected (unsafe). pseolint will never be a millions-of-pages firehose — by design.

**Refined sequence (supersedes the count-oriented reading of slice 1):**
1. **GSC-live** (measurement) — load-bearing; build before scaling content further.
2. **Deepen, don't widen** — interlink the existing 11 symptom↔rule cluster, optimize for conversion, not new slugs. Add a symptom page only when GSC shows a specific validated gap.
3. **Phase-2 data-moat engine** — aggregate/anonymized stats × template, gated on (a) earned authority and (b) GSC-proven editorial conversion + ToS/consent.
4. Throttled free-tool wedge remains a parallel option once measurement exists.

**Do NOT** keep cranking symptom pages for volume's sake — that is cargo-culting the very pattern pseolint audits against.
