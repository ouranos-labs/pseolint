import { z } from "zod";
import { llmsTxtRule } from "../../rules/aeo/llms-txt.js";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  origin: z
    .string()
    .url()
    .describe("Site origin (e.g. https://example.com). The tool fetches /llms.txt automatically."),
  timeoutMs: z.number().int().positive().max(15_000).optional(),
});

const outputSchema = z.object({
  origin: z.string(),
  llmsTxtUrl: z.string(),
  found: z.boolean(),
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/llms-txt"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      fix: z.string().optional(),
    }),
  ),
});

/**
 * Domain-level AEO check: does the site publish a valid /llms.txt? Wraps
 * `llmsTxtRule` with a built-in fetcher that goes through the SSRF guard.
 *
 * Unlike the per-page rules, this is called once per domain: the
 * orchestrator typically calls this near the top of the audit alongside
 * `check_domain_crawler_access`.
 */
export const checkDomainLlmsTxtTool = defineTool({
  name: "check_domain_llms_txt",
  description:
    "Check whether the site publishes a valid /llms.txt file (the emerging AEO standard for telling LLMs which content to ingest and how). Call once per domain near the start of an audit. Returns `found: false` when the file is absent; that itself is informational, not a hard error.",
  inputSchema,
  outputSchema,
  async execute({ origin, timeoutMs = 10_000 }, ctx) {
    const validateHop = async (hopUrl: string): Promise<void> => {
      let host: string;
      try {
        host = new URL(hopUrl).hostname;
      } catch {
        throw new Error(`check_domain_llms_txt: invalid URL ${hopUrl}`);
      }
      await validateTargetHost(host);
    };

    const fetcher = async (url: string): Promise<string | null> => {
      try {
        const res = await cachedFetch(url, { timeoutMs, cache: null, validateHop, signal: ctx?.signal });
        if (res.status >= 200 && res.status < 300) return res.body;
        return null;
      } catch {
        return null;
      }
    };

    const findings = await llmsTxtRule(origin, fetcher);
    const llmsTxtUrl = `${new URL(origin).origin}/llms.txt`;
    const found = !findings.some((f) => /not found|missing/i.test(f.message));

    return {
      origin: new URL(origin).origin,
      llmsTxtUrl,
      found,
      findings: findings.map((f) => ({
        ruleId: "aeo/llms-txt" as const,
        severity: f.severity,
        message: f.message,
        fix: f.fix,
      })),
    };
  },
});
