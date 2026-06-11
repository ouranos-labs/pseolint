# Richer Deterministic Fact Extraction — Design Proposal

**Status:** proposed (2026-06-11)
**Date:** 2026-06-11
**Author:** pseolint maintainers

This is **part 1 of a 4-part "Page Value Model"** initiative — the positive
counterpart to pseolint's existing *risk* verdict. Where the risk verdict answers
*"how likely is this page to get penalized?"*, the Page Value Model answers
*"how much genuine, citable, authoritative information does this page carry?"* —
modeled on Google's helpful-content / E-E-A-T evaluation.

The four parts, in dependency order:

1. **Richer deterministic fact extraction** ← *this spec*
2. On-page authority / E-E-A-T deepening (deterministic)
3. Page Value Score — a first-class 0–100 output built on `content/value-add`
4. LLM-graded helpfulness (optional, in the `ai/*` layer)

Off-page authority (backlinks, Domain Authority, engagement) remains a
**deliberate non-feature** to keep the engine offline-runnable; callers pass a
bring-your-own `authorityScore` hint instead. Nothing in this spec changes that.

## Why

The engine already counts *facts*, not just words: `aeo/citable-facts` extracts
typed numeric facts (money, %, timeframes, dates, Form IDs), masks entity tokens,
and separates entity-specific facts from template facts. `content/value-add`
already composes seven originality signals into a per-page value verdict.

But "facts" today means **only the six numeric regex categories**. A page that
cites the GDPR, links to three `.gov` sources, and names four standards bodies
scores zero extra credit for any of it. Google's evaluation of page value leans
heavily on exactly those signals — named entities, sourced citations, and
quantified claims. This spec widens the engine's deterministic notion of "a fact"
to include them, feeding both a new rule and the existing value composite, while
keeping `aeo/citable-facts` byte-for-byte unchanged so the reputable-pSEO
calibration corpus is not disturbed.

## Design principles (carried from the engine)

- **Deterministic, offline, cheap.** Regex + DOM + URL-string classification
  only. No LLM, no network fetches. Stays within the ~60s audit budget.
- **No false precision.** Heuristic detectors ship at `low`/`speculative`
  confidence so scoring profiles down-weight them; formatters render the caveat.
- **Entity-masking parity.** Counts that could be inflated by a template's own
  swapped noun (the city/SKU/role) are computed *after* `maskEntities`, exactly
  as `aeo/citable-facts` already does.
- **Calibration stability.** The existing `aeo/citable-facts` count is frozen by
  a characterization test; all new signal surfaces are additive.

## Architecture

A new shared module `packages/core/src/algorithms/fact-extraction.ts` becomes the
single source of truth for "what facts does this page carry." It exposes one
function that takes the data already on a `ParsedPage` and returns a typed
`PageFacts` object. Three consumers:

1. **`aeo/citable-facts`** is refactored to delegate its numeric extraction to
   the shared module, consuming **only** `PageFacts.citableFacts` — which is
   defined to be byte-identical to today's `extractRawFacts()` output. Behavior,
   thresholds (`minFactsPerPage: 3`, `targetFactsPerPage: 8`), and calibration
   are unchanged.
2. **New rule `content/citation-coverage`** consumes the new dimensions
   (authoritative citations, named entities, grounded claims).
3. **`content/value-add`** gains the new dimensions as additional composite
   inputs. It is already a blend of seven signals, so this is additive.

```
                          ┌──────────────────────────────┐
   ParsedPage  ─────────► │ algorithms/fact-extraction.ts │ ──► PageFacts
   (contentText, html,    └──────────────────────────────┘
    resolvedHrefs, jsonLd,        │            │            │
    url)                          ▼            ▼            ▼
                         aeo/citable-facts  content/   content/
                         (citableFacts only) citation-  value-add
                                             coverage   (composite input)
```

## `PageFacts` shape

```ts
export interface FactSpan {
  /** The matched text, normalized (lower-cased, trimmed). */
  value: string;
  /** Fact category for breakdowns / debugging. */
  kind:
    | "money" | "percent" | "timeframe" | "date" | "isoDate" | "form" // existing 6
    | "ratio" | "measurement" | "count";                              // new
}

export interface NamedEntity {
  /** Surface form, normalized. */
  value: string;
  /** How it was detected. */
  source: "proper-noun" | "cue-word" | "json-ld";
  /** Coarse type when known (from JSON-LD @type or cue word). */
  type?: "organization" | "person" | "product" | "law" | "standard" | "place" | "other";
}

export interface Citation {
  /** Resolved absolute URL. */
  href: string;
  /** Registrable domain (eTLD+1). */
  domain: string;
  /** Authority classification. */
  authority: "authoritative" | "general";
  /** Why it was classified authoritative, when applicable. */
  reason?: "tld" | "allowlist";
}

export interface GroundedClaim {
  /** The sentence text (trimmed, capped for output). */
  sentence: string;
  /** The statistic(s) that anchored it. */
  facts: string[];
  /** The citation(s) co-occurring in the same sentence. */
  citations: string[];
}

export interface PageFacts {
  /** EXACTLY today's extractRawFacts() output. Frozen — calibration-stable. */
  citableFacts: string[];
  /** New numeric kinds NOT folded into citableFacts (ratios, measurements, counts). */
  measurements: FactSpan[];
  namedEntities: NamedEntity[];
  citations: Citation[];
  groundedClaims: GroundedClaim[];
}

export function extractPageFacts(
  page: Pick<ParsedPage, "url" | "contentText" | "html" | "resolvedHrefs" | "jsonLd">,
  entityPatterns: EntityMaskPattern[],
): PageFacts;
```

## The four detectors (all deterministic)

### 1. Numeric facts — `citableFacts` (frozen) + `measurements` (new)

- `citableFacts`: lift the existing six `FACT_PATTERNS` from `citable-facts.ts`
  into the shared module verbatim. `extractRawFacts()` becomes a thin wrapper so
  the existing rule's output is provably unchanged.
- `measurements` (new, NOT counted by `aeo/citable-facts`):
  - **ratios** — `\b\d+\s*(?:out of|in|of)\s*\d+\b`, `\b\d+\s*:\s*\d+\b`.
  - **measurements** — number + unit from a closed unit list
    (`kg|lb|mi|km|m|cm|mm|MB|GB|TB|ms|fps|mph|kWh|…`).
  - **count** — number + a noun is *not* attempted (too noisy); `count` is
    reserved for explicit "N+ items"-style tokens behind a conservative pattern.
  - Run all measurement regexes on the **entity-masked** text so a masked ZIP or
    state-embedded number cannot masquerade as a measurement.

### 2. Named entities — `namedEntities`

- Refine the proper-noun regexes already proven in `aeo/answer-first`
  (`MULTI_WORD_PROPER_NOUN`, `SINGLE_WORD_PROPER_NOUN`).
- Boost precision with a **cue-word** lexicon: tokens adjacent to
  `Inc|LLC|Ltd|Corp|GmbH|Act|Regulation|Directive|Agency|Department|Bureau|
  Commission|Authority|University|Institute|Association|Standard|Protocol` and
  well-known acronyms (`ISO|GDPR|HIPAA|FDA|SEC|W3C|IETF|…`).
- Lift high-confidence entities from the already-parsed `jsonLd`: any node whose
  `@type` is `Organization|Person|Product|GovernmentOrganization|…`, using its
  `name`.
- **Entity-mask first**, then dedupe case-insensitively. The page's own swapped
  noun is masked out so it does not count as an entity.
- Confidence: `medium` (JSON-LD-sourced) / `low` (regex-only).

### 3. Citations — `citations`

- From `resolvedHrefs`, keep links whose registrable domain differs from the
  page's (external only).
- Classify **authoritative** by:
  - **TLD heuristic** — `.gov`, `.edu`, `.mil`, `.int` (and `.gov.*`/`.ac.*`
    second-level patterns).
  - **Allowlist** — a small, configurable set: `wikipedia.org`, `w3.org`,
    `iso.org`, `ietf.org`, `rfc-editor.org`, `doi.org`, `nih.gov`,
    `who.int`, `schema.org`, plus an extension hook in `AuditOptions`.
- No fetching — classification is purely by URL string. (Verifying that cited
  URLs *resolve* is explicitly out of scope; a future `tech/*` rule could own
  it.)
- Confidence: `medium`.

### 4. Grounded claims — `groundedClaims`

A deterministic approximation of "a verifiable claim," shipped at
**`speculative` confidence** with a documented limitation.

- Segment the **main-content DOM** (not just `contentText`) into sentences so
  outbound `<a>` elements can be associated with the sentence they sit in.
  Sentence split on `.!?` with an abbreviation guard.
- A sentence is a **grounded claim** when it contains **≥1 statistic**
  (`citableFacts` or `measurements`) **AND** **≥1 outbound citation** anchored
  within that sentence.
- Record the sentence, its facts, and its citations.
- **Documented limitation (in the rule `fix` text and the marketing page):** this
  detects *statistic + citation co-occurrence*, not semantic truth. True claim
  verification is deferred to the LLM layer (part 4).

## New rule: `content/citation-coverage`

- **Category:** `citation` (existing `CategoryKey`).
- **Scope:** per-page (`RuleScope` — needs only the page's own facts, but reads
  `resolvedHrefs`; classified the same way other per-page content rules are).
- **What it fires on:** a page that makes statistical/factual assertions but
  cites few or no authoritative sources — the "unsourced authority" gap. The
  signal pairs claim/stat density against authoritative-citation count.
- **Severity / confidence:** `warning` at most; `low` confidence in general and
  `speculative` for the claim-derived portion. A page legitimately may not need
  citations (a personal blog, a contact page), so the rule is conservative and
  **site-type-aware** — added to the appropriate suppression / demotion lists so
  it does not blanket-fire on `small-marketing` / non-pSEO sites.

### Firing condition (default thresholds)

```
statClaims      = groundedClaims.length + count(citableFacts ∪ measurements that
                  assert a quantity, deduped)
authoritative   = count(citations where authority === "authoritative")

fire when: statClaims >= citationCoverageMinClaims (default 4)
           AND authoritative < citationCoverageMinAuthoritative (default 1)
```

i.e. *"this page makes ≥4 quantified assertions but cites zero authoritative
sources."* Both knobs are configurable; defaults are intentionally lenient and
flagged provisional pending a calibration pass.

### Output shape

```json
{
  "ruleId": "content/citation-coverage",
  "severity": "warning",
  "confidence": "low",
  "message": "/guides/gdpr-checklist makes 9 quantified claims but cites 0 authoritative sources (4 named entities: GDPR, ICO, Article 30, EDPB).",
  "pageUrl": "https://example.com/guides/gdpr-checklist",
  "fix": "Cite the primary sources behind your numbers — link the statute, the standard, the .gov/.edu page, or the dataset. AI Overviews and Google's helpful-content systems weight pages that ground claims in authoritative references. Note: this rule detects statistic+citation co-occurrence, not semantic correctness."
}
```

## Wiring & integration points

- `algorithms/fact-extraction.ts` — new module + export from `index.ts`.
- `rules/aeo/citable-facts.ts` — refactor `extractRawFacts` to delegate; keep the
  public signature and output identical.
- `rules/content/citation-coverage.ts` — new rule + export from `index.ts`.
- `auditor.ts` — register the rule, thread new `AuditOptions.rules` knobs
  (`citationCoverageMinClaims`, `citationCoverageMinAuthoritative`,
  `citationAllowlist`), and pass the shared `PageFacts` so the page is not parsed
  for facts more than once.
- `rules/content/value-add.ts` — add citation/entity signals to the composite.
- `rules/scope.ts` (`RULE_SCOPE`) — register scope for the new rule.
- `rule-references.ts` — add `content/citation-coverage` → `/rules/citation-coverage`
  (`docsUrl`) and a Google policy `ref`.
- `site-classifier.ts` — add to `PSEO_ONLY_RULE_IDS` or the severity-demotion
  map as the calibration pass dictates.
- `schemas/audit-summary.schema.json` + `SCHEMA_VERSION` — only if a new finding
  shape requires it (the new rule uses the standard `RuleResult`, so likely no
  bump; confirm during implementation).

## Calibration & backward compatibility

- **`aeo/citable-facts` is frozen.** A characterization test captures its current
  output across a fixture corpus and asserts byte-identical results after the
  refactor. No corpus re-run needed for the existing rule.
- **`content/citation-coverage` starts dormant-safe.** It enters the engine at
  `warning`/`low` with lenient defaults and appropriate site-type suppression, so
  it cannot swing existing verdicts materially. A follow-up calibration sweep
  (separate doc, like `docs/superpowers/calibration/*`) sets production
  thresholds against the reputable-pSEO corpus before it is allowed to influence
  the headline verdict.
- **`content/value-add`** change is additive and bounded; its existing weighting
  is preserved and the new inputs are introduced behind the same low-confidence
  treatment.

## Testing

- **Characterization test** — `extractRawFacts` / `aeo/citable-facts` output is
  identical before and after the refactor (locks calibration).
- **Extractor unit tests** — fixtures for: a fact-rich page, a fact-poor page,
  entity-masking parity (a state/ZIP must not count), a `.gov` + allowlist
  citation, a `general` external citation, an internal link (excluded), and a
  grounded-claim co-occurrence (stat + citation in one sentence vs. stat and
  citation in different sentences → not grounded).
- **Rule tests** — `content/citation-coverage` fires on the unsourced-claims
  fixture, stays silent on a well-cited page and on a citation-light blog/contact
  page (site-type behavior).
- **Dogfood** — the new rule must not regress pseolint.dev's own `/rules`,
  `/symptoms`, `/tools` pages (extend the existing web dogfood test once the rule
  ships).

## Out of scope (deferred)

- LLM semantic claim verification (Page Value Model part 4).
- The headline 0–100 Page Value Score output (part 3).
- Deepened on-page E-E-A-T author/credential detection (part 2).
- Off-page authority / backlinks / Domain Authority (deliberate non-feature).
- Live-checking that cited URLs resolve (possible future `tech/*` rule).
- A `/rules/citation-coverage` marketing explainer page — authored under the
  separate T7 rule-coverage task once the rule ships.

## Open questions (resolve during planning)

1. Final default for `citationCoverageMinClaims` / `citationCoverageMinAuthoritative`
   — start lenient (4 / 1), tighten via a calibration sweep.
2. Exact starting `citationAllowlist` contents and whether it lives inline or in
   a small data file alongside the entity-mask defaults.
3. Whether `measurements` should *ever* feed `aeo/citable-facts` in a future
   major version (would require recalibration) — left as a deliberate no for now.
