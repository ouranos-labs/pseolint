# pSEO Growth Slice 1b — Symptom Pages Batch 2

> Continuation of `2026-06-06-pseo-growth-slice1-symptom-pages.md`. Same architecture, same guardrails — three more on-positioning symptom entries. Built directly on `main` (no feature branch); parallel authoring via isolated worktree subagents that **return entry objects as text**, which the controller inserts serially into the single `MARKETING_SYMPTOMS` array (the array is the one serialization point — parallel in-file inserts would conflict).

**Goal:** Add three new high-intent diagnostic pages that fill the clearest gaps in the locked positioning ("penalty-risk audit for sites that publish at scale"), each protected by the existing depth + integrity guardrails (`apps/web/src/lib/marketing-symptoms.test.ts`) and sitemap-coverage test.

**Demand-validated 2026-06-06** (spec §"Validation before scaling"): all three primary keywords return rich, established SERPs (Ahrefs / Onely / Search Engine Land / Google Search Central guides), confirming real diagnostic intent.

**Architecture (unchanged):** `/symptoms/[symptom]` route, index, JSON-LD schema, and sitemap are generic over `MARKETING_SYMPTOMS`. Adding a typed entry auto-ships the page. No route/component/sitemap-source changes.

**The contract every new entry must satisfy** (enforced by `marketing-symptoms.test.ts`):
- `oneLiner` ≥ 80 chars; `metaDescription` 50–160 chars (new entries target ≤160, hard ceiling 180); `whatYouSee` ≥ 150
- `likelyCauses`: ≥ 4 items (interface min is 3; author 4 for depth), each `cause` ≥ 10, each `explanation` ≥ 120
- `diagnosticSteps`: ≥ 5 (author 7), each ≥ 40
- `faqs`: ≥ 4 (author 5), each `q` ≥ 10, each `a` ≥ 120
- `caseStudy` ≥ 200; `recoveryTimeline` ≥ 200; `symptomBodyWordCount(entry)` ≥ 500 (author ~1000–1200 for real depth)
- `slug` unique + kebab-case; every `relatedRules` slug ∈ { thin-content, doorway-pattern, near-duplicate, boilerplate-ratio, template-diversity, host-section-divergence }
- **Uniquely written** — no shared phrasing/templates with the existing 8 entries or with each other (file-header contract).

---

## Entry specs

### Entry A — `scaled-content-abuse-penalty`
- **title:** `Scaled content abuse penalty — diagnose mass-produced pages and recover`
- **primaryKeyword:** `scaled content abuse`
- **Angle / intent:** The March 2024 scaled-content-abuse policy made *volume itself* a ranking signal. Operator publishes thousands of templated or AI-generated pages "primarily to manipulate rankings"; enforcement ranges from demotion to full deindexing. Distinct from `manual-action-pure-spam` (that page is about the *manual-action label/reconsideration mechanics*) and from `thin-content-warning-search-console` (single-template thin signal) — **this page is about the policy itself and the volume/AI dimension.**
- **Must cover:** what the policy actually says (mass pages with little added value, regardless of how created incl. AI); why per-page tweaks rarely recover (consolidate instead); the survivor profile (first-hand experience, author credentials, original data, genuine E-E-A-T); algorithmic vs manual paths and their different clocks; do NOT promise snap-back.
- **relatedRules:** `["thin-content", "near-duplicate", "template-diversity", "boilerplate-ratio"]`

### Entry B — `doorway-pages-penalty`
- **title:** `Doorway pages penalty — diagnose and fix gateway-page clusters`
- **primaryKeyword:** `doorway pages penalty`
- **Angle / intent:** Large sets of similar pages created to rank for query/location permutations that funnel users to the same destination. The classic pSEO trap. Distinct from Entry A (scale/AI) and from `manual-action-pure-spam` (doorways are *one* pure-spam trigger; this page diagnoses the doorway pattern specifically and how to consolidate it).
- **Must cover:** the definition (gateway/funnel sets, orphan permutation pages); how Google identifies them (near-identical intent, thin unique value, same destination); fix = consolidate/merge into fewer substantive pages, remove orphan sets, fix internal linking; reconsideration if a manual action attached; the "would each page exist if search didn't?" test.
- **relatedRules:** `["doorway-pattern", "thin-content", "template-diversity", "near-duplicate"]`

### Entry C — `duplicate-google-chose-different-canonical`
- **title:** `"Duplicate, Google chose a different canonical" — diagnose programmatic near-duplicates`
- **primaryKeyword:** `google chose a different canonical than user`
- **Angle / intent:** The exact Google Search Console index-status string. Programmatic templates that differ only by a swapped entity collapse into near-duplicate clusters; Google picks its own canonical and ignores yours. **Honesty requirement (load-bearing):** per Google (Martin Splitt, 2025) this status is *not inherently a penalty* — affected URLs can still be indexed as part of a near-duplicate cluster. Frame it as a **wasted-page / near-duplicate quality signal at scale and a sign the template lacks per-page uniqueness**, NOT as a penalty. Do not fearmonger. This is the pre-penalty / efficiency end of the spectrum and pairs with `new-pages-not-getting-indexed`.
- **Must cover:** what the status means (canonical is a hint, not a rule; ~40 site-wide signals); why templates trigger it (insufficient per-page differentiation); the honest "not a penalty but a symptom" framing; fix = make pages genuinely unique, align all canonical signals (internal links, sitemap, hreflang, redirects), add internal links to the preferred URL; when to instead consolidate/canonicalize on purpose.
- **relatedRules:** `["near-duplicate", "boilerplate-ratio", "template-diversity"]`

---

## Execution

1. **Controller** commits this plan to `main`.
2. **Three parallel authoring subagents** (one per entry), each in an isolated worktree:
   - Reads this plan + the existing `apps/web/src/lib/marketing-symptoms.ts` (for the `MarketingSymptom` interface and the *style/voice* of existing entries — to match tone without copying phrasing).
   - Authors ONE entry to its spec and the depth/integrity contract above.
   - Inserts it into the array **in its own worktree**, runs `cd apps/web && bun run test -- marketing-symptoms` until green, and `bun run typecheck` (worktree may need `bun install` first).
   - **Returns the final entry object as verbatim TypeScript text** in its report (the controller, not the subagent, lands it on `main`).
3. **Controller** inserts all three returned objects into `apps/web/src/lib/marketing-symptoms.ts` on `main`, runs the full suite + typecheck, then commits each entry as its own commit.
4. **Two-stage review** (spec-compliance then code-quality) over the batch, fixes if needed.
5. Full suite green + typecheck clean = done. Three new pages live at `/symptoms/{scaled-content-abuse-penalty,doorway-pages-penalty,duplicate-google-chose-different-canonical}`.

## Done criteria
- `cd apps/web && bun run test` green (depth + integrity guardrails now cover 11 entries; sitemap coverage asserts all 11).
- `cd apps/web && bun run typecheck` clean.
- Three new indexable pages with Article/FAQ/HowTo JSON-LD, present in the sitemap, each uniquely written and on-positioning.

## Out of scope (later slices, unchanged from slice 1)
GSC-live + measurement/kill-criteria; throttled free-tool wedge; full engine-against-built-HTML dogfood CI; aggregate/anonymized data + ToS/consent gate; `/penalty-recovery/[type]` and `/core-update/[date]` route families.
