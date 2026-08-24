import { z } from "zod";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { probeCacheKey, readProbeCache, writeProbeCache } from "../probes/cache.js";
import { defineTool } from "./types.js";

const ENGINES = ["anthropic", "perplexity", "gemini"] as const;

const inputSchema = z.object({
  engine: z.enum(ENGINES),
  query: z.string().min(1).max(500),
  candidateUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "When provided, the tool reports whether the engine cited this URL in its answer. Used for AEO citability probes: does ChatGPT/Claude/Perplexity cite *your* page when asked the question your page is targeting?",
    ),
  apiKey: z
    .string()
    .min(8)
    .optional()
    .describe(
      "Engine-specific API key. Falls back to ANTHROPIC_API_KEY / PERPLEXITY_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY env vars.",
    ),
  cacheDir: z.string().optional(),
});

const outputSchema = z.object({
  engine: z.enum(ENGINES),
  query: z.string(),
  answer: z.string(),
  citedUrls: z.array(z.string()),
  candidateCited: z.boolean().nullable(),
  fromCache: z.boolean(),
  /**
   * Approximate cost of this call, in USD. The orchestrator's BudgetTracker
   * sums these into the session-level USD cap. Cache hits report 0.
   */
  apiCostUsd: z.number().nonnegative(),
});

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Per-call estimated cost, USD. Conservative midpoints. */
const COST_BY_ENGINE_USD: Record<typeof ENGINES[number], number> = {
  anthropic: 0.003,
  perplexity: 0.001,
  gemini: 0.001,
};

type AskOutput = z.infer<typeof outputSchema>;

const URL_RE = /https?:\/\/[^\s<>"\)\]]+/g;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return Array.from(new Set(matches));
}

function hostMatches(citedUrl: string, candidateUrl: string): boolean {
  try {
    return new URL(citedUrl).hostname === new URL(candidateUrl).hostname;
  } catch {
    return false;
  }
}

async function validateHostHop(hopUrl: string, label: string): Promise<void> {
  let host: string;
  try {
    host = new URL(hopUrl).hostname;
  } catch {
    throw new Error(`${label}: invalid URL ${hopUrl}`);
  }
  await validateTargetHost(host);
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
}

async function askAnthropic(query: string, apiKey: string, signal?: AbortSignal): Promise<{ answer: string; citedUrls: string[] }> {
  await validateHostHop("https://api.anthropic.com", "ask_ai_engine");
  const res = await cachedFetch("https://api.anthropic.com/v1/messages", {
    timeoutMs: 30_000,
    cache: null,
    signal,
    fetcher: async (url, init) =>
      fetch(url, {
        ...init,
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: `Answer this in 2-3 sentences. If you cite specific webpages, include their URLs verbatim in your answer.\n\nQuestion: ${query}`,
            },
          ],
        }),
      }),
  });
  if (res.status >= 400) {
    throw new Error(`ask_ai_engine[anthropic]: HTTP ${res.status}`);
  }
  const payload = JSON.parse(res.body) as AnthropicResponse;
  if (payload.error) {
    throw new Error(`ask_ai_engine[anthropic]: ${payload.error.message ?? "unknown error"}`);
  }
  const answer = (payload.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
  return { answer, citedUrls: extractUrls(answer) };
}

interface PerplexityResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  error?: { message?: string };
}

async function askPerplexity(query: string, apiKey: string, signal?: AbortSignal): Promise<{ answer: string; citedUrls: string[] }> {
  await validateHostHop("https://api.perplexity.ai", "ask_ai_engine");
  const res = await cachedFetch("https://api.perplexity.ai/chat/completions", {
    timeoutMs: 30_000,
    cache: null,
    signal,
    fetcher: async (url, init) =>
      fetch(url, {
        ...init,
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: query }],
          max_tokens: 600,
        }),
      }),
  });
  if (res.status >= 400) {
    throw new Error(`ask_ai_engine[perplexity]: HTTP ${res.status}`);
  }
  const payload = JSON.parse(res.body) as PerplexityResponse;
  if (payload.error) {
    throw new Error(`ask_ai_engine[perplexity]: ${payload.error.message ?? "unknown error"}`);
  }
  const answer = payload.choices?.[0]?.message?.content ?? "";
  // Perplexity surfaces citations natively: prefer them, fall back to inline URL extraction.
  const citedUrls = payload.citations && payload.citations.length > 0
    ? Array.from(new Set(payload.citations))
    : extractUrls(answer);
  return { answer, citedUrls };
}

interface GeminiCitation {
  startIndex?: number;
  endIndex?: number;
  uri?: string;
  title?: string;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  citationMetadata?: { citationSources?: GeminiCitation[] };
  groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

async function askGemini(query: string, apiKey: string, signal?: AbortSignal): Promise<{ answer: string; citedUrls: string[] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  await validateHostHop(url, "ask_ai_engine");
  const res = await cachedFetch(url, {
    timeoutMs: 30_000,
    cache: null,
    signal,
    fetcher: async (u, init) =>
      fetch(u, {
        ...init,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          tools: [{ googleSearchRetrieval: {} }],
        }),
      }),
  });
  if (res.status >= 400) {
    throw new Error(`ask_ai_engine[gemini]: HTTP ${res.status}`);
  }
  const payload = JSON.parse(res.body) as GeminiResponse;
  if (payload.error) {
    throw new Error(`ask_ai_engine[gemini]: ${payload.error.message ?? "unknown error"}`);
  }
  const candidate = payload.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  const citedUrls = new Set<string>();
  for (const c of candidate?.citationMetadata?.citationSources ?? []) {
    if (c.uri) citedUrls.add(c.uri);
  }
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri) citedUrls.add(chunk.web.uri);
  }
  if (citedUrls.size === 0) {
    for (const u of extractUrls(answer)) citedUrls.add(u);
  }
  return { answer, citedUrls: Array.from(citedUrls) };
}

/**
 * Probe an AI answer engine with a query. The whole point of this tool:
 * the AEO citability check: is to ask the same engines users will ask
 * and see whether they cite the page being audited. No proxies, no
 * heuristics. The cited-URLs list comes back, and if `candidateUrl` is
 * provided we report whether it (by hostname) appears.
 *
 * Provider key resolution: explicit `apiKey` arg → engine-specific env
 * var. Cached for 24h on `engine + query`: same query against the same
 * engine reliably hits the same answer for the cache window.
 */
export const askAiEngineTool = defineTool({
  name: "ask_ai_engine",
  description:
    "Ask an AI answer engine (Anthropic, Perplexity, or Gemini) a query and report what it answered + which URLs it cited. Pass `candidateUrl` to check whether the engine cited that specific page (by hostname). This is the literal AEO citability test, no heuristic, no proxy, just measurement. Cached 24h per (engine, query). Costs vary: Anthropic ~$0.003/call, Perplexity ~$0.001, Gemini ~$0.001.",
  inputSchema,
  outputSchema,
  async execute({ engine, query, candidateUrl, apiKey, cacheDir }, ctx): Promise<AskOutput> {
    const envKey =
      engine === "anthropic" ? process.env.ANTHROPIC_API_KEY :
      engine === "perplexity" ? process.env.PERPLEXITY_API_KEY :
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const key = apiKey ?? envKey;
    if (!key) {
      const envVar =
        engine === "anthropic" ? "ANTHROPIC_API_KEY" :
        engine === "perplexity" ? "PERPLEXITY_API_KEY" :
        "GOOGLE_GENERATIVE_AI_API_KEY";
      throw new Error(`ask_ai_engine: no API key for ${engine} (pass apiKey or set ${envVar})`);
    }

    if (cacheDir) {
      const cacheKey = probeCacheKey("ask_ai_engine", engine, query);
      const cached = await readProbeCache<AskOutput>(cacheDir, cacheKey, DEFAULT_TTL_MS);
      if (cached) {
        // Cache hits don't bill: re-evaluate candidateCited against the
        // cached citations so a different `candidateUrl` still gets a
        // correct answer without a fresh fetch.
        const candidateCited = candidateUrl
          ? cached.citedUrls.some((u) => hostMatches(u, candidateUrl))
          : null;
        return { ...cached, candidateCited, fromCache: true, apiCostUsd: 0 };
      }
    }

    let probe: { answer: string; citedUrls: string[] };
    if (engine === "anthropic") {
      probe = await askAnthropic(query, key, ctx?.signal);
    } else if (engine === "perplexity") {
      probe = await askPerplexity(query, key, ctx?.signal);
    } else {
      probe = await askGemini(query, key, ctx?.signal);
    }

    const candidateCited = candidateUrl
      ? probe.citedUrls.some((u) => hostMatches(u, candidateUrl))
      : null;

    const result: AskOutput = {
      engine,
      query,
      answer: probe.answer,
      citedUrls: probe.citedUrls,
      candidateCited,
      fromCache: false,
      apiCostUsd: COST_BY_ENGINE_USD[engine],
    };

    if (cacheDir) {
      try {
        const cacheKey = probeCacheKey("ask_ai_engine", engine, query);
        await writeProbeCache(cacheDir, cacheKey, result);
      } catch {
        // Cache write failures are non-fatal.
      }
    }

    return result;
  },
});
