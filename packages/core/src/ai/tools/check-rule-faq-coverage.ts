import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { faqCoverageRule } from "../../rules/aeo/faq-coverage.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
  minQuestionHeadings: z.number().int().nonnegative().max(20).optional(),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/faq-coverage"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleFaqCoverageTool = defineTool({
  name: "check_rule_faq_coverage",
  description:
    "Check whether FAQ-style pages have visible question headings that AI engines can quote. Pass pageIds for a sample of '/faq/*' or '/questions/*' URLs; returns warnings for pages that look like they should have Q&A structure but don't.",
  inputSchema,
  outputSchema,
  async execute({ pageIds, minQuestionHeadings }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = faqCoverageRule(
      parsed,
      minQuestionHeadings !== undefined ? { minQuestionHeadings } : undefined,
    );
    return {
      findings: findings.map((f) => ({
        ruleId: "aeo/faq-coverage" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
