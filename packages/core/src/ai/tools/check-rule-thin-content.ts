import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { thinContentRule } from "../../rules/spam/thin-content.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
  minWords: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .describe("Threshold for thin content. Default 300 (matches v0.4 engine default)."),
});

const outputSchema = z.object({
  isThin: z.boolean(),
  wordCount: z.number().int().nonnegative(),
  threshold: z.number().int().positive(),
  finding: z
    .object({
      ruleId: z.literal("spam/thin-content"),
      severity: z.literal("error"),
      confidence: z.enum(["high", "medium", "low", "speculative"]),
      message: z.string(),
      fix: z.string().optional(),
    })
    .nullable(),
});

const DEFAULT_MIN_WORDS = 300;

export const checkRuleThinContentTool = defineTool({
  name: "check_rule_thin_content",
  description:
    "Check if a single page (referenced by pageId from fetch_page) is thin content (fewer than N words of substantive copy). Returns the word count, threshold, and the finding object if thin. Default threshold 300 words; lower it (e.g. 150) for landing-page-style sites to reduce false positives.",
  inputSchema,
  outputSchema,
  async execute({ pageId, minWords = DEFAULT_MIN_WORDS }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const { findings } = thinContentRule([parsed], minWords);
    const wordCount = parsed.contentText.split(/\s+/).filter(Boolean).length;

    const finding = findings[0];
    return {
      isThin: findings.length > 0,
      wordCount,
      threshold: minWords,
      finding: finding
        ? {
            ruleId: "spam/thin-content" as const,
            severity: "error" as const,
            confidence: finding.confidence ?? "high",
            message: finding.message,
            fix: finding.fix,
          }
        : null,
    };
  },
});
