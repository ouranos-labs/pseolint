import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { freshnessSignalsRule } from "../../rules/aeo/freshness-signals.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
  maxStaleDays: z
    .number()
    .int()
    .positive()
    .max(3650)
    .optional()
    .describe("Max days since last update before flagging as stale. Default 180."),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/freshness-signals"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleFreshnessSignalsTool = defineTool({
  name: "check_rule_freshness_signals",
  description:
    "Check pages for visible or structured freshness signals (datePublished / dateModified in JSON-LD, <time> elements, 'Updated YYYY' text). Flags pages older than maxStaleDays and pages missing any freshness signal.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, maxStaleDays }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = freshnessSignalsRule(
      parsed,
      maxStaleDays !== undefined ? { maxStaleDays } : undefined,
    );
    return {
      findings: findings.map((f) => ({
        ruleId: "aeo/freshness-signals" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
