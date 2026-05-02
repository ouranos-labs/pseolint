import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { jsonLdValidRule } from "../../rules/schema/json-ld-valid.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
});

const outputSchema = z.object({
  jsonLdBlockCount: z.number().int().nonnegative(),
  hasParseError: z.boolean(),
  findings: z.array(
    z.object({
      ruleId: z.literal("schema/json-ld-valid"),
      severity: z.literal("error"),
      message: z.string(),
      fix: z.string().optional(),
    }),
  ),
});

export const checkRuleJsonLdValidTool = defineTool({
  name: "check_rule_json_ld_valid",
  description:
    "Validate JSON-LD blocks on a previously-fetched page for parse errors, missing @context, and invalid @type values. Reports one finding per malformed block. For Schema.org-spec compliance (required properties per type), use validate_jsonld.",
  inputSchema,
  outputSchema,
  async execute({ pageId }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const hasParseError = parsed.jsonLd.some(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        "__parseError" in e &&
        (e as Record<string, unknown>).__parseError === true,
    );
    const findings = jsonLdValidRule([parsed]);

    return {
      jsonLdBlockCount: parsed.jsonLd.length,
      hasParseError,
      findings: findings.map((f) => ({
        ruleId: "schema/json-ld-valid" as const,
        severity: "error" as const,
        message: f.message,
        fix: f.fix,
      })),
    };
  },
});
