import { z } from "zod";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  sitemapUrl: z
    .string()
    .url()
    .describe("Absolute URL of the sitemap.xml (or sitemap index)."),
  maxUrls: z
    .number()
    .int()
    .positive()
    .max(50_000)
    .optional()
    .describe("Hard cap on URLs returned. Default 5000."),
  maxDepth: z
    .number()
    .int()
    .nonnegative()
    .max(3)
    .optional()
    .describe("Maximum sitemap-index recursion depth. Default 1 (root + one level of nested sitemaps)."),
  timeoutMs: z.number().int().positive().max(30_000).optional(),
});

const outputSchema = z.object({
  rootUrl: z.string(),
  urlCount: z.number().int().nonnegative(),
  urls: z.array(z.string()),
  truncated: z.boolean().describe("True when output was capped by maxUrls."),
  childSitemaps: z.array(z.string()).describe("Discovered child sitemap URLs (whether followed or not)."),
});

const LOC_RE = /<loc>([\s\S]*?)<\/loc>/gi;

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = LOC_RE.exec(xml)) !== null) {
    out.push(match[1].trim());
  }
  LOC_RE.lastIndex = 0;
  return out;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function fetchXml(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const validateHop = async (hopUrl: string): Promise<void> => {
    let host: string;
    try {
      host = new URL(hopUrl).hostname;
    } catch {
      throw new Error(`fetch_sitemap: invalid URL ${hopUrl}`);
    }
    await validateTargetHost(host);
  };

  const result = await cachedFetch(url, { timeoutMs, cache: null, validateHop, signal });
  if (result.status >= 400) {
    throw new Error(`fetch_sitemap: ${url} returned status ${result.status}`);
  }
  return result.body;
}

/**
 * Fetch + parse sitemap.xml, optionally recursing into a sitemap index. Caps
 * the URL list at `maxUrls` so a 50K-URL sitemap doesn't blow up the model
 * context. Reports `truncated: true` when the cap fires — the LLM should then
 * call `sample_template` with the returned subset.
 */
export const fetchSitemapTool = defineTool({
  name: "fetch_sitemap",
  description:
    "Fetch a sitemap.xml and return its URL list. Handles sitemap-index recursion (one level by default). Capped at 5000 URLs by default — use detect_templates + sample_template afterwards to pick a representative sample for auditing. Returns `truncated: true` when capped.",
  inputSchema,
  outputSchema,
  async execute({ sitemapUrl, maxUrls = 5000, maxDepth = 1, timeoutMs = 15_000 }, ctx) {
    const rootXml = await fetchXml(sitemapUrl, timeoutMs, ctx?.signal);
    const childSitemaps: string[] = [];
    const urls: string[] = [];

    if (isSitemapIndex(rootXml) && maxDepth > 0) {
      const childUrls = extractLocs(rootXml);
      for (const u of childUrls) childSitemaps.push(u);
      for (const child of childUrls) {
        if (urls.length >= maxUrls) break;
        try {
          const childXml = await fetchXml(child, timeoutMs, ctx?.signal);
          const childLocs = extractLocs(childXml);
          for (const u of childLocs) {
            if (urls.length >= maxUrls) break;
            urls.push(u);
          }
        } catch {
          // Skip unreachable child sitemaps; root sitemap may be misconfigured
          // but we want to return whatever we did get.
        }
      }
    } else {
      const locs = extractLocs(rootXml);
      for (const u of locs) {
        if (urls.length >= maxUrls) break;
        urls.push(u);
      }
    }

    return {
      rootUrl: sitemapUrl,
      urlCount: urls.length,
      urls,
      truncated: urls.length >= maxUrls,
      childSitemaps,
    };
  },
});
