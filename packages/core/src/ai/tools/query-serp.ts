import { z } from "zod";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  keyword: z.string().min(1).max(200),
  locale: z
    .string()
    .length(2)
    .toLowerCase()
    .optional()
    .describe("ISO 3166-1 alpha-2 country code (e.g. 'us', 'de'). Default 'us'."),
  language: z
    .string()
    .length(2)
    .toLowerCase()
    .optional()
    .describe("ISO 639-1 language code (e.g. 'en', 'es'). Default 'en'."),
  num: z.number().int().min(1).max(20).optional().describe("Number of organic results to return. Default 10."),
  apiKey: z
    .string()
    .min(8)
    .optional()
    .describe("SerpAPI key. Falls back to SERPAPI_API_KEY env var."),
  cacheDir: z.string().optional(),
});

const organicResultSchema = z.object({
  position: z.number().int().nonnegative(),
  title: z.string(),
  url: z.string(),
  snippet: z.string().nullable(),
  source: z.string().nullable(),
});

const outputSchema = z.object({
  keyword: z.string(),
  locale: z.string(),
  language: z.string(),
  resultCount: z.number().int().nonnegative(),
  organicResults: z.array(organicResultSchema),
  hasAnswerBox: z.boolean(),
  hasKnowledgeGraph: z.boolean(),
  fromCache: z.boolean(),
  /**
   * Approximate cost of this call, in USD. The orchestrator's BudgetTracker
   * sums these into the session-level USD cap. Cache hits report 0.
   */
  apiCostUsd: z.number().nonnegative(),
});

const COST_PER_QUERY_USD = 0.005;

const SERPAPI_BASE = "https://serpapi.com/search.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface SerpApiOrganic {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganic[];
  answer_box?: unknown;
  knowledge_graph?: unknown;
  error?: string;
}

/**
 * Google SERP query via SerpAPI. Caches responses by `keyword + locale +
 * language + num` for 24h via `cachedFetch`. The orchestrator typically
 * calls this when proposing AEO improvements — knowing what currently
 * ranks for a target query informs whether the page being audited has a
 * realistic shot at displacing the incumbents.
 *
 * SerpAPI key resolution order: explicit `apiKey` arg → `SERPAPI_API_KEY`
 * env var. Tool returns an error result when no key is available — the
 * orchestrator should skip this probe rather than retry.
 */
export const querySerpTool = defineTool({
  name: "query_serp",
  description:
    "Query Google SERP (via SerpAPI) for a keyword. Returns organic results (position, title, URL, snippet) plus flags for answer-box and knowledge-graph presence. Use this when proposing AEO improvements — knowing what currently ranks informs realistic positioning. Caches responses for 24h. Costs ~$0.005 per call.",
  inputSchema,
  outputSchema,
  async execute({ keyword, locale = "us", language = "en", num = 10, apiKey, cacheDir }, ctx) {
    const key = apiKey ?? process.env.SERPAPI_API_KEY;
    if (!key) {
      throw new Error("query_serp: no SerpAPI key (pass apiKey or set SERPAPI_API_KEY)");
    }

    const params = new URLSearchParams({
      engine: "google",
      q: keyword,
      gl: locale,
      hl: language,
      num: String(num),
      api_key: key,
    });
    const url = `${SERPAPI_BASE}?${params.toString()}`;

    const validateHop = async (hopUrl: string): Promise<void> => {
      let host: string;
      try {
        host = new URL(hopUrl).hostname;
      } catch {
        throw new Error(`query_serp: invalid URL ${hopUrl}`);
      }
      await validateTargetHost(host);
    };

    const result = await cachedFetch(url, {
      timeoutMs: 15_000,
      cache: cacheDir ? { dir: cacheDir, ttlMs: DEFAULT_TTL_MS } : null,
      validateHop,
      signal: ctx?.signal,
    });

    if (result.status >= 400) {
      throw new Error(`query_serp: SerpAPI returned ${result.status}`);
    }

    let payload: SerpApiResponse;
    try {
      payload = JSON.parse(result.body) as SerpApiResponse;
    } catch {
      throw new Error("query_serp: SerpAPI response was not valid JSON");
    }

    if (payload.error) {
      throw new Error(`query_serp: ${payload.error}`);
    }

    const organicResults = (payload.organic_results ?? []).map((r): {
      position: number;
      title: string;
      url: string;
      snippet: string | null;
      source: string | null;
    } => ({
      position: r.position ?? 0,
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? null,
      source: r.source ?? null,
    }));

    return {
      keyword,
      locale,
      language,
      resultCount: organicResults.length,
      organicResults,
      hasAnswerBox: payload.answer_box !== undefined,
      hasKnowledgeGraph: payload.knowledge_graph !== undefined,
      fromCache: result.fromCache,
      apiCostUsd: result.fromCache ? 0 : COST_PER_QUERY_USD,
    };
  },
});
