import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { nearDuplicateRule } from "../../rules/spam/near-duplicate.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z
    .array(z.string())
    .min(2)
    .max(50)
    .describe("Page references from fetch_page. Min 2, max 50 to bound O(n^2) work."),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum simhash similarity (0-1) to flag as near-duplicate. Default 0.85."),
});

const outputSchema = z.object({
  pairCount: z.number().int().nonnegative(),
  pairs: z.array(
    z.object({
      leftUrl: z.string(),
      rightUrl: z.string(),
      similarity: z.number().min(0).max(1),
    }),
  ),
  findings: z.array(
    z.object({
      ruleId: z.literal("spam/near-duplicate"),
      severity: z.literal("critical"),
      message: z.string(),
      pageUrl: z.string(),
      relatedUrls: z.array(z.string()).optional(),
      similarity: z.number().min(0).max(1),
    }),
  ),
});

const DEFAULT_THRESHOLD = 0.85;

export const checkRuleNearDuplicateTool = defineTool({
  name: "check_rule_near_duplicate",
  description:
    "Detect near-duplicate page pairs across a sample (simhash + Hamming distance). Pass an array of pageIds (min 2, max 50). Returns each pair above the similarity threshold (default 0.85) plus a critical finding per pair. Use after sample_template + fetch_page to check whether template-instance pages are differentiated enough.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, threshold = DEFAULT_THRESHOLD }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const { findings, pairs } = nearDuplicateRule(parsed, threshold);

    return {
      pairCount: pairs.length,
      pairs: pairs.map((p) => ({
        leftUrl: p.leftUrl,
        rightUrl: p.rightUrl,
        similarity: p.similarity,
      })),
      findings: findings.map((f) => ({
        ruleId: "spam/near-duplicate" as const,
        severity: "critical" as const,
        message: f.message,
        pageUrl: f.pageUrl ?? "",
        relatedUrls: f.relatedUrls,
        similarity: f.similarity ?? 0,
      })),
    };
  },
});
