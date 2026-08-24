import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { answerFirstRule } from "../../rules/aeo/answer-first.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
  maxFirstParagraphWords: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe("Opener should fit under this many words to count as extractable. Default 100."),
});

const outputSchema = z.object({
  finding: z
    .object({
      ruleId: z.literal("aeo/answer-first"),
      severity: z.enum(["warning", "error"]),
      confidence: z.enum(["high", "medium", "low", "speculative"]),
      message: z.string(),
      fix: z.string().optional(),
    })
    .nullable(),
});

export const checkRuleAnswerFirstTool = defineTool({
  name: "check_rule_answer_first",
  description:
    "Check whether a previously-fetched page opens with a direct, extractable answer (concrete fact, named entity, complete sentence, <100 words). Critical for AI Overview / Perplexity citability. Returns a finding when the opener is boilerplate, too long, or lacks specifics. Note: cross-page template detection (same opener across N pages) is NOT done here, call this per page and aggregate identical openers yourself.",
  inputSchema,
  outputSchema,
  async execute({ pageId, maxFirstParagraphWords = 100 }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const findings = answerFirstRule([parsed], [], { maxFirstParagraphWords });
    const finding = findings[0];

    return {
      finding: finding
        ? {
            ruleId: "aeo/answer-first" as const,
            severity: finding.severity === "error" ? ("error" as const) : ("warning" as const),
            confidence: finding.confidence ?? "medium",
            message: finding.message,
            fix: finding.fix,
          }
        : null,
    };
  },
});
