import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { summaryBaitRule } from "../../rules/aeo/summary-bait.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
  openerWordCount: z.number().int().positive().max(500).optional(),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/summary-bait"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleSummaryBaitTool = defineTool({
  name: "check_rule_summary_bait",
  description:
    "Detect 'summary bait' openers — content that withholds the answer to extract a scroll/click instead of resolving the query. AI engines preferentially cite pages that answer in the opener. Pass at least 3 pages so the rule can detect templated bait patterns across a sample.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, openerWordCount }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = summaryBaitRule(
      parsed,
      [],
      openerWordCount !== undefined ? { openerWordCount } : undefined,
    );
    return {
      findings: findings.map((f) => ({
        ruleId: "aeo/summary-bait" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
