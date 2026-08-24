# Authority-moderated risk: layered domain-authority signal

**Date:** 2026-06-12
**Status:** Design (approved in brainstorm). Build is **gated** on obtaining an ownable authority dataset for the corpus (see §8).
**Program:** "The credibility leap"; **sub-project 3**, first increment.
**Context:** Sub-projects 1–2 (two-sided harness + entity auto-masking) are shipped; recall 56%, risk inversion fixed. Diagnosis of the remaining reputable over-flagging (segment→critical, numbeo→concerning) proved it is **not** a fusion/scoring bug.

## 1. The finding that drives this design

Measured empirically: the *winning* reputable directories are **on-page thinner and more templated than the spam**.

| site | outcome | words/page | masked-template similarity | Ahrefs DR |
|---|---|---|---|---|
| segment.com | **wins** | 97 | **100%** | 87 |
| numbeo.com | wins | 300 | 35% | 83 |
| zacjohnson.com | **penalized** | 2,724 | 17% | 65 |
| fresherslive.com | penalized | 327 | 17% | 53 |
| beingselfish.in | penalized | 338 | 60% | 3.1 |

segment is 97 words/page and 100% templated after masking (textbook thin+doorway) yet it wins, because it sits on `segment.com` (Twilio: DR 87). The penalized AI farms have *more, more-varied* content but lower authority and lower-value content. **There is no on-page signal that ranks segment above the spam.** An on-page deterministic linter therefore has a hard ceiling: it measures *structural spam-likeness* (necessary for penalty) but cannot see *authority* (which decides whether that structure is actually penalized). Domain Rating cleanly separates the winners (83–94) from the farms (≤69) at a ~80 threshold, confirming **authority is the missing moderator**.

## 2. Goal & non-goals

**Goal:** Incorporate a domain-authority signal that *moderates* the risk score, discounting structural-spam risk for high-authority domains (segment/numbeo) while leaving low-authority domains (doorways, farms) flagged, fixing the over-flagging without dropping recall. Plus surface authority context to users.

**Non-goals:** authority is a **moderator, not a verdict** (it doesn't override genuine spam on low-authority sites, and it can't fix the parasite case where a high-authority *host* is abused on a subfolder, that needs host-section analysis, out of scope). No off-page backlink crawling of our own. No change to existing rules.

## 3. Architecture: three layers by legal-permission

Each source is used only where its license allows.

### Layer 1: Algorithmic moderator (core engine)
A pluggable provider returning a normalized 0–100 authority per **registrable domain**, backed by sources we can legally compute-with **and** store:
```ts
export interface AuthorityProvider {
  /** 0–100 authority for the registrable domain; null when unknown. */
  authorityFor(domain: string): Promise<number | null>;
}
```
Concrete sources, combined:
- **OpenPageRank**: 0–10 Page Rank → ×10. Free API (key) + downloadable dataset; permitted in-algorithm + storable (attribution required).
- **Common Crawl host webgraph**: harmonic-centrality rank, normalized to 0–100. Open (CC license), owned, no key/revocation: the durable backbone.
- **Combination:** if both present, take the **max** (authority is "best evidence of trust"; either source vouching is enough); one present → use it; **both absent → return null → no moderation** (fail-safe to current behavior).

The provider feeds the **existing** `shiftVerdictForAuthority(verdict, authorityScore)` (`auditor.ts:613`), which already shifts the verdict by authority, today it takes a *caller-supplied* number; this increment supplies a *real, sourced* one. Refine it to: **if authority ≥ `authorityDiscountThreshold` (default 80, calibrated), shift the verdict down one tier** (critical→concerning→caution); below threshold, no shift. (Keep it a single-tier, bounded nudge, never a multi-tier override.)

### Layer 2: Display (web app, `apps/web`)
Show **Ahrefs DR** to Pro users as an attributed, live, per-audit data point: `Domain Authority (Ahrefs DR): 87 · "Domain Rating by Ahrefs" [https://ahrefs.com/]`. License permits *display* with attribution; it must NOT be stored in bulk or fed into the algorithm. This communicates the core insight to users ("high structural risk + high authority ⇒ likely fine, like segment"). Independent of Layer 1.

### Layer 3: Reproducibility (calibration corpus)
Snapshot the **OPR/CC** (ownable) authority per corpus domain into a `domainAuthority` field on each `CorpusSite`, seeded once by a script. The harness reads the frozen value → deterministic, measurable. **Ahrefs DR is never snapshotted** (license).

## 4. Licensing constraints (must be honored)

- **Ahrefs DR:** display-only, attributed, live, no storage, no algorithmic use (per `https://ahrefs.com/legal/domain-rating-license` §4(b): prohibits use in a competing derived metric and bulk harvesting). Revocable; SGD 100 liability cap.
- **OpenPageRank:** confirm its specific terms permit commercial in-algorithm use + storage before shipping; attribution required. (Founder action.)
- **Common Crawl:** CC license: broadly permissive; attribution courtesy. Safest for a permanent core signal.

## 5. Data flow

audited domain → `AuthorityProvider.authorityFor(registrableDomain)` (OPR live/cached + CC table) → `authorityScore | null` → after risk/verdict computed, `shiftVerdictForAuthority(verdict, authorityScore)` applies a one-tier discount iff `authorityScore ≥ threshold`. In the harness, the provider reads the corpus `domainAuthority` snapshot (no network). Live audits fetch OPR (cached) + read the bundled CC table.

## 6. Calibration & success metric (measured when data lands)

- Threshold ~80 (from the DR separation; re-calibrate against OPR/CC values, which are lower-resolution).
- **Success:** segment & numbeo verdicts drop to within their `expectedVerdictCeiling` (caution) via the authority discount, while every policy-violating site's verdict is **unchanged** (their authority is below threshold): i.e. **precision up, recall held**, ratchet green. Measured against `baseline-scorecard.json` (recall 56%).

## 7. Risks

- **Parasites (high host DR, abused subfolder)**: authority would wrongly discount; out of scope (needs host-section analysis), and they're our undetectable subfolder fixtures anyway. Document, don't pretend to fix.
- **Expired-domain (inherited DR ~69) / lagging authority (zacjohnson 65)**: handled by the high (~80) threshold; confirm with OPR/CC values.
- **Source quality:** OPR/CC are lower-resolution than DR; the threshold/combination may need tuning, or CC alone may be insufficient → verify separation on the corpus before trusting it.
- **Revocable/keyed APIs:** OPR is third-party; CC (owned) is the hedge. Provider is pluggable so sources can be swapped.
- **Over-discount:** a one-tier, threshold-gated, fail-safe shift bounds the blast radius; the ratchet stops any recall regression.

## 8. Build gate & decomposition

**Buildable now (no external data; unit-tested with mocks/synthetic authority):**
- The `AuthorityProvider` interface + a `CompositeAuthorityProvider` (max-combine, fail-safe).
- The OpenPageRank API client (fetch + parse, mocked in tests).
- The `shiftVerdictForAuthority` refinement (threshold-gated one-tier discount) + wiring into the auditor.
- The corpus `domainAuthority` schema field + a snapshot/seed script (scaffolding).
- The Ahrefs DR display component (`apps/web`), attributed.

**Gated on an ownable authority dataset for the corpus (founder unblock):**
- Seeding real `domainAuthority` values (needs an OPR key and/or a processed Common Crawl webgraph table).
- The end-to-end **measurement** (recall/precision delta): cannot be run until the corpus has real authority values. Do NOT commit a new baseline until measured.

## 9. File-level changes

- **Create** `packages/core/src/algorithms/authority/provider.ts`: `AuthorityProvider`, `CompositeAuthorityProvider`.
- **Create** `packages/core/src/algorithms/authority/openpagerank.ts`: OPR client.
- **Create** `packages/core/src/algorithms/authority/commoncrawl.ts`: CC table lookup (loads a bundled rank table; stub the table path until processed).
- **Modify** `auditor.ts`: refine `shiftVerdictForAuthority` (threshold-gated); call the provider; thread `authorityScore` into the summary (display).
- **Modify** `types.ts`: `AuditOptions.authorityProvider?` / `authorityThreshold?`; `AuditSummary.authority?: { score, sources }`; `CorpusSite.domainAuthority?`.
- **Modify** calibration corpus schema + `scripts/calibration-corpus.ts`: `--seed-authority` mode; read snapshot in audits.
- **Create** (web) the Ahrefs DR display element + attribution.
- **Tests** for provider/openpagerank/shift logic (mocked).

## 10. Where this sits

Sub-project 3 increment 1. After this: the cross-rule fusion lever (deferred, the over-flag turned out to be authority, not fusion) and any further calibration remain open, but authority-moderation is the empirically-justified first move.
