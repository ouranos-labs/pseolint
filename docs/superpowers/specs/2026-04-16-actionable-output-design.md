# Actionable Output Improvements — Design Spec

> **For agentic workers:** This spec describes finding enrichment, clustering, content analysis, template detection, effort tagging, and formatter upgrades for pseolint.

**Goal:** Transform pseolint's output from a wall of pairwise findings into clustered, contextualized, actionable guidance that tells users what's wrong, what's duplicated, and where to start fixing — across all four output formats.

**Problem:** A 476-page PaperForge audit produces 8,839 findings dominated by O(n^2) pairwise comparisons. Fix strings are generic platitudes. Users get no content breakdown, no effort estimate, no template-aware advice. The signal-to-noise ratio makes the output unusable for large pSEO sites.

---

## Architecture

A new **post-processing enrichment pipeline** runs between rule execution and scoring/formatting. Rules continue to emit raw pairwise findings unchanged. The enrichment layer clusters, analyzes, and annotates them before they reach formatters.

```
Rules → raw findings → enrichFindings() → enriched findings → scoreFromFindings() → formatters
```

This keeps rule implementations simple and isolated. Cross-rule intelligence (template detection, content analysis) lives in one place.

---

## 1. Type Changes

### FindingContext (discriminated union)

```typescript
type FindingContext =
  | {
      type: "cluster";
      clusterSize: number;
      members: string[];
      worstPairs: Array<{
        left: string;
        right: string;
        similarity: number;
      }>;
      similarityRange: [number, number];
    }
  | {
      type: "contentBreakdown";
      sharedBlocks: Array<{ text: string; wordCount: number }>;
      sharedWordCount: number;
      uniqueWordCount: number;
      totalWordCount: number;
    };
```

### FixEffort

```typescript
type FixEffort = "quick" | "moderate" | "structural";
```

### RuleResult additions

Two new optional fields on `RuleResult`:

```typescript
interface RuleResult {
  // ... existing fields unchanged ...
  context?: FindingContext;
  effort?: FixEffort;
}
```

### AuditSummary additions

```typescript
interface AuditSummary {
  // ... existing fields unchanged ...
  templateDetected?: boolean;
  rawFindingCount?: number;  // pre-enrichment count for backward compat
}
```

---

## 2. Finding Enrichment Pipeline

New file: `packages/core/src/enrich-findings.ts`

Pure function signature:

```typescript
function enrichFindings(
  findings: RuleResult[],
  pages: ParsedPage[],
  options?: { templateGenerated?: boolean }
): { findings: RuleResult[]; templateDetected: boolean; rawFindingCount: number }
```

### Step 1: Cluster pairwise findings

**Which rules:** `spam/near-duplicate`, `spam/entity-swap`, `cannibal/keyword-collision`, `cannibal/title-overlap`

**Algorithm:** Union-find over `pageUrl` + `relatedUrls[0]` pairs. Each rule is clustered independently (near-duplicate clusters and keyword-collision clusters are separate).

For each cluster:
- Emit ONE `RuleResult` with `context: { type: "cluster" }` replacing all constituent pair findings
- `clusterSize`: number of unique URLs in the cluster
- `members`: all unique URLs
- `worstPairs`: top 3 pairs sorted by similarity descending
- `similarityRange`: `[min, max]` similarity across all pairs in the cluster
- `severity`: highest severity from any constituent finding
- `message`: "N pages form a near-duplicate cluster (X.X–Y.Y% similar)."
- `pageUrl`: URL of the most-connected member (most pair appearances)
- `relatedUrls`: remaining members

Non-pairwise findings pass through unchanged.

### Step 2: Compute content breakdowns

For cluster findings where `ruleId` is `spam/near-duplicate` or `spam/entity-swap`:
- Pick the 2 most-similar pages from `worstPairs[0]`
- Reuse sentence-level text block extraction from boilerplate-ratio (`split(/[.!?]\s+|\n+/)`, trim, lowercase, filter >20 chars)
- Compute blocks shared between the two pages vs. blocks unique to each
- Attach `contentBreakdown` data to the cluster finding's `fix` string (not as a second context — a finding has one context)
- Format: "Shared: intro (42w), terms (180w), signature (95w). Unique: title only (3w)."

For `content/unique-value` findings:
- Attach a `contentBreakdown` context with the page's shared vs. unique word stats (data already computed by the rule, just needs to be structured)

### Step 3: Detect template generation

Scan enriched findings for the combination:
- `spam/entity-swap` cluster(s) with total affected pages >= 10, **AND**
- (`spam/boilerplate-ratio` findings on >= 50% of audited pages, **OR** `spam/template-diversity` finding exists)

If matched: `templateDetected = true`.

**Config override:** If `options.templateGenerated` is explicitly `true` or `false`, use that value and skip auto-detection.

### Step 4: Rewrite fix strings

After enrichment, regenerate fix strings for enriched findings:

**Cluster findings (template detected):**
> "Your template produces N near-identical pages (X–Y% similar). [Content breakdown]. Add conditional content sections per entity dimension — local regulations, pricing, requirements, or statistics specific to each [STATE/entity]."

**Cluster findings (template NOT detected):**
> "N pages form a near-duplicate cluster (X–Y% similar). [Content breakdown]. Differentiate these pages with unique content specific to each page's topic."

**Per-page findings (template detected):**
- og-completeness: "Add the missing Open Graph tags to your page template: og:title, og:description, og:image."
- canonical: "Add `<link rel=\"canonical\">` to your base template's `<head>`."
- Other per-page rules: append "Consider fixing this in your template for all pages." when >5 pages affected.

**Per-page findings (template NOT detected):**
- Keep existing fix strings unchanged.

### Step 5: Assign effort tags

**Static baseline per rule:**

| Effort | Rules |
|--------|-------|
| `quick` | `tech/og-completeness`, `tech/canonical-consistency`, `tech/canonical-noindex-conflict`, `tech/robots-noindex-conflict`, `tech/hreflang-consistency`, `tech/redirect-chain`, `tech/soft-404`, `tech/sitemap-completeness`, `tech/robots-sitemap-presence`, `schema/json-ld-valid`, `schema/required-fields`, `schema/consistency`, `content/missing-author` |
| `moderate` | `spam/thin-content`, `spam/publication-velocity`, `content/heading-uniqueness`, `content/meta-uniqueness`, `content/eeat-signals`, `links/orphan-pages`, `links/dead-ends`, `links/hub-pages`, `links/link-depth`, `cannibal/url-pattern` |
| `structural` | `spam/near-duplicate`, `spam/entity-swap`, `spam/doorway-pattern`, `spam/boilerplate-ratio`, `spam/template-diversity`, `spam/template-coverage`, `content/unique-value`, `cannibal/keyword-collision`, `cannibal/title-overlap`, `links/cluster-connectivity` |

**Escalation:** If a rule's base effort is `quick` and affected pages > 20 → `moderate`. If base is `moderate` and affected pages > 20 → `structural`. Rules already at `structural` stay `structural`.

"Affected pages" = number of unique `pageUrl` values across findings for that rule (post-clustering, so cluster members count).

---

## 3. Formatter Upgrades

### Transformed Top Issues (all formatters)

Replace the current count-only format with richer per-rule summaries:

**Before:**
```
Top Issues
  1. spam/near-duplicate — 4673 findings
```

**After:**
```
Top Issues
  1. spam/near-duplicate — 3 clusters (47 pages, 85–91% similar). Structural fix.
  2. tech/og-completeness — 10 pages missing tags. Quick fix.
```

**Sort order:** Severity first (critical > error > warning > info), then effort ascending within same severity (quick wins bubble up).

### Cluster rendering

**Console:**
```
  * [spam/near-duplicate] 47 pages form a near-duplicate cluster (85.9-90.6% similar)
    Worst: appliance-repair-arizona <-> auto-repair-florida (90.6%)
    Shared: intro (42w), terms section (180w), signature block (95w). Unique: title only (3w).
    Fix: Your template produces near-identical output. Add conditional content per entity.
    Ref: https://developers.google.com/search/docs/essentials/spam-policies
    [structural]
```

**HTML:** `<details>` / `<summary>` collapsible — summary shows cluster size and similarity range, expand to see full member list and worst pairs.

**Markdown:** Same structure as console with markdown links and inline effort badges `(**structural**)`.

**JSON:** `context` object serialized as-is. Full programmatic access to cluster members, pairs, content breakdowns.

### Content breakdown rendering

**Console/Markdown:** One-line summary: `Shared: 317 of 350 words (intro, terms, signature). Unique: 33 words (title).`

**HTML:** Small horizontal bar showing shared (gray) vs. unique (green) proportion with block labels.

**JSON:** Full `sharedBlocks` array and word counts in the `context` object.

### Effort badges

**Console:** Dim text at end of finding: `[quick fix]`, `[moderate]`, `[structural]`

**HTML:** Colored pill — green (quick), yellow (moderate), red (structural)

**Markdown:** Inline bold: `(**quick fix**)`, `(**moderate**)`, `(**structural**)`

**JSON:** `effort` field on each finding.

### Template-detected banner

When `summary.templateDetected === true`, all formatters add after the score header:

```
Template-generated content detected. Fix suggestions are tailored for template authors.
```

---

## 4. Config & Backward Compatibility

### Config addition

New optional field in `pseolint.config.ts`:

```typescript
export default {
  templateGenerated: true,  // optional, overrides auto-detection
};
```

Added to the Zod schema as `z.boolean().optional()`. Passed through `AuditOptions.templateGenerated`.

### Backward compatibility

- `RuleResult.context`, `RuleResult.effort` are optional — existing consumers unaffected
- `AuditSummary.templateDetected`, `AuditSummary.rawFindingCount` are optional — same
- JSON output gains new fields; no existing fields change shape or semantics
- Scoring is unchanged — cluster findings preserve the highest severity from constituent pairs
- `summary.rawFindingCount` preserves the pre-enrichment count so CI scripts checking raw finding counts still work
- Rule implementations are unchanged — enrichment is a post-processing layer
- CLI flags unchanged — no new flags needed
- Exit code logic unchanged — still score vs. threshold

---

## 5. Testing Strategy

### Unit tests — enrichment pipeline (`enrich-findings.test.ts`)

1. **Union-find clustering** — 5 pairwise findings (A~B, B~C, D~E, A~E) collapse to 1 cluster with 5 members
2. **Independent clusters** — Pairs (A~B, C~D) with no overlap produce 2 separate cluster findings
3. **Worst pairs selection** — Cluster with 10 pairs preserves top 3 by similarity, sorted descending
4. **Similarity range** — `similarityRange` captures [min, max] across all pairs
5. **Cross-rule independence** — near-duplicate and keyword-collision on same pages produce separate clusters
6. **Content breakdown** — 2 pages sharing 3 of 5 text blocks → `sharedBlocks` has 3, `uniqueWordCount` reflects the other 2
7. **Template detection positive** — >=10 entity-swap pages + boilerplate >=50% → `templateDetected = true`
8. **Template detection negative** — 3 entity-swap pairs + no boilerplate → `templateDetected = false`
9. **Template config override** — `templateGenerated: true` → `templateDetected = true` regardless of findings
10. **Effort assignment** — og-completeness on 3 pages → `quick`; on 25 pages → `moderate`
11. **Effort escalation boundary** — 20 pages = no escalation, 21 pages = escalated
12. **Non-pairwise passthrough** — thin-content, orphan-pages get effort tags but no clustering

### Unit tests — fix strings (`fix-strings.test.ts`)

13. **Cluster fix with template** — Contains "template", "conditional sections", cluster size, similarity range, content summary
14. **Cluster fix without template** — Contains "differentiate", no "template" language
15. **Per-page fix with template >5 pages** — Contains "template" mention

### Formatter tests (extend existing)

16. **Console Top Issues** — Each line has cluster count + effort tag, not raw finding count
17. **Console cluster rendering** — Worst pair line + shared content summary present
18. **HTML cluster rendering** — `<details>` element with cluster data
19. **JSON context serialization** — `context` and `effort` fields present
20. **Markdown effort inline** — `(**quick fix**)` format present

### Integration test

21. **PaperForge-shaped fixture** — 20 near-identical pages varying only by entity. Assert: raw pairwise > 100, enriched < 10, clusters contain members, template detected, fix strings reference templates

---

## 6. Files Changed

| File | Action | What |
|------|--------|------|
| `packages/core/src/types.ts` | Modify | Add `FindingContext`, `FixEffort`, new fields on `RuleResult` and `AuditSummary` |
| `packages/core/src/enrich-findings.ts` | Create | Enrichment pipeline: clustering, content analysis, template detection, effort tagging, fix rewriting |
| `packages/core/src/auditor.ts` | Modify | Call `enrichFindings()` after `runRulesOnPages()`, pass `templateGenerated` option, set `rawFindingCount` and `templateDetected` on summary |
| `packages/core/src/formatters/console.ts` | Modify | Transformed Top Issues, cluster rendering, effort badges, template banner |
| `packages/core/src/formatters/html.ts` | Modify | Collapsible clusters, content bar, effort pills, template banner |
| `packages/core/src/formatters/markdown.ts` | Modify | Cluster rendering, effort inline, template banner |
| `packages/core/src/formatters/json.ts` | No change | `context` and `effort` serialize automatically via `JSON.stringify` |
| `packages/cli/src/config.ts` | Modify | Add `templateGenerated` to Zod schema |
| `packages/core/tests/enrich-findings.test.ts` | Create | 12 unit tests for enrichment |
| `packages/core/tests/fix-strings.test.ts` | Create | 3 tests for fix string generation |
| `packages/core/tests/formatters/*.test.ts` | Modify | 5 formatter tests |
| `packages/core/tests/integration/enrichment.test.ts` | Create | 1 integration test with fixture |
| `packages/action/src/index.ts` | Modify | Use enriched Top Issues in PR comment |
