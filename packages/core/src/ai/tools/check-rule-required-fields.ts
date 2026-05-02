import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { requiredFieldsRule } from "../../rules/schema/required-fields.js";
import { resolvePages } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(50).describe("Page references from fetch_page."),
});

const outputSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.literal("schema/required-fields"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleRequiredFieldsTool = defineTool({
  name: "check_rule_required_fields",
  description:
    "For each JSON-LD block declaring an @type on the referenced pages, verify required Schema.org properties are present (Article: headline/datePublished/author; Product: name/offers; FAQPage: mainEntity; etc.). Flags missing fields per page so the orchestrator can propose `add_jsonld` patches with the correct shape.",
  inputSchema,
  outputSchema,
  async execute({ pageIds }) {
    const entries = resolvePages(pageIds);
    const parsed = entries.map((e) => parseHtmlPage(e.html, e.url));
    const findings = requiredFieldsRule(parsed);
    return {
      findings: findings.map((f) => ({
        ruleId: "schema/required-fields" as const,
        severity: f.severity,
        message: f.message,
        pageUrl: f.pageUrl,
        fix: f.fix,
      })),
    };
  },
});
