import { describe, expect, it, test } from "vitest";
import { enrichFindings } from "../src/enrich-findings.js";
import type { ParsedPage, RuleResult } from "../src/types.js";

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
    authorSignals: {
      metaAuthor: "",
      schemaAuthor: false,
      bylineElement: false,
      relAuthorLink: false,
    },
    contentText: content,
    html: `<html><body>${content}</body></html>`,
  };
}

function makeFinding(
  ruleId: string,
  pageUrl: string,
  relatedUrl: string,
  similarity: number,
): RuleResult {
  return {
    ruleId,
    severity: "critical",
    message: `${pageUrl} and ${relatedUrl} are near-duplicates.`,
    pageUrl,
    relatedUrls: [relatedUrl],
    similarity,
  };
}

describe("enrichFindings — clustering", () => {
  test("collapses transitive pairwise findings into one cluster", () => {
    const pages = ["A", "B", "C", "D"].map((u) => makePage(u));
    const findings = [
      makeFinding("spam/near-duplicate", "A", "B", 0.95),
      makeFinding("spam/near-duplicate", "B", "C", 0.9),
      makeFinding("spam/near-duplicate", "C", "D", 0.85),
    ];

    const result = enrichFindings(findings, pages);

    const clusters = result.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].context!.type).toBe("cluster");
    if (clusters[0].context!.type === "cluster") {
      expect(clusters[0].context!.clusterSize).toBe(4);
      expect(clusters[0].context!.members).toHaveLength(4);
      expect(new Set(clusters[0].context!.members)).toEqual(
        new Set(["A", "B", "C", "D"]),
      );
    }
  });

  test("produces independent clusters for disconnected pairs", () => {
    const pages = ["A", "B", "C", "D"].map((u) => makePage(u));
    const findings = [
      makeFinding("spam/near-duplicate", "A", "B", 0.92),
      makeFinding("spam/near-duplicate", "C", "D", 0.88),
    ];

    const result = enrichFindings(findings, pages);

    const clusters = result.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(2);
  });

  test("keeps top 3 worst pairs sorted by similarity descending", () => {
    const pages = ["A", "B", "C", "D", "E"].map((u) => makePage(u));
    const findings = [
      makeFinding("spam/near-duplicate", "A", "B", 0.85),
      makeFinding("spam/near-duplicate", "B", "C", 0.92),
      makeFinding("spam/near-duplicate", "C", "D", 0.78),
      makeFinding("spam/near-duplicate", "D", "E", 0.97),
    ];

    const result = enrichFindings(findings, pages);

    const clusters = result.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(1);
    const ctx = clusters[0].context!;
    if (ctx.type === "cluster") {
      expect(ctx.worstPairs).toHaveLength(3);
      expect(ctx.worstPairs[0].similarity).toBe(0.97);
      expect(ctx.worstPairs[1].similarity).toBe(0.92);
      expect(ctx.worstPairs[2].similarity).toBe(0.85);
    }
  });

  test("computes correct similarity range", () => {
    const pages = ["A", "B", "C"].map((u) => makePage(u));
    const findings = [
      makeFinding("spam/near-duplicate", "A", "B", 0.75),
      makeFinding("spam/near-duplicate", "B", "C", 0.95),
    ];

    const result = enrichFindings(findings, pages);

    const clusters = result.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(1);
    const ctx = clusters[0].context!;
    if (ctx.type === "cluster") {
      expect(ctx.similarityRange).toEqual([0.75, 0.95]);
    }
  });

  test("clusters each rule independently", () => {
    const pages = ["A", "B"].map((u) => makePage(u));
    const findings = [
      makeFinding("spam/near-duplicate", "A", "B", 0.9),
      {
        ...makeFinding("cannibal/keyword-collision", "A", "B", 0.8),
        message: "A and B share keywords.",
      },
    ];

    const result = enrichFindings(findings, pages);

    const clusters = result.findings.filter(
      (f) => f.context?.type === "cluster",
    );
    expect(clusters).toHaveLength(2);

    const ruleIds = clusters.map((c) => c.ruleId).sort();
    expect(ruleIds).toEqual([
      "cannibal/keyword-collision",
      "spam/near-duplicate",
    ]);
  });

  test("passes through non-pairwise findings unchanged (except effort tag)", () => {
    const pages = [makePage("A")];
    const findings: RuleResult[] = [
      {
        ruleId: "spam/thin-content",
        severity: "warning",
        message: "Page A has thin content.",
        pageUrl: "A",
      },
    ];

    const result = enrichFindings(findings, pages);

    expect(result.findings).toHaveLength(1);
    const f = result.findings[0];
    expect(f.ruleId).toBe("spam/thin-content");
    expect(f.severity).toBe("warning");
    expect(f.message).toBe("Page A has thin content.");
    expect(f.context).toBeUndefined();
    expect(f.effort).toBe("moderate");
  });
});

describe("enrichFindings — template detection", () => {
  it("detects template when entity-swap >= 10 pages and template-diversity fires", () => {
    const findings: RuleResult[] = [];
    for (let i = 0; i < 10; i++) {
      findings.push(makeFinding("spam/entity-swap", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.96));
    }
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
      ruleId: "tech/og-completeness" as const,
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
      ruleId: "tech/og-completeness" as const,
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

describe("enrichFindings — per-page grouping", () => {
  it("groups content/unique-value findings when more than 3", () => {
    const findings: RuleResult[] = Array.from({ length: 10 }, (_, i) => ({
      ruleId: "content/unique-value",
      severity: "error" as const,
      message: `https://a.com/${i} has only ${50 + i} unique words (min 100).`,
      pageUrl: `https://a.com/${i}`,
      fix: `Add ${50 - i} more words of content not found on any other page.`,
      ref: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
    }));
    const pages = Array.from({ length: 10 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const uvFindings = result.findings.filter((f) => f.ruleId === "content/unique-value");
    expect(uvFindings).toHaveLength(1);
    expect(uvFindings[0].message).toContain("10 pages");
    expect(uvFindings[0].relatedUrls).toBeDefined();
    expect(uvFindings[0].relatedUrls!.length).toBe(9);
  });

  it("does not group when 3 or fewer findings", () => {
    const findings: RuleResult[] = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "content/unique-value",
      severity: "error" as const,
      message: `https://a.com/${i} has only ${50 + i} unique words (min 100).`,
      pageUrl: `https://a.com/${i}`,
    }));
    const pages = Array.from({ length: 3 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const uvFindings = result.findings.filter((f) => f.ruleId === "content/unique-value");
    expect(uvFindings).toHaveLength(3);
  });

  it("selects the worst page (fewest unique words) for content/unique-value", () => {
    const findings: RuleResult[] = Array.from({ length: 5 }, (_, i) => ({
      ruleId: "content/unique-value",
      severity: "error" as const,
      message: `https://a.com/${i} has only ${60 + i * 5} unique words (min 100).`,
      pageUrl: `https://a.com/${i}`,
    }));
    const pages = Array.from({ length: 5 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const uvFindings = result.findings.filter((f) => f.ruleId === "content/unique-value");
    expect(uvFindings).toHaveLength(1);
    // Worst = fewest unique words = index 0 (60 words)
    expect(uvFindings[0].pageUrl).toBe("https://a.com/0");
  });

  it("groups links/orphan-pages findings when more than 3", () => {
    const findings: RuleResult[] = Array.from({ length: 5 }, (_, i) => ({
      ruleId: "links/orphan-pages",
      severity: "warning" as const,
      message: `https://a.com/${i} has no inbound internal links.`,
      pageUrl: `https://a.com/${i}`,
    }));
    const pages = Array.from({ length: 5 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const orphanFindings = result.findings.filter((f) => f.ruleId === "links/orphan-pages");
    expect(orphanFindings).toHaveLength(1);
    expect(orphanFindings[0].message).toContain("5 pages");
    expect(orphanFindings[0].message).toContain("no inbound internal links");
    expect(orphanFindings[0].relatedUrls!.length).toBe(4);
  });

  it("uses highest severity in grouped finding", () => {
    const findings: RuleResult[] = [
      { ruleId: "content/unique-value", severity: "warning" as const, message: "https://a.com/0 has only 40 unique words (min 100).", pageUrl: "https://a.com/0" },
      { ruleId: "content/unique-value", severity: "error" as const, message: "https://a.com/1 has only 45 unique words (min 100).", pageUrl: "https://a.com/1" },
      { ruleId: "content/unique-value", severity: "error" as const, message: "https://a.com/2 has only 50 unique words (min 100).", pageUrl: "https://a.com/2" },
      { ruleId: "content/unique-value", severity: "critical" as const, message: "https://a.com/3 has only 55 unique words (min 100).", pageUrl: "https://a.com/3" },
      { ruleId: "content/unique-value", severity: "warning" as const, message: "https://a.com/4 has only 60 unique words (min 100).", pageUrl: "https://a.com/4" },
    ];
    const pages = Array.from({ length: 5 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const uvFindings = result.findings.filter((f) => f.ruleId === "content/unique-value");
    expect(uvFindings).toHaveLength(1);
    expect(uvFindings[0].severity).toBe("critical");
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
    expect(result.findings.length).toBe(1);
  });
});
