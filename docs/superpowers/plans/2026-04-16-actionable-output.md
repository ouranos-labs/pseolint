# Actionable Output Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform pseolint's raw pairwise findings into clustered, contextualized, effort-tagged actionable guidance across all output formats.

**Architecture:** A new `enrichFindings()` post-processing step runs between rule execution and scoring/formatting. It clusters pairwise findings via union-find, computes content breakdowns, auto-detects template-generated content, rewrites fix strings, and assigns effort tags. Formatters are upgraded to render cluster context, effort badges, and a transformed Top Issues section.

**Tech Stack:** TypeScript, Vitest, existing boilerplate-ratio text block extraction

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/types.ts` | Modify | Add `FindingContext`, `FixEffort`, `similarity` on `RuleResult`; `templateDetected`, `rawFindingCount` on `AuditSummary`; `templateGenerated` on `AuditOptions` |
| `packages/core/src/enrich-findings.ts` | Create | Union-find clustering, content breakdown, template detection, effort tagging, fix string rewriting |
| `packages/core/src/auditor.ts` | Modify | Call `enrichFindings()` after rules, before scoring |
| `packages/core/src/rules/spam/near-duplicate.ts` | Modify | Add `similarity` and `pageUrl`/`relatedUrls` to findings |
| `packages/core/src/rules/spam/entity-swap.ts` | Modify | Add `similarity` and `pageUrl`/`relatedUrls` to findings |
| `packages/core/src/rules/cannibal/keyword-collision.ts` | Modify | Add `similarity` to findings (shared count / 10) |
| `packages/core/src/rules/cannibal/title-overlap.ts` | Modify | Add `similarity` to findings |
| `packages/core/src/formatters/console.ts` | Modify | Transformed Top Issues, cluster rendering, effort badges, template banner |
| `packages/core/src/formatters/html.ts` | Modify | Collapsible clusters, effort pills, template banner |
| `packages/core/src/formatters/markdown.ts` | Modify | Cluster rendering, effort inline, template banner |
| `packages/core/src/index.ts` | Modify | Export `enrichFindings` |
| `packages/cli/src/config.ts` | Modify | Add `templateGenerated` to Zod schema |
| `packages/action/src/index.ts` | Modify | Use enriched Top Issues in PR comment |
| `packages/core/tests/enrich-findings.test.ts` | Create | 12 enrichment unit tests |
| `packages/core/tests/fix-strings.test.ts` | Create | 3 fix string tests |
| `packages/core/tests/formatters/formatters.test.ts` | Modify | 5 new formatter tests |

---

### Task 1: Add new types to `types.ts`

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add `FindingContext` discriminated union, `FixEffort` type, and new fields**

Add after the existing `RuleResult` interface (after line 29 of `packages/core/src/types.ts`):

```typescript
// In types.ts, add these new types before the RuleResult interface:

export type FixEffort = "quick" | "moderate" | "structural";

export type FindingContext =
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

Then modify `RuleResult` to add three new optional fields:

```typescript
export interface RuleResult {
  ruleId: string;
  severity: Severity;
  message: string;
  fix?: string;
  ref?: string;
  pageUrl?: string;
  relatedUrls?: string[];
  group?: string;
  /** Numeric similarity score (0-1) for pairwise rules. Used by enrichment clustering. */
  similarity?: number;
  /** Structured context attached by the enrichment pipeline. */
  context?: FindingContext;
  /** Fix effort level assigned by the enrichment pipeline. */
  effort?: FixEffort;
}
```

Then modify `AuditSummary` to add two new optional fields:

```typescript
export interface AuditSummary {
  score: number;
  categoryScores: CategoryScores;
  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  pageCount: number;
  findings: RuleResult[];
  /** True when the enrichment pipeline detects template-generated content. */
  templateDetected?: boolean;
  /** Pre-enrichment finding count, for backward compatibility with CI scripts. */
  rawFindingCount?: number;
}
```

Then add `templateGenerated` to `AuditOptions`:

```typescript
export interface AuditOptions {
  // ... all existing fields ...
  /** Override template auto-detection. When set, skips heuristic detection. */
  templateGenerated?: boolean;
}
```

- [ ] **Step 2: Verify the project builds**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors (all new fields are optional, no consumers break)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat: add FindingContext, FixEffort types and enrichment fields to RuleResult/AuditSummary"
```

---

### Task 2: Add `similarity` field to pairwise rules

**Files:**
- Modify: `packages/core/src/rules/spam/near-duplicate.ts`
- Modify: `packages/core/src/rules/spam/entity-swap.ts`
- Modify: `packages/core/src/rules/cannibal/title-overlap.ts`
- Modify: `packages/core/src/rules/cannibal/keyword-collision.ts`

- [ ] **Step 1: Add `similarity`, `pageUrl`, `relatedUrls` to near-duplicate findings**

In `packages/core/src/rules/spam/near-duplicate.ts`, modify the `findings.push()` call (line 23-28) to include the new fields:

```typescript
        findings.push({
          ruleId: "spam/near-duplicate",
          severity: "critical",
          message: `${pages[i].url} and ${pages[j].url} are near-duplicates (${(similarity * 100).toFixed(1)}% similar).`,
          fix: "Differentiate these pages with unique content. Add page-specific details, data, examples, or analysis that the other page doesn't have.",
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          similarity,
        });
```

- [ ] **Step 2: Add `similarity`, `pageUrl`, `relatedUrls` to entity-swap findings**

In `packages/core/src/rules/spam/entity-swap.ts`, modify the `findings.push()` call (line 18-23) to include the new fields:

```typescript
        findings.push({
          ruleId: "spam/entity-swap",
          severity: "critical",
          message: `${pages[i].url} and ${pages[j].url} look structurally identical after entity masking.`,
          fix: "These pages are identical after masking entity names. Add entity-specific content: local regulations, statistics, fees, or requirements unique to each entity.",
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          similarity,
        });
```

- [ ] **Step 3: Add `similarity` to title-overlap findings**

In `packages/core/src/rules/cannibal/title-overlap.ts`, modify the `findings.push()` call (line 40-47). The `similarity` variable already exists:

```typescript
        findings.push({
          ruleId: "cannibal/title-overlap",
          severity: "warning",
          message: `${pages[i].url} and ${pages[j].url} have overlapping titles after entity masking (${(similarity * 100).toFixed(1)}% Jaccard similarity).`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          fix: `Differentiate page titles by including unique, page-specific keywords or angles.`,
          similarity,
        });
```

- [ ] **Step 4: Add `similarity` to keyword-collision findings**

In `packages/core/src/rules/cannibal/keyword-collision.ts`, modify the `findings.push()` call (line 17-24). Compute similarity as shared/10:

```typescript
      if (shared.length >= minShared) {
        findings.push({
          ruleId: "cannibal/keyword-collision",
          severity: "warning",
          message: `${pages[i].url} and ${pages[j].url} share ${shared.length} of their top 10 keywords: ${shared.join(", ")}.`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          fix: `These pages target the same keywords. Consolidate them into one page or differentiate their content focus.`,
          similarity: shared.length / 10,
        });
      }
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests pass (new fields are optional, no assertion breaks)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rules/spam/near-duplicate.ts packages/core/src/rules/spam/entity-swap.ts packages/core/src/rules/cannibal/title-overlap.ts packages/core/src/rules/cannibal/keyword-collision.ts
git commit -m "feat: add similarity field to pairwise rule findings for enrichment clustering"
```

---

### Task 3: Create enrichment pipeline — union-find clustering

**Files:**
- Create: `packages/core/src/enrich-findings.ts`
- Create: `packages/core/tests/enrich-findings.test.ts`

- [ ] **Step 1: Write failing tests for union-find clustering**

Create `packages/core/tests/enrich-findings.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { enrichFindings } from "../src/enrich-findings.js";
import type { RuleResult, ParsedPage } from "../src/types.js";

function makeFinding(ruleId: string, pageUrl: string, relatedUrl: string, similarity: number): RuleResult {
  return {
    ruleId,
    severity: "critical",
    message: `${pageUrl} and ${relatedUrl} are near-duplicates.`,
    pageUrl,
    relatedUrls: [relatedUrl],
    similarity,
  };
}

function makePage(url: string, content: string = "default content"): ParsedPage {
  return {
    url,
    title: url,
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: content,
    html: `<html><body>${content}</body></html>`,
  };
}

describe("enrichFindings — clustering", () => {
  it("collapses transitive pairwise findings into one cluster", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
      makeFinding("spam/near-duplicate", "https://a.com/2", "https://a.com/3", 0.88),
      makeFinding("spam/near-duplicate", "https://a.com/3", "https://a.com/4", 0.86),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2"), makePage("https://a.com/3"), makePage("https://a.com/4")];

    const result = enrichFindings(findings, pages);
    const clusters = result.findings.filter((f) => f.context?.type === "cluster");
    expect(clusters).toHaveLength(1);
    expect(clusters[0].context!.type).toBe("cluster");
    if (clusters[0].context!.type === "cluster") {
      expect(clusters[0].context!.clusterSize).toBe(4);
      expect(clusters[0].context!.members).toHaveLength(4);
    }
  });

  it("produces independent clusters for disconnected pairs", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
      makeFinding("spam/near-duplicate", "https://a.com/3", "https://a.com/4", 0.87),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2"), makePage("https://a.com/3"), makePage("https://a.com/4")];

    const result = enrichFindings(findings, pages);
    const clusters = result.findings.filter((f) => f.context?.type === "cluster");
    expect(clusters).toHaveLength(2);
  });

  it("keeps top 3 worst pairs sorted by similarity descending", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.86),
      makeFinding("spam/near-duplicate", "https://a.com/2", "https://a.com/3", 0.91),
      makeFinding("spam/near-duplicate", "https://a.com/3", "https://a.com/4", 0.88),
      makeFinding("spam/near-duplicate", "https://a.com/4", "https://a.com/5", 0.93),
    ];
    const pages = ["1", "2", "3", "4", "5"].map((n) => makePage(`https://a.com/${n}`));

    const result = enrichFindings(findings, pages);
    const cluster = result.findings.find((f) => f.context?.type === "cluster");
    expect(cluster).toBeDefined();
    if (cluster?.context?.type === "cluster") {
      expect(cluster.context.worstPairs).toHaveLength(3);
      expect(cluster.context.worstPairs[0].similarity).toBe(0.93);
      expect(cluster.context.worstPairs[1].similarity).toBe(0.91);
      expect(cluster.context.worstPairs[2].similarity).toBe(0.88);
    }
  });

  it("computes correct similarity range", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.86),
      makeFinding("spam/near-duplicate", "https://a.com/2", "https://a.com/3", 0.93),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2"), makePage("https://a.com/3")];

    const result = enrichFindings(findings, pages);
    const cluster = result.findings.find((f) => f.context?.type === "cluster");
    if (cluster?.context?.type === "cluster") {
      expect(cluster.context.similarityRange).toEqual([0.86, 0.93]);
    }
  });

  it("clusters each rule independently", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
      makeFinding("cannibal/keyword-collision", "https://a.com/1", "https://a.com/2", 0.80),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2")];

    const result = enrichFindings(findings, pages);
    const clusters = result.findings.filter((f) => f.context?.type === "cluster");
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.ruleId).sort()).toEqual(["cannibal/keyword-collision", "spam/near-duplicate"]);
  });

  it("passes through non-pairwise findings unchanged (except effort tag)", () => {
    const thinFinding: RuleResult = {
      ruleId: "spam/thin-content",
      severity: "error",
      message: "Page has thin content.",
      pageUrl: "https://a.com/1",
    };
    const pages = [makePage("https://a.com/1")];

    const result = enrichFindings([thinFinding], pages);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("spam/thin-content");
    expect(result.findings[0].context).toBeUndefined();
    expect(result.findings[0].effort).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run tests/enrich-findings.test.ts`
Expected: FAIL — `enrichFindings` does not exist

- [ ] **Step 3: Implement union-find clustering in `enrich-findings.ts`**

Create `packages/core/src/enrich-findings.ts`:

```typescript
import type { FindingContext, FixEffort, ParsedPage, RuleResult, Severity } from "./types.js";

const PAIRWISE_RULES = new Set([
  "spam/near-duplicate",
  "spam/entity-swap",
  "cannibal/keyword-collision",
  "cannibal/title-overlap",
]);

// --- Union-Find ---

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  components(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(key);
    }
    return groups;
  }
}

// --- Effort assignment ---

const BASE_EFFORT: Record<string, FixEffort> = {
  "tech/og-completeness": "quick",
  "tech/canonical-consistency": "quick",
  "tech/canonical-noindex-conflict": "quick",
  "tech/robots-noindex-conflict": "quick",
  "tech/hreflang-consistency": "quick",
  "tech/redirect-chain": "quick",
  "tech/soft-404": "quick",
  "tech/sitemap-completeness": "quick",
  "tech/robots-sitemap-presence": "quick",
  "schema/json-ld-valid": "quick",
  "schema/required-fields": "quick",
  "schema/consistency": "quick",
  "content/missing-author": "quick",
  "spam/thin-content": "moderate",
  "spam/publication-velocity": "moderate",
  "content/heading-uniqueness": "moderate",
  "content/meta-uniqueness": "moderate",
  "content/eeat-signals": "moderate",
  "links/orphan-pages": "moderate",
  "links/dead-ends": "moderate",
  "links/hub-pages": "moderate",
  "links/link-depth": "moderate",
  "cannibal/url-pattern": "moderate",
  "spam/near-duplicate": "structural",
  "spam/entity-swap": "structural",
  "spam/doorway-pattern": "structural",
  "spam/boilerplate-ratio": "structural",
  "spam/template-diversity": "structural",
  "spam/template-coverage": "structural",
  "content/unique-value": "structural",
  "cannibal/keyword-collision": "structural",
  "cannibal/title-overlap": "structural",
  "links/cluster-connectivity": "structural",
};

const EFFORT_ORDER: FixEffort[] = ["quick", "moderate", "structural"];
const ESCALATION_THRESHOLD = 20;

function escalateEffort(base: FixEffort, affectedPages: number): FixEffort {
  if (affectedPages <= ESCALATION_THRESHOLD) return base;
  const idx = EFFORT_ORDER.indexOf(base);
  return idx < EFFORT_ORDER.length - 1 ? EFFORT_ORDER[idx + 1] : base;
}

// --- Severity comparison ---

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

// --- Content breakdown ---

function extractTextBlocks(text: string): string[] {
  return text
    .split(/[.!?]\s+|\n+/)
    .map((block) => block.trim().toLowerCase())
    .filter((block) => block.length > 20);
}

function computeContentBreakdown(
  contentA: string,
  contentB: string
): { sharedBlocks: Array<{ text: string; wordCount: number }>; sharedWordCount: number; uniqueWordCount: number; totalWordCount: number } {
  const blocksA = extractTextBlocks(contentA);
  const blocksB = new Set(extractTextBlocks(contentB));

  const shared: Array<{ text: string; wordCount: number }> = [];
  let sharedWordCount = 0;
  let totalWordCount = 0;

  for (const block of blocksA) {
    const wc = block.split(/\s+/).length;
    totalWordCount += wc;
    if (blocksB.has(block)) {
      shared.push({ text: block.length > 50 ? block.slice(0, 50) + "..." : block, wordCount: wc });
      sharedWordCount += wc;
    }
  }

  return {
    sharedBlocks: shared.slice(0, 5), // cap at 5 most representative
    sharedWordCount,
    uniqueWordCount: totalWordCount - sharedWordCount,
    totalWordCount,
  };
}

// --- Template detection ---

function detectTemplate(
  findings: RuleResult[],
  pageCount: number,
  override?: boolean
): boolean {
  if (override !== undefined) return override;

  // Check entity-swap cluster with >= 10 affected pages
  const entitySwapPages = new Set<string>();
  for (const f of findings) {
    if (f.ruleId === "spam/entity-swap") {
      if (f.pageUrl) entitySwapPages.add(f.pageUrl);
      if (f.relatedUrls) {
        for (const u of f.relatedUrls) entitySwapPages.add(u);
      }
      if (f.context?.type === "cluster") {
        for (const m of f.context.members) entitySwapPages.add(m);
      }
    }
  }
  if (entitySwapPages.size < 10) return false;

  // Check boilerplate on >= 50% of pages OR template-diversity fired
  const boilerplatePages = new Set<string>();
  let templateDiversityFired = false;
  for (const f of findings) {
    if (f.ruleId === "spam/boilerplate-ratio" && f.pageUrl) {
      boilerplatePages.add(f.pageUrl);
    }
    if (f.ruleId === "spam/template-diversity") {
      templateDiversityFired = true;
    }
  }

  return boilerplatePages.size >= pageCount * 0.5 || templateDiversityFired;
}

// --- Fix string rewriting ---

function formatSimilarityRange(range: [number, number]): string {
  return `${(range[0] * 100).toFixed(1)}–${(range[1] * 100).toFixed(1)}%`;
}

function formatContentSummary(
  breakdown: { sharedBlocks: Array<{ text: string; wordCount: number }>; sharedWordCount: number; uniqueWordCount: number; totalWordCount: number }
): string {
  if (breakdown.sharedBlocks.length === 0) return "";
  const blockDescs = breakdown.sharedBlocks
    .slice(0, 3)
    .map((b) => `${b.text.split(/\s+/).slice(0, 3).join(" ")}... (${b.wordCount}w)`)
    .join(", ");
  return `Shared: ${blockDescs}. Unique: ${breakdown.uniqueWordCount}w of ${breakdown.totalWordCount}w.`;
}

function rewriteClusterFix(
  ruleId: string,
  clusterSize: number,
  similarityRange: [number, number],
  contentSummary: string,
  templateDetected: boolean
): string {
  const rangeStr = formatSimilarityRange(similarityRange);

  if (templateDetected) {
    const base = `Your template produces ${clusterSize} near-identical pages (${rangeStr} similar).`;
    const content = contentSummary ? ` ${contentSummary}` : "";
    if (ruleId === "spam/entity-swap") {
      return `${base}${content} Add conditional content sections per entity dimension — local regulations, pricing, requirements, or statistics specific to each entity.`;
    }
    if (ruleId === "cannibal/keyword-collision" || ruleId === "cannibal/title-overlap") {
      return `${base}${content} Differentiate each page's keyword focus and title to target distinct search intents.`;
    }
    return `${base}${content} Add conditional content sections per entity dimension — local regulations, pricing, requirements, or statistics specific to each entity.`;
  }

  const base = `${clusterSize} pages form a near-duplicate cluster (${rangeStr} similar).`;
  const content = contentSummary ? ` ${contentSummary}` : "";
  if (ruleId === "cannibal/keyword-collision" || ruleId === "cannibal/title-overlap") {
    return `${base}${content} Differentiate each page's keyword focus and title to target distinct search intents.`;
  }
  return `${base}${content} Differentiate these pages with unique content specific to each page's topic.`;
}

function rewritePerPageFix(finding: RuleResult, templateDetected: boolean, rulePageCount: number): string {
  if (!templateDetected || !finding.fix) return finding.fix ?? "";

  // For template sites with many affected pages, suggest template-level fixes
  if (rulePageCount > 5) {
    if (finding.ruleId === "tech/og-completeness") {
      return "Add the missing Open Graph tags to your page template: og:title, og:description, og:image.";
    }
    if (finding.ruleId === "tech/canonical-consistency") {
      return 'Add <link rel="canonical"> to your base template\'s <head>.';
    }
    if (finding.ruleId === "content/missing-author") {
      return 'Add author attribution to your base template: <meta name="author"> or JSON-LD author field.';
    }
    // Generic template suffix for other rules
    return `${finding.fix} Consider fixing this in your template for all pages.`;
  }

  return finding.fix;
}

// --- Main enrichment function ---

export function enrichFindings(
  findings: RuleResult[],
  pages: ParsedPage[],
  options?: { templateGenerated?: boolean }
): { findings: RuleResult[]; templateDetected: boolean; rawFindingCount: number } {
  const rawFindingCount = findings.length;
  const pageMap = new Map<string, ParsedPage>();
  for (const p of pages) pageMap.set(p.url, p);

  // Step 1: Separate pairwise vs non-pairwise findings
  const pairwiseByRule = new Map<string, RuleResult[]>();
  const nonPairwise: RuleResult[] = [];

  for (const f of findings) {
    if (PAIRWISE_RULES.has(f.ruleId) && f.pageUrl && f.relatedUrls && f.relatedUrls.length > 0) {
      if (!pairwiseByRule.has(f.ruleId)) pairwiseByRule.set(f.ruleId, []);
      pairwiseByRule.get(f.ruleId)!.push(f);
    } else {
      nonPairwise.push(f);
    }
  }

  // Step 2: Cluster pairwise findings per rule
  const clusteredFindings: RuleResult[] = [];

  for (const [ruleId, rulePairs] of pairwiseByRule) {
    const uf = new UnionFind();
    const pairData: Array<{ left: string; right: string; similarity: number; severity: Severity }> = [];

    for (const f of rulePairs) {
      const left = f.pageUrl!;
      const right = f.relatedUrls![0];
      uf.union(left, right);
      pairData.push({
        left,
        right,
        similarity: f.similarity ?? 0,
        severity: f.severity,
      });
    }

    const components = uf.components();

    for (const [, members] of components) {
      // Find pairs belonging to this cluster
      const memberSet = new Set(members);
      const clusterPairs = pairData.filter((p) => memberSet.has(p.left) && memberSet.has(p.right));

      // Compute cluster metadata
      const similarities = clusterPairs.map((p) => p.similarity);
      const sortedPairs = [...clusterPairs].sort((a, b) => b.similarity - a.similarity);
      const worstPairs = sortedPairs.slice(0, 3).map((p) => ({
        left: p.left,
        right: p.right,
        similarity: p.similarity,
      }));
      const similarityRange: [number, number] = [
        Math.min(...similarities),
        Math.max(...similarities),
      ];
      const highestSeverity = clusterPairs.reduce<Severity>(
        (acc, p) => higherSeverity(acc, p.severity),
        "info"
      );

      // Content breakdown for near-duplicate and entity-swap clusters
      let contentSummary = "";
      if (
        (ruleId === "spam/near-duplicate" || ruleId === "spam/entity-swap") &&
        worstPairs.length > 0
      ) {
        const pageA = pageMap.get(worstPairs[0].left);
        const pageB = pageMap.get(worstPairs[0].right);
        if (pageA && pageB) {
          const breakdown = computeContentBreakdown(pageA.contentText, pageB.contentText);
          contentSummary = formatContentSummary(breakdown);
        }
      }

      // Build cluster finding (fix string rewritten later after template detection)
      const rangeStr = formatSimilarityRange(similarityRange);
      clusteredFindings.push({
        ruleId,
        severity: highestSeverity,
        message: `${members.length} pages form a near-duplicate cluster (${rangeStr} similar).`,
        pageUrl: members[0],
        relatedUrls: members.slice(1),
        context: {
          type: "cluster",
          clusterSize: members.length,
          members,
          worstPairs,
          similarityRange,
        },
        // Temporarily store content summary in fix; will be rewritten below
        fix: contentSummary,
      });
    }
  }

  // Step 3: Merge clustered + non-pairwise
  const allEnriched = [...clusteredFindings, ...nonPairwise];

  // Step 4: Detect template generation
  const templateDetected = detectTemplate(allEnriched, pages.length, options?.templateGenerated);

  // Step 5: Rewrite fix strings
  // Count pages per rule for effort escalation and template fix rewriting
  const pagesPerRule = new Map<string, Set<string>>();
  for (const f of allEnriched) {
    if (!pagesPerRule.has(f.ruleId)) pagesPerRule.set(f.ruleId, new Set());
    const rulePages = pagesPerRule.get(f.ruleId)!;
    if (f.pageUrl) rulePages.add(f.pageUrl);
    if (f.relatedUrls) {
      for (const u of f.relatedUrls) rulePages.add(u);
    }
    if (f.context?.type === "cluster") {
      for (const m of f.context.members) rulePages.add(m);
    }
  }

  for (const f of allEnriched) {
    const rulePageCount = pagesPerRule.get(f.ruleId)?.size ?? 0;

    if (f.context?.type === "cluster") {
      const contentSummary = f.fix ?? ""; // stored temporarily above
      f.fix = rewriteClusterFix(
        f.ruleId,
        f.context.clusterSize,
        f.context.similarityRange,
        contentSummary,
        templateDetected
      );
    } else {
      f.fix = rewritePerPageFix(f, templateDetected, rulePageCount);
    }

    // Assign effort
    const base = BASE_EFFORT[f.ruleId] ?? "moderate";
    f.effort = escalateEffort(base, rulePageCount);
  }

  return { findings: allEnriched, templateDetected, rawFindingCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/enrich-findings.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/enrich-findings.ts packages/core/tests/enrich-findings.test.ts
git commit -m "feat: add enrichment pipeline with union-find clustering, content breakdown, template detection, and effort tagging"
```

---

### Task 4: Add template detection and effort assignment tests

**Files:**
- Modify: `packages/core/tests/enrich-findings.test.ts`

- [ ] **Step 1: Write template detection and effort tests**

Append to `packages/core/tests/enrich-findings.test.ts`:

```typescript
describe("enrichFindings — template detection", () => {
  it("detects template when entity-swap >= 10 pages and template-diversity fires", () => {
    const findings: RuleResult[] = [];
    // 10 entity-swap pairs covering 11 unique pages
    for (let i = 0; i < 10; i++) {
      findings.push(makeFinding("spam/entity-swap", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.96));
    }
    // template-diversity finding
    findings.push({
      ruleId: "spam/template-diversity",
      severity: "warning",
      message: "Low template diversity.",
    });

    const pages = Array.from({ length: 11 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    expect(result.templateDetected).toBe(true);
  });

  it("does not detect template with only 3 entity-swap pairs", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/entity-swap", "https://a.com/1", "https://a.com/2", 0.96),
      makeFinding("spam/entity-swap", "https://a.com/3", "https://a.com/4", 0.97),
      makeFinding("spam/entity-swap", "https://a.com/5", "https://a.com/6", 0.95),
    ];
    const pages = Array.from({ length: 6 }, (_, i) => makePage(`https://a.com/${i + 1}`));
    const result = enrichFindings(findings, pages);
    expect(result.templateDetected).toBe(false);
  });

  it("respects templateGenerated config override", () => {
    const findings: RuleResult[] = [
      { ruleId: "tech/og-completeness", severity: "warning", message: "Missing og tags.", pageUrl: "https://a.com/1" },
    ];
    const pages = [makePage("https://a.com/1")];
    const result = enrichFindings(findings, pages, { templateGenerated: true });
    expect(result.templateDetected).toBe(true);
  });
});

describe("enrichFindings — effort assignment", () => {
  it("assigns quick effort to og-completeness with few pages", () => {
    const findings: RuleResult[] = [
      { ruleId: "tech/og-completeness", severity: "warning", message: "Missing.", pageUrl: "https://a.com/1" },
      { ruleId: "tech/og-completeness", severity: "warning", message: "Missing.", pageUrl: "https://a.com/2" },
      { ruleId: "tech/og-completeness", severity: "warning", message: "Missing.", pageUrl: "https://a.com/3" },
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2"), makePage("https://a.com/3")];
    const result = enrichFindings(findings, pages);
    expect(result.findings.every((f) => f.effort === "quick")).toBe(true);
  });

  it("escalates quick to moderate when > 20 pages affected", () => {
    const findings: RuleResult[] = Array.from({ length: 21 }, (_, i) => ({
      ruleId: "tech/og-completeness",
      severity: "warning" as const,
      message: "Missing.",
      pageUrl: `https://a.com/${i}`,
    }));
    const pages = Array.from({ length: 21 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    expect(result.findings[0].effort).toBe("moderate");
  });

  it("does not escalate at exactly 20 pages", () => {
    const findings: RuleResult[] = Array.from({ length: 20 }, (_, i) => ({
      ruleId: "tech/og-completeness",
      severity: "warning" as const,
      message: "Missing.",
      pageUrl: `https://a.com/${i}`,
    }));
    const pages = Array.from({ length: 20 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    expect(result.findings[0].effort).toBe("quick");
  });

  it("keeps structural rules at structural regardless of count", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2")];
    const result = enrichFindings(findings, pages);
    const cluster = result.findings.find((f) => f.context?.type === "cluster");
    expect(cluster?.effort).toBe("structural");
  });
});

describe("enrichFindings — rawFindingCount", () => {
  it("preserves the pre-enrichment finding count", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
      makeFinding("spam/near-duplicate", "https://a.com/2", "https://a.com/3", 0.88),
      makeFinding("spam/near-duplicate", "https://a.com/3", "https://a.com/4", 0.86),
    ];
    const pages = ["1", "2", "3", "4"].map((n) => makePage(`https://a.com/${n}`));
    const result = enrichFindings(findings, pages);
    expect(result.rawFindingCount).toBe(3);
    expect(result.findings.length).toBe(1); // clustered into 1
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/enrich-findings.test.ts`
Expected: All 12 tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/enrich-findings.test.ts
git commit -m "test: add template detection, effort assignment, and rawFindingCount tests"
```

---

### Task 5: Add fix string tests

**Files:**
- Create: `packages/core/tests/fix-strings.test.ts`

- [ ] **Step 1: Write fix string tests**

Create `packages/core/tests/fix-strings.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { enrichFindings } from "../src/enrich-findings.js";
import type { RuleResult, ParsedPage } from "../src/types.js";

function makeFinding(ruleId: string, pageUrl: string, relatedUrl: string, similarity: number): RuleResult {
  return {
    ruleId,
    severity: "critical",
    message: `${pageUrl} and ${relatedUrl} are near-duplicates.`,
    pageUrl,
    relatedUrls: [relatedUrl],
    similarity,
  };
}

function makePage(url: string, content: string = "default content for testing purposes that is long enough"): ParsedPage {
  return {
    url,
    title: url,
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: content,
    html: `<html><body>${content}</body></html>`,
  };
}

describe("fix strings — template-aware", () => {
  it("includes 'template' language when template detected", () => {
    const findings: RuleResult[] = [];
    for (let i = 0; i < 10; i++) {
      findings.push(makeFinding("spam/entity-swap", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.96));
    }
    findings.push({
      ruleId: "spam/template-diversity",
      severity: "warning",
      message: "Low diversity.",
    });
    // Also add near-duplicate pairs for content summary
    for (let i = 0; i < 5; i++) {
      findings.push(makeFinding("spam/near-duplicate", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.90));
    }

    const pages = Array.from({ length: 11 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const ndCluster = result.findings.find((f) => f.ruleId === "spam/near-duplicate" && f.context?.type === "cluster");
    expect(ndCluster?.fix).toContain("template");
    expect(ndCluster?.fix).toContain("conditional");
  });

  it("does not include 'template' language when template not detected", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2")];
    const result = enrichFindings(findings, pages);
    const cluster = result.findings.find((f) => f.context?.type === "cluster");
    expect(cluster?.fix).not.toContain("template");
    expect(cluster?.fix).toContain("Differentiate");
  });

  it("rewrites per-page fix for template sites with > 5 affected pages", () => {
    const findings: RuleResult[] = Array.from({ length: 6 }, (_, i) => ({
      ruleId: "tech/og-completeness" as const,
      severity: "warning" as const,
      message: "Missing og tags.",
      pageUrl: `https://a.com/${i}`,
      fix: "Add the missing Open Graph tags: og:title, og:description, og:image.",
    }));

    const pages = Array.from({ length: 6 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages, { templateGenerated: true });
    expect(result.findings[0].fix).toContain("template");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/fix-strings.test.ts`
Expected: All 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/fix-strings.test.ts
git commit -m "test: add fix string template-awareness tests"
```

---

### Task 6: Integrate enrichment into `auditor.ts`

**Files:**
- Modify: `packages/core/src/auditor.ts:735-869`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add enrichment import and call in `auditSource`**

In `packages/core/src/auditor.ts`, add the import at the top (after line 39):

```typescript
import { enrichFindings } from "./enrich-findings.js";
```

Then modify the `auditSource` function. Find the block at lines 858-869 (the scoring and return block):

Replace:
```typescript
  const { score, categoryScores } = scoreFromFindings(allFindings);
  const auditedPageCount = Object.values(groupPageCounts).reduce((a, b) => a + b, 0);

  return {
    score,
    categoryScores,
    groupScores: options?.pageGroups ? groupScores : undefined,
    groupPageCounts: options?.pageGroups ? groupPageCounts : undefined,
    pageCount: auditedPageCount || parsedPages.length,
    findings: allFindings
  };
```

With:
```typescript
  // Enrich findings: cluster pairwise, detect templates, assign effort
  const enriched = enrichFindings(allFindings, parsedPages, {
    templateGenerated: options?.templateGenerated,
  });

  const { score, categoryScores } = scoreFromFindings(enriched.findings);
  const auditedPageCount = Object.values(groupPageCounts).reduce((a, b) => a + b, 0);

  return {
    score,
    categoryScores,
    groupScores: options?.pageGroups ? groupScores : undefined,
    groupPageCounts: options?.pageGroups ? groupPageCounts : undefined,
    pageCount: auditedPageCount || parsedPages.length,
    findings: enriched.findings,
    templateDetected: enriched.templateDetected,
    rawFindingCount: enriched.rawFindingCount,
  };
```

- [ ] **Step 2: Export enrichFindings from index.ts**

In `packages/core/src/index.ts`, add after the last export:

```typescript
export * from "./enrich-findings.js";
```

- [ ] **Step 3: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/src/index.ts
git commit -m "feat: integrate enrichment pipeline into auditSource"
```

---

### Task 7: Add `templateGenerated` to CLI config

**Files:**
- Modify: `packages/cli/src/config.ts:26-41`

- [ ] **Step 1: Add templateGenerated to the Zod schema**

In `packages/cli/src/config.ts`, modify the `auditOptionsSchema` (line 26-41) to add `templateGenerated`:

```typescript
const auditOptionsSchema = z.object({
  rules: rulesSchema,
  concurrency: z.number().optional(),
  timeout: z.number().optional(),
  sampleSize: z.number().optional(),
  ignore: z.array(z.string()).optional(),
  pageGroups: z.record(z.string(), z.object({
    match: z.union([z.string(), z.array(z.string())]),
    rules: z.array(z.string()).optional(),
    overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })).optional(),
  render: z.object({
    browserWsEndpoint: z.string().optional(),
  }).optional(),
  crawlDiscovery: z.boolean().optional(),
  templateGenerated: z.boolean().optional(),
});
```

- [ ] **Step 2: Verify the project builds**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/config.ts
git commit -m "feat: add templateGenerated option to CLI config schema"
```

---

### Task 8: Upgrade console formatter

**Files:**
- Modify: `packages/core/src/formatters/console.ts`

- [ ] **Step 1: Rewrite the console formatter to support enriched output**

Replace the full content of `packages/core/src/formatters/console.ts`:

```typescript
import type { AuditSummary, FindingContext, FixEffort, RuleResult, Severity } from "../types.js";

// ANSI escape codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED_BRIGHT = "\x1b[91m";
const ORANGE = "\x1b[38;5;208m";

function scoreColor(score: number): string {
  if (score <= 20) return GREEN;
  if (score <= 40) return YELLOW;
  if (score <= 60) return ORANGE;
  if (score <= 80) return RED;
  return RED + BOLD;
}

function scoreLabel(score: number): string {
  if (score <= 20) return "Safe";
  if (score <= 40) return "Caution";
  if (score <= 60) return "Risky";
  if (score <= 80) return "Dangerous";
  return "Critical";
}

function bar(score: number, width: number = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return RED + BOLD;
    case "error":
      return RED_BRIGHT;
    case "warning":
      return YELLOW;
    case "info":
      return DIM;
  }
}

function effortLabel(effort?: FixEffort): string {
  if (!effort) return "";
  switch (effort) {
    case "quick":
      return `${GREEN}[quick fix]${RESET}`;
    case "moderate":
      return `${YELLOW}[moderate]${RESET}`;
    case "structural":
      return `${RED}[structural]${RESET}`;
  }
}

function effortLabelPlain(effort?: FixEffort): string {
  if (!effort) return "";
  switch (effort) {
    case "quick":
      return "Quick fix.";
    case "moderate":
      return "Moderate fix.";
    case "structural":
      return "Structural fix.";
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

export interface ConsoleFormatOptions {
  noColor?: boolean;
}

export function formatConsole(summary: AuditSummary, options?: ConsoleFormatOptions): string {
  const strip = options?.noColor ?? false;
  const lines: string[] = [];

  // Score header
  const color = scoreColor(summary.score);
  const label = scoreLabel(summary.score);
  lines.push(
    `${BOLD}SpamBrain Risk Score:${RESET} ${color}${summary.score}/100 (${label})${RESET}`
  );
  lines.push(`Pages analysed: ${summary.pageCount}`);

  // Template banner
  if (summary.templateDetected) {
    lines.push(`${DIM}Template-generated content detected. Fix suggestions are tailored for template authors.${RESET}`);
  }

  lines.push("");

  // Category scores
  lines.push(`${BOLD}Category Scores${RESET}`);
  const categories = summary.categoryScores;
  for (const [name, value] of Object.entries(categories)) {
    const catColor = scoreColor(value as number);
    const padded = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(
      `  ${padded.padEnd(10)} ${catColor}${bar(value as number)}${RESET} ${value}`
    );
  }
  lines.push("");

  // Group scores
  if (summary.groupScores && summary.groupPageCounts) {
    lines.push(`${BOLD}Group Scores${RESET}`);
    for (const [name, value] of Object.entries(summary.groupScores)) {
      const count = summary.groupPageCounts[name] ?? 0;
      const gColor = scoreColor(value);
      lines.push(`  ${name.padEnd(15)} ${gColor}${bar(value)}${RESET} ${value} (${count} pages)`);
    }
    lines.push("");
  }

  // Top Issues — transformed with cluster info and effort
  const ruleMeta = new Map<string, { count: number; severity: Severity; effort?: FixEffort; clusterCount: number; totalPages: number; similarityRange?: [number, number] }>();
  for (const f of summary.findings) {
    const existing = ruleMeta.get(f.ruleId);
    if (existing) {
      existing.count += 1;
      if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(existing.severity)) {
        existing.severity = f.severity;
      }
      if (!existing.effort && f.effort) existing.effort = f.effort;
      if (f.context?.type === "cluster") {
        existing.clusterCount += 1;
        existing.totalPages += f.context.clusterSize;
        if (f.context.similarityRange) {
          if (!existing.similarityRange) {
            existing.similarityRange = [...f.context.similarityRange];
          } else {
            existing.similarityRange[0] = Math.min(existing.similarityRange[0], f.context.similarityRange[0]);
            existing.similarityRange[1] = Math.max(existing.similarityRange[1], f.context.similarityRange[1]);
          }
        }
      } else {
        existing.totalPages += 1;
      }
    } else {
      const isCluster = f.context?.type === "cluster";
      ruleMeta.set(f.ruleId, {
        count: 1,
        severity: f.severity,
        effort: f.effort,
        clusterCount: isCluster ? 1 : 0,
        totalPages: isCluster ? (f.context as Extract<FindingContext, { type: "cluster" }>).clusterSize : 1,
        similarityRange: isCluster ? [...(f.context as Extract<FindingContext, { type: "cluster" }>).similarityRange] : undefined,
      });
    }
  }

  if (ruleMeta.size > 0) {
    const sorted = Array.from(ruleMeta.entries())
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER.indexOf(a[1].severity) - SEVERITY_ORDER.indexOf(b[1].severity);
        if (sevDiff !== 0) return sevDiff;
        // Within same severity, quick fixes first
        const effortOrder = ["quick", "moderate", "structural"];
        const effortA = effortOrder.indexOf(a[1].effort ?? "moderate");
        const effortB = effortOrder.indexOf(b[1].effort ?? "moderate");
        if (effortA !== effortB) return effortA - effortB;
        return b[1].totalPages - a[1].totalPages;
      })
      .slice(0, 7);

    lines.push(`${BOLD}Top Issues${RESET}`);
    for (let i = 0; i < sorted.length; i += 1) {
      const [ruleId, meta] = sorted[i];
      const sColor = severityColor(meta.severity);
      let desc: string;
      if (meta.clusterCount > 0) {
        const rangeStr = meta.similarityRange
          ? ` ${(meta.similarityRange[0] * 100).toFixed(0)}–${(meta.similarityRange[1] * 100).toFixed(0)}% similar`
          : "";
        desc = meta.clusterCount === 1
          ? `1 cluster (${meta.totalPages} pages${rangeStr})`
          : `${meta.clusterCount} clusters (${meta.totalPages} pages${rangeStr})`;
      } else {
        desc = meta.count === 1 ? "1 page" : `${meta.totalPages} pages`;
      }
      const effort = effortLabelPlain(meta.effort);
      lines.push(`  ${sColor}${i + 1}.${RESET} ${ruleId} — ${desc}. ${effort}`);
    }
    lines.push("");
  }

  // Findings grouped by severity
  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const items = grouped.get(sev)!;
    if (items.length === 0) continue;

    const sevLabel = sev.toUpperCase();
    lines.push(
      `${severityColor(sev)}${sevLabel}${RESET} (${items.length})`
    );

    const showAll = sev === "critical" || sev === "error";
    const limit = showAll ? items.length : 5;
    const visible = items.slice(0, limit);

    for (const item of visible) {
      lines.push(`  ${severityColor(sev)}\u2022${RESET} [${item.ruleId}] ${item.message}`);

      // Cluster details
      if (item.context?.type === "cluster" && item.context.worstPairs.length > 0) {
        const worst = item.context.worstPairs[0];
        lines.push(`    ${DIM}Worst: ${shortenUrl(worst.left)} \u2194 ${shortenUrl(worst.right)} (${(worst.similarity * 100).toFixed(1)}%)${RESET}`);
      }

      if (item.fix) {
        lines.push(`    ${DIM}Fix: ${item.fix}${RESET}`);
      }
      if (item.ref) {
        lines.push(`    ${DIM}Ref: ${item.ref}${RESET}`);
      }
      if (item.effort) {
        lines.push(`    ${effortLabel(item.effort)}`);
      }
    }

    if (!showAll && items.length > limit) {
      lines.push(`  ${DIM}...${items.length - limit} more${RESET}`);
    }

    lines.push("");
  }

  const output = lines.join("\n");
  if (strip) {
    return output.replace(/\x1b\[[0-9;]*m/g, "");
  }
  return output;
}
```

- [ ] **Step 2: Run existing formatter tests**

Run: `cd packages/core && npx vitest run tests/formatters/formatters.test.ts`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/formatters/console.ts
git commit -m "feat: upgrade console formatter with cluster rendering, effort badges, and template banner"
```

---

### Task 9: Upgrade HTML formatter

**Files:**
- Modify: `packages/core/src/formatters/html.ts`

- [ ] **Step 1: Rewrite the HTML formatter with collapsible clusters and effort pills**

Replace the full content of `packages/core/src/formatters/html.ts`:

```typescript
import type { AuditSummary, FindingContext, FixEffort, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "error":
      return "#ea580c";
    case "warning":
      return "#ca8a04";
    case "info":
      return "#2563eb";
  }
}

function scoreColor(score: number): string {
  if (score <= 20) return "#16a34a";
  if (score <= 40) return "#ca8a04";
  if (score <= 60) return "#ea580c";
  return "#dc2626";
}

function effortColor(effort: FixEffort): string {
  switch (effort) {
    case "quick":
      return "#16a34a";
    case "moderate":
      return "#ca8a04";
    case "structural":
      return "#dc2626";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function renderFinding(item: RuleResult): string {
  let li = `<li><strong>${escapeHtml(item.ruleId)}</strong>`;
  if (item.effort) {
    li += ` <span class="effort-pill" style="background:${effortColor(item.effort)}">${item.effort}</span>`;
  }
  li += `: ${escapeHtml(item.message)}`;

  // Cluster details
  if (item.context?.type === "cluster") {
    const ctx = item.context;
    li += `<details><summary>${ctx.clusterSize} pages in cluster (${(ctx.similarityRange[0] * 100).toFixed(0)}–${(ctx.similarityRange[1] * 100).toFixed(0)}% similar)</summary>`;
    if (ctx.worstPairs.length > 0) {
      li += `<div class="cluster-details"><strong>Worst pairs:</strong><ul>`;
      for (const pair of ctx.worstPairs) {
        li += `<li>${escapeHtml(shortenUrl(pair.left))} \u2194 ${escapeHtml(shortenUrl(pair.right))} (${(pair.similarity * 100).toFixed(1)}%)</li>`;
      }
      li += `</ul>`;
    }
    if (ctx.members.length > 0) {
      li += `<strong>All members:</strong><ul class="member-list">`;
      for (const m of ctx.members) {
        li += `<li>${escapeHtml(shortenUrl(m))}</li>`;
      }
      li += `</ul>`;
    }
    li += `</div></details>`;
  }

  if (item.fix) {
    li += `<div class="fix">Fix: ${escapeHtml(item.fix)}</div>`;
  }
  if (item.ref) {
    li += ` <a href="${escapeHtml(item.ref)}" class="ref" target="_blank">Ref</a>`;
  }
  li += `</li>`;
  return li;
}

export function formatHtml(summary: AuditSummary): string {
  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  const categoryRows = Object.entries(summary.categoryScores)
    .map(([name, value]) => {
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      const pct = value as number;
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${scoreColor(pct)}"></div></div>
        </td>
        <td>${pct}</td>
      </tr>`;
    })
    .join("\n");

  const findingsSections = SEVERITY_ORDER.map((sev) => {
    const items = grouped.get(sev)!;
    if (items.length === 0) return "";
    const itemsHtml = items.map(renderFinding).join("\n");
    return `<h3 style="color:${severityColor(sev)}">${sev.charAt(0).toUpperCase() + sev.slice(1)} (${items.length})</h3>
    <ul>${itemsHtml}</ul>`;
  }).join("\n");

  const templateBanner = summary.templateDetected
    ? `<p class="template-banner">Template-generated content detected. Fix suggestions are tailored for template authors.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pSEOlint Audit Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc}
  h1{margin-bottom:.5rem}
  h2{margin-top:1.5rem;margin-bottom:.5rem;border-bottom:1px solid #e2e8f0;padding-bottom:.25rem}
  h3{margin-top:1rem;margin-bottom:.25rem}
  table{width:100%;border-collapse:collapse;margin:.5rem 0}
  th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid #e2e8f0}
  th{font-weight:600}
  td:last-child{text-align:right;width:3rem}
  .score{font-size:2rem;font-weight:700}
  .meta{color:#64748b;margin-bottom:1rem}
  .template-banner{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:.5rem 1rem;margin:.5rem 0;color:#92400e;font-size:.9em}
  .bar-bg{background:#e2e8f0;border-radius:4px;height:14px;width:100%}
  .bar-fill{height:100%;border-radius:4px;transition:width .3s}
  ul{list-style:disc;padding-left:1.5rem;margin-bottom:.5rem}
  li{margin:.2rem 0}
  .fix{color:#64748b;font-size:.9em;margin-top:.2rem}
  .ref{color:#2563eb;font-size:.85em}
  .effort-pill{display:inline-block;padding:.1rem .4rem;border-radius:9999px;color:white;font-size:.75em;font-weight:600;vertical-align:middle}
  details{margin:.25rem 0}
  summary{cursor:pointer;color:#2563eb;font-size:.9em}
  .cluster-details{padding:.5rem;background:#f1f5f9;border-radius:4px;margin:.25rem 0;font-size:.85em}
  .cluster-details ul{margin:.25rem 0}
  .member-list{max-height:200px;overflow-y:auto}
</style>
</head>
<body>
<h1>pSEOlint Audit Report</h1>
<p class="meta">Pages analysed: ${summary.pageCount}</p>
<p class="score" style="color:${scoreColor(summary.score)}">SpamBrain Risk Score: ${summary.score}/100</p>
${templateBanner}

<h2>Category Scores</h2>
<table>
  <thead><tr><th>Category</th><th>Bar</th><th>Score</th></tr></thead>
  <tbody>${categoryRows}</tbody>
</table>

${summary.groupScores && summary.groupPageCounts ? `
<h2>Group Scores</h2>
<table>
  <thead><tr><th>Group</th><th>Score</th><th>Pages</th></tr></thead>
  <tbody>${Object.entries(summary.groupScores).map(([name, value]) => {
    const count = summary.groupPageCounts![name] ?? 0;
    return `<tr><td>${escapeHtml(name)}</td><td style="text-align:right">${value}</td><td style="text-align:right">${count}</td></tr>`;
  }).join("\n")}</tbody>
</table>` : ""}

<h2>Findings</h2>
${findingsSections}
</body>
</html>`;
}
```

- [ ] **Step 2: Run existing formatter tests**

Run: `cd packages/core && npx vitest run tests/formatters/formatters.test.ts`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/formatters/html.ts
git commit -m "feat: upgrade HTML formatter with collapsible clusters, effort pills, and template banner"
```

---

### Task 10: Upgrade markdown formatter

**Files:**
- Modify: `packages/core/src/formatters/markdown.ts`

- [ ] **Step 1: Add cluster rendering, effort badges, and template banner**

Replace the full content of `packages/core/src/formatters/markdown.ts`:

```typescript
import type { AuditSummary, FixEffort, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityEmoji(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "\uD83D\uDD34";
    case "error":
      return "\uD83D\uDFE0";
    case "warning":
      return "\uD83D\uDFE1";
    case "info":
      return "\uD83D\uDD35";
  }
}

function effortBadge(effort?: FixEffort): string {
  if (!effort) return "";
  return ` (**${effort} fix**)`;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

export function formatMarkdown(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push(`# pSEOlint Audit Report`);
  lines.push("");
  lines.push(`**SpamBrain Risk Score:** ${summary.score}/100`);
  lines.push(`**Pages analysed:** ${summary.pageCount}`);

  if (summary.templateDetected) {
    lines.push("");
    lines.push(`> Template-generated content detected. Fix suggestions are tailored for template authors.`);
  }

  lines.push("");

  // Category scores table
  lines.push(`## Category Scores`);
  lines.push("");
  lines.push(`| Category | Score |`);
  lines.push(`|----------|------:|`);
  for (const [name, value] of Object.entries(summary.categoryScores)) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`| ${label} | ${value} |`);
  }
  lines.push("");

  // Group scores
  if (summary.groupScores && summary.groupPageCounts) {
    lines.push(`## Group Scores`);
    lines.push("");
    lines.push(`| Group | Score | Pages |`);
    lines.push(`|-------|------:|------:|`);
    for (const [name, value] of Object.entries(summary.groupScores)) {
      const count = summary.groupPageCounts[name] ?? 0;
      lines.push(`| ${name} | ${value} | ${count} |`);
    }
    lines.push("");
  }

  // Findings
  lines.push(`## Findings`);
  lines.push("");

  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const items = grouped.get(sev)!;
    if (items.length === 0) continue;

    lines.push(`### ${severityEmoji(sev)} ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${items.length})`);
    lines.push("");
    for (const item of items) {
      lines.push(`- **${item.ruleId}**${effortBadge(item.effort)}: ${item.message}`);

      // Cluster details
      if (item.context?.type === "cluster" && item.context.worstPairs.length > 0) {
        const worst = item.context.worstPairs[0];
        lines.push(`  > Worst: ${shortenUrl(worst.left)} \u2194 ${shortenUrl(worst.right)} (${(worst.similarity * 100).toFixed(1)}%)`);
      }

      if (item.fix) {
        lines.push(`  > ${item.fix}`);
      }
      if (item.ref) {
        lines.push(`  > [Google reference](${item.ref})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Run existing formatter tests**

Run: `cd packages/core && npx vitest run tests/formatters/formatters.test.ts`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/formatters/markdown.ts
git commit -m "feat: upgrade markdown formatter with cluster rendering, effort badges, and template banner"
```

---

### Task 11: Add formatter tests for enriched output

**Files:**
- Modify: `packages/core/tests/formatters/formatters.test.ts`

- [ ] **Step 1: Add tests for enriched output in all formatters**

Append to `packages/core/tests/formatters/formatters.test.ts`:

```typescript
const enrichedSummary: AuditSummary = {
  score: 84,
  categoryScores: {
    spam: 100,
    content: 100,
    links: 29,
    tech: 100,
    schema: 0,
    cannibal: 100,
  },
  pageCount: 476,
  templateDetected: true,
  rawFindingCount: 4673,
  findings: [
    {
      ruleId: "spam/near-duplicate",
      severity: "critical",
      message: "47 pages form a near-duplicate cluster (85.9\u201390.6% similar).",
      pageUrl: "https://example.com/page-1",
      context: {
        type: "cluster",
        clusterSize: 47,
        members: ["https://example.com/page-1", "https://example.com/page-2"],
        worstPairs: [
          { left: "https://example.com/page-1", right: "https://example.com/page-2", similarity: 0.906 },
        ],
        similarityRange: [0.859, 0.906],
      },
      effort: "structural",
      fix: "Your template produces 47 near-identical pages.",
    },
    {
      ruleId: "tech/og-completeness",
      severity: "warning",
      message: "Missing og:image.",
      pageUrl: "https://example.com/page-3",
      effort: "quick",
      fix: "Add og:image to your page template.",
    },
  ],
};

describe("formatConsole — enriched output", () => {
  it("shows template banner when templateDetected is true", () => {
    const output = formatConsole(enrichedSummary);
    expect(output).toContain("Template-generated content detected");
  });

  it("renders effort labels", () => {
    const output = formatConsole(enrichedSummary, { noColor: true });
    expect(output).toContain("[structural]");
    expect(output).toContain("[quick fix]");
  });

  it("renders cluster worst pair", () => {
    const output = formatConsole(enrichedSummary, { noColor: true });
    expect(output).toContain("/page-1");
    expect(output).toContain("90.6%");
  });
});

describe("formatHtml — enriched output", () => {
  it("renders collapsible details element for clusters", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("<details>");
    expect(output).toContain("<summary>");
  });

  it("renders effort pills", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("effort-pill");
    expect(output).toContain("structural");
    expect(output).toContain("quick");
  });

  it("renders template banner", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("template-banner");
    expect(output).toContain("Template-generated content detected");
  });
});

describe("formatMarkdown — enriched output", () => {
  it("includes effort badge inline", () => {
    const output = formatMarkdown(enrichedSummary);
    expect(output).toContain("(**structural fix**)");
    expect(output).toContain("(**quick fix**)");
  });

  it("renders template banner as blockquote", () => {
    const output = formatMarkdown(enrichedSummary);
    expect(output).toContain("> Template-generated content detected");
  });
});

describe("formatJson — enriched output", () => {
  it("preserves context and effort in JSON output", () => {
    const parsed = JSON.parse(formatJson(enrichedSummary));
    expect(parsed.templateDetected).toBe(true);
    expect(parsed.rawFindingCount).toBe(4673);
    expect(parsed.findings[0].context.type).toBe("cluster");
    expect(parsed.findings[0].effort).toBe("structural");
    expect(parsed.findings[1].effort).toBe("quick");
  });
});
```

- [ ] **Step 2: Run formatter tests**

Run: `cd packages/core && npx vitest run tests/formatters/formatters.test.ts`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/formatters/formatters.test.ts
git commit -m "test: add formatter tests for enriched output with clusters, effort, and template banner"
```

---

### Task 12: Upgrade GitHub Action PR comment

**Files:**
- Modify: `packages/action/src/index.ts`

- [ ] **Step 1: Add template banner and effort info to PR comment**

In `packages/action/src/index.ts`, modify the `formatPrComment` function (lines 17-67). Replace it with:

```typescript
function formatPrComment(summary: AuditSummary): string {
  const lines: string[] = [COMMENT_MARKER];

  lines.push(`## pSEO Lint — Score: ${summary.score}/100 (${scoreLabel(summary.score)})`);
  lines.push("");
  lines.push(`**Pages analysed:** ${summary.pageCount}`);

  if (summary.templateDetected) {
    lines.push("");
    lines.push(`> Template-generated content detected. Fix suggestions are tailored for template authors.`);
  }

  lines.push("");

  lines.push("| Category | Score |");
  lines.push("|----------|------:|");
  for (const [name, value] of Object.entries(summary.categoryScores)) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`| ${label} | ${value} |`);
  }
  lines.push("");

  const grouped = new Map<Severity, typeof summary.findings>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const items = grouped.get(sev)!;
    if (items.length === 0) continue;

    const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push(`### ${sevLabel} (${items.length})`);

    const showAll = sev === "critical" || sev === "error";
    const limit = showAll ? items.length : 5;
    const visible = items.slice(0, limit);

    for (const item of visible) {
      const effortStr = item.effort ? ` (**${item.effort}**)` : "";
      lines.push(`- **${item.ruleId}**${effortStr}: ${item.message}`);
    }

    if (!showAll && items.length > limit) {
      lines.push(`- *...${items.length - limit} more*`);
    }

    lines.push("");
  }

  lines.push("---");
  lines.push('<sub>Generated by <a href="https://pseolint.dev">pSEO Lint</a></sub>');

  return lines.join("\n");
}
```

- [ ] **Step 2: Verify the project builds**

Run: `cd packages/action && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/action/src/index.ts
git commit -m "feat: add template banner and effort badges to GitHub Action PR comment"
```

---

### Task 13: Run full test suite and build

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd D:/phili/SSD_Projects/pseolint && bun run test`
Expected: All tests pass across all packages

- [ ] **Step 2: Run the full build**

Run: `cd D:/phili/SSD_Projects/pseolint && bun run build`
Expected: Clean build with no errors

- [ ] **Step 3: Commit any fixes if needed**

If any tests or build issues surface, fix them and commit.
