import type {
  RuleResult,
  ParsedPage,
  Severity,
  FixEffort,
  FindingContext,
} from "./types.js";

// ── Rule sets ──────────────────────────────────────────────────────────

const CLUSTERABLE_RULES = new Set([
  "spam/near-duplicate",
  "spam/entity-swap",
  "cannibal/keyword-collision",
  "cannibal/title-overlap",
]);

const EFFORT_BASELINES: Record<string, FixEffort> = {
  // quick
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
  // moderate
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
  // structural
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

const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

// ── Union-Find ─────────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

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
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
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

// ── Helpers ────────────────────────────────────────────────────────────

function highestSeverity(severities: Severity[]): Severity {
  let max: Severity = "info";
  for (const s of severities) {
    if (SEVERITY_ORDER[s] > SEVERITY_ORDER[max]) max = s;
  }
  return max;
}

function escalateEffort(base: FixEffort, affectedPages: number): FixEffort {
  if (affectedPages <= 20) return base;
  if (base === "quick") return "moderate";
  if (base === "moderate") return "structural";
  return "structural";
}

function extractBlocks(text: string): string[] {
  return text
    .split(/[.!?]\s+|\n+/)
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b.length > 20);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).slice(0, n).join(" ");
}

function computeContentBreakdown(
  pages: ParsedPage[],
  leftUrl: string,
  rightUrl: string,
): string {
  const leftPage = pages.find((p) => p.url === leftUrl);
  const rightPage = pages.find((p) => p.url === rightUrl);
  if (!leftPage || !rightPage) return "";

  const leftBlocks = extractBlocks(leftPage.contentText);
  const rightBlocks = extractBlocks(rightPage.contentText);
  const rightSet = new Set(rightBlocks);

  const shared = leftBlocks.filter((b) => rightSet.has(b));
  const sharedWordCount = shared.reduce((sum, b) => sum + wordCount(b), 0);
  const totalWordCount =
    leftBlocks.reduce((sum, b) => sum + wordCount(b), 0) +
    rightBlocks.reduce((sum, b) => sum + wordCount(b), 0);
  const uniqueWordCount = totalWordCount - sharedWordCount * 2;

  if (shared.length === 0) return "";

  const sharedSummaries = shared
    .slice(0, 3)
    .map((b) => `${firstNWords(b, 3)}... (${wordCount(b)}w)`)
    .join(", ");

  return `Shared: ${sharedSummaries}. Unique: ${uniqueWordCount}w of ${totalWordCount}w.`;
}

function formatPercent(sim: number): string {
  return (sim * 100).toFixed(1);
}

// ── Main pipeline ──────────────────────────────────────────────────────

export function enrichFindings(
  findings: RuleResult[],
  pages: ParsedPage[],
  options?: { templateGenerated?: boolean },
): {
  findings: RuleResult[];
  templateDetected: boolean;
  rawFindingCount: number;
} {
  const rawFindingCount = findings.length;

  // Separate clusterable from non-clusterable
  const pairwise: RuleResult[] = [];
  const passthrough: RuleResult[] = [];

  for (const f of findings) {
    if (
      CLUSTERABLE_RULES.has(f.ruleId) &&
      f.pageUrl &&
      f.relatedUrls &&
      f.relatedUrls.length > 0
    ) {
      pairwise.push(f);
    } else {
      passthrough.push(f);
    }
  }

  // ── Step 1: Cluster pairwise findings per rule ──

  const byRule = new Map<string, RuleResult[]>();
  for (const f of pairwise) {
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId)!.push(f);
  }

  const clustered: RuleResult[] = [];

  for (const [ruleId, rulePairs] of byRule) {
    const uf = new UnionFind();
    for (const f of rulePairs) {
      uf.union(f.pageUrl!, f.relatedUrls![0]);
    }

    const components = uf.components();

    for (const [, members] of components) {
      // Gather all pairs in this cluster
      const memberSet = new Set(members);
      const clusterPairs = rulePairs.filter(
        (f) => memberSet.has(f.pageUrl!) && memberSet.has(f.relatedUrls![0]),
      );

      // Sort worst pairs by similarity descending
      const worstPairs = [...clusterPairs]
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
        .slice(0, 3)
        .map((f) => ({
          left: f.pageUrl!,
          right: f.relatedUrls![0],
          similarity: f.similarity ?? 0,
        }));

      const similarities = clusterPairs.map((f) => f.similarity ?? 0);
      const minSim = Math.min(...similarities);
      const maxSim = Math.max(...similarities);

      const severity = highestSeverity(clusterPairs.map((f) => f.severity));

      const context: FindingContext = {
        type: "cluster",
        clusterSize: members.length,
        members,
        worstPairs,
        similarityRange: [minSim, maxSim],
      };

      const message = `${members.length} pages form a near-duplicate cluster (${formatPercent(minSim)}–${formatPercent(maxSim)}% similar).`;

      clustered.push({
        ruleId,
        severity,
        message,
        pageUrl: members[0],
        relatedUrls: members.slice(1),
        context,
      });
    }
  }

  // ── Step 2: Content breakdowns for near-duplicate / entity-swap clusters ──

  for (const f of clustered) {
    if (
      (f.ruleId === "spam/near-duplicate" || f.ruleId === "spam/entity-swap") &&
      f.context?.type === "cluster" &&
      f.context.worstPairs.length > 0
    ) {
      const top = f.context.worstPairs[0];
      const summary = computeContentBreakdown(pages, top.left, top.right);
      if (summary) {
        (f as any)._contentSummary = summary;
      }
    }
  }

  // ── Step 3: Detect template generation ──

  let templateDetected: boolean;
  if (options?.templateGenerated !== undefined) {
    templateDetected = options.templateGenerated;
  } else {
    // entity-swap cluster(s) with total affected pages >= 10
    const entitySwapClusters = clustered.filter(
      (f) => f.ruleId === "spam/entity-swap" && f.context?.type === "cluster",
    );
    const totalEntitySwapPages = entitySwapClusters.reduce(
      (sum, f) => sum + (f.context?.type === "cluster" ? f.context.clusterSize : 0),
      0,
    );

    const boilerplateFindings = findings.filter(
      (f) => f.ruleId === "spam/boilerplate-ratio",
    );
    const boilerplateCoverage =
      pages.length > 0 ? boilerplateFindings.length / pages.length : 0;

    const hasTemplateDiversity = findings.some(
      (f) => f.ruleId === "spam/template-diversity",
    );

    templateDetected =
      totalEntitySwapPages >= 10 &&
      (boilerplateCoverage >= 0.5 || hasTemplateDiversity);
  }

  // ── Step 4: Rewrite fix strings ──

  for (const f of clustered) {
    if (f.context?.type !== "cluster") continue;

    const [minSim, maxSim] = f.context.similarityRange;
    const n = f.context.clusterSize;
    const contentSummary = (f as any)._contentSummary ?? "";
    const summaryPart = contentSummary ? ` ${contentSummary}` : "";

    if (templateDetected) {
      f.fix = `Your template produces ${n} near-identical pages (${formatPercent(minSim)}–${formatPercent(maxSim)}% similar).${summaryPart} Add conditional content sections per entity to differentiate each page.`;
    } else {
      f.fix = `${n} pages form a near-duplicate cluster (${formatPercent(minSim)}–${formatPercent(maxSim)}% similar).${summaryPart} Differentiate these pages by adding unique content to each.`;
    }

    // Clean up internal property
    delete (f as any)._contentSummary;
  }

  // Rewrite per-page findings with template language when applicable
  if (templateDetected) {
    // Build a map of ruleId -> unique pageUrls count across all findings
    const rulePageCounts = new Map<string, Set<string>>();
    for (const f of [...clustered, ...passthrough]) {
      if (!f.pageUrl) continue;
      if (!rulePageCounts.has(f.ruleId)) rulePageCounts.set(f.ruleId, new Set());
      rulePageCounts.get(f.ruleId)!.add(f.pageUrl);
    }

    for (const f of passthrough) {
      const rulePageCount = rulePageCounts.get(f.ruleId)?.size ?? 0;
      // For template sites with many affected pages, suggest template-level fixes
      if (templateDetected && rulePageCount > 5) {
        if (f.ruleId === "tech/og-completeness") {
          f.fix = "Add the missing Open Graph tags to your page template: og:title, og:description, og:image.";
        } else if (f.ruleId === "tech/canonical-consistency") {
          f.fix = 'Add <link rel="canonical"> to your base template\'s <head>.';
        } else if (f.ruleId === "content/missing-author") {
          f.fix = 'Add author attribution to your base template: <meta name="author"> or JSON-LD author field.';
        } else if (f.fix && !f.fix.includes("template")) {
          f.fix = `${f.fix} Consider fixing this in your template for all pages.`;
        }
      }
    }
  }

  // ── Step 5: Assign effort tags ──

  const allFindings = [...clustered, ...passthrough];

  for (const f of allFindings) {
    const baseline = EFFORT_BASELINES[f.ruleId] ?? "moderate";
    const affected =
      f.context?.type === "cluster"
        ? f.context.clusterSize
        : f.relatedUrls
          ? f.relatedUrls.length + 1
          : 1;
    f.effort = escalateEffort(baseline, affected);
  }

  return { findings: allFindings, templateDetected, rawFindingCount };
}
