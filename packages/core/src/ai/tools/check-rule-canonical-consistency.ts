import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { canonicalConsistencyRule } from "../../rules/tech/canonical-consistency.js";
import { mergeNormalizeUrlOptions } from "../../url-normalize.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
  knownUrls: z
    .array(z.string())
    .optional()
    .describe(
      "Other URLs already crawled in this audit. Lets the rule classify cross-page canonicalization severity (warning when canonical points to a known URL; info when it points outside).",
    ),
});

const outputSchema = z.object({
  hasCanonical: z.boolean(),
  canonicalUrl: z.string().nullable(),
  selfReferencing: z.boolean(),
  findings: z.array(
    z.object({
      ruleId: z.literal("tech/canonical-consistency"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      fix: z.string().optional(),
      relatedUrls: z.array(z.string()).optional(),
    }),
  ),
});

export const checkRuleCanonicalConsistencyTool = defineTool({
  name: "check_rule_canonical_consistency",
  description:
    "Check the canonical tag on a previously-fetched page: missing, invalid, points to another crawled page, or HTTP-Link/HTML-link mismatch. Pass `knownUrls` (URLs crawled so far) to differentiate cross-page canonicals from external ones. Returns 0-2 findings depending on what's wrong.",
  inputSchema,
  outputSchema,
  async execute({ pageId, knownUrls = [] }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const known = new Set(knownUrls);
    const normalizeOpts = mergeNormalizeUrlOptions();
    const findings = canonicalConsistencyRule([parsed], known, normalizeOpts);

    return {
      hasCanonical: parsed.canonical !== "",
      canonicalUrl: parsed.canonical || null,
      selfReferencing: parsed.canonical === parsed.url,
      findings: findings.map((f) => ({
        ruleId: "tech/canonical-consistency" as const,
        severity: f.severity,
        message: f.message,
        fix: f.fix,
        relatedUrls: f.relatedUrls,
      })),
    };
  },
});
