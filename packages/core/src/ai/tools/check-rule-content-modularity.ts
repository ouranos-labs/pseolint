import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { contentModularityRule } from "../../rules/aeo/content-modularity.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
  maxParagraphWords: z.number().int().positive().max(2000).optional(),
  minSelfContainedRatio: z.number().min(0).max(1).optional(),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/content-modularity"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleContentModularityTool = defineTool({
  name: "check_rule_content_modularity",
  description:
    "Check whether paragraphs are modular (short, self-contained, lift-able as standalone snippets). AI engines prefer to quote discrete blocks. Default thresholds: paragraphs <= 200 words, >= 70% self-contained.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, maxParagraphWords, minSelfContainedRatio }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const opts: { maxParagraphWords?: number; minSelfContainedRatio?: number } = {};
    if (maxParagraphWords !== undefined) opts.maxParagraphWords = maxParagraphWords;
    if (minSelfContainedRatio !== undefined) opts.minSelfContainedRatio = minSelfContainedRatio;
    const findings = contentModularityRule(parsed, opts);
    return {
      findings: findings.map((f) => ({
        ruleId: "aeo/content-modularity" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
