import { z } from "zod";
import { cachedFetch } from "../../cache.js";
import { currentPageCache } from "../orchestrator/page-cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  url: z.string().url().describe("Absolute http(s) URL to fetch."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30_000)
    .optional()
    .describe("Per-request timeout. Default 10s, max 30s."),
  cacheDir: z
    .string()
    .optional()
    .describe(
      "Directory to read/write cache entries. Omit to disable caching. Orchestrator typically passes a session-scoped temp dir.",
    ),
  cacheTtlMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Cache TTL for entries without ETag/Last-Modified validators. Default 5 minutes."),
});

const outputSchema = z.object({
  url: z.string().describe("Final URL after following up to 10 redirects."),
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  /**
   * Reference to the cached page body. Pass this `pageId` into parse_page,
   * check_rule_*, validate_jsonld, check_indexability, etc. — the HTML
   * itself never travels through the LLM conversation, which keeps token
   * consumption bounded as the orchestrator pulls more pages.
   */
  pageId: z.string(),
  /** First 500 chars of the body for at-a-glance reasoning. The LLM should NOT base rule decisions on this; it's a sniff aid. */
  bodyExcerpt: z.string(),
  fromCache: z.boolean(),
  bodyBytes: z.number().int().nonnegative(),
});

/**
 * SSRF-guarded HTTP fetch with optional disk cache. Wraps the existing
 * `cachedFetch` primitive plus `validateTargetHost` so private/reserved IPs
 * are rejected on every redirect hop.
 *
 * Returned as a tool to the orchestrator — typically the first call the
 * model makes when auditing a domain.
 */
export const fetchPageTool = defineTool({
  name: "fetch_page",
  description:
    "Fetch the HTML for a single URL with SSRF protection and disk caching. Follows up to 10 redirects. Returns the final URL, status, headers, and a `pageId` reference to the cached body — pass that pageId into parse_page / check_rule_* / validate_jsonld / check_indexability instead of repassing HTML. The HTML itself never travels through tool inputs, keeping token consumption bounded. Errors (private IP, redirect loop, timeout) come back as tool errors — keep going with another URL.",
  inputSchema,
  outputSchema,
  async execute({ url, timeoutMs = 10_000, cacheDir, cacheTtlMs = 300_000 }, ctx) {
    const validateHop = async (hopUrl: string): Promise<void> => {
      let host: string;
      try {
        host = new URL(hopUrl).hostname;
      } catch {
        throw new Error(`fetch_page: invalid URL ${hopUrl}`);
      }
      await validateTargetHost(host);
    };

    const result = await cachedFetch(url, {
      timeoutMs,
      cache: cacheDir ? { dir: cacheDir, ttlMs: cacheTtlMs } : null,
      validateHop,
      signal: ctx?.signal,
    });

    const cache = currentPageCache();
    if (!cache) {
      throw new Error(
        "fetch_page: no page cache in scope (orchestrator runner must wrap generateText in withPageCache)",
      );
    }
    const pageId = cache.put({
      url: result.url,
      html: result.body,
      status: result.status,
      headers: result.headers,
    });

    return {
      url: result.url,
      status: result.status,
      headers: result.headers,
      pageId,
      bodyExcerpt: result.body.slice(0, 500),
      fromCache: result.fromCache,
      bodyBytes: result.body.length,
    };
  },
});
