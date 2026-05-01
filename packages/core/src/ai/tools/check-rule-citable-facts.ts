import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { citableFactsRule } from "../../rules/aeo/citable-facts.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
  minFactsPerPage: z.number().int().nonnegative().max(20).optional(),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/citable-facts"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      confidence: z.enum(["high", "medium", "low", "speculative"]).optional(),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleCitableFactsTool = defineTool({
  name: "check_rule_citable_facts",
  description:
    "Count citable facts (numbers, dates, percentages, dollar amounts, named entities) per page. Pages with too few quotable specifics get skipped by AI Overview / Perplexity / ChatGPT for citation. Default threshold is 3 facts per page.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, minFactsPerPage }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = citableFactsRule(
      parsed,
      [],
      minFactsPerPage !== undefined ? { minFactsPerPage } : undefined,
    );
    return {
      findings: findings.map((f) => ({
        ruleId: "aeo/citable-facts" as const,
        severity: f.severity,
        confidence: f.confidence,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
