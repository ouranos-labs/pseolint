import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { missingAuthorRule } from "../../rules/content/missing-author.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
});

const outputSchema = z.object({
  hasAuthorSignal: z.boolean(),
  finding: z
    .object({
      ruleId: z.literal("content/missing-author"),
      severity: z.literal("warning"),
      confidence: z.enum(["high", "medium", "low", "speculative"]),
      message: z.string(),
      fix: z.string().optional(),
    })
    .nullable(),
});

export const checkRuleMissingAuthorTool = defineTool({
  name: "check_rule_missing_author",
  description:
    "Check if a previously-fetched page has any author attribution signal (meta[name=author], JSON-LD author, visible byline, rel=author link). Returns a warning finding when none are present. Severity is `warning` (not `error`) because docs/product/marketing pages legitimately ship without bylines — this matters most on blog/news content.",
  inputSchema,
  outputSchema,
  async execute({ pageId }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const findings = missingAuthorRule([parsed]);
    const finding = findings[0];

    return {
      hasAuthorSignal: findings.length === 0,
      finding: finding
        ? {
            ruleId: "content/missing-author" as const,
            severity: "warning" as const,
            confidence: finding.confidence ?? "medium",
            message: finding.message,
            fix: finding.fix,
          }
        : null,
    };
  },
});
