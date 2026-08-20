import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { schemaConsistencyRule } from "../../rules/schema/consistency.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z
    .array(z.string())
    .min(2)
    .max(50)
    .describe("Min 2 pageIds: consistency only makes sense across a sample."),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("schema/consistency"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      relatedUrls: z.array(z.string()).optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleSchemaConsistencyTool = defineTool({
  name: "check_rule_schema_consistency",
  description:
    "Detect JSON-LD @type mismatches across a page sample (e.g. most /city/* pages declare Place+Service but a few drop Service). Min 2 pageIds: pass a representative sample of one template at a time for the cleanest signal.",
  inputSchema,
  outputSchema,
  async execute({ pageIds }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = schemaConsistencyRule(parsed);
    return {
      findings: findings.map((f) => ({
        ruleId: "schema/consistency" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        relatedUrls: f.relatedUrls,
        fix: f.fix,
      })),
    };
  },
});
