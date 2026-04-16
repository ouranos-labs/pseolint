import { describe, expect, test } from "vitest";
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

describe("enrichFindings", () => {
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
