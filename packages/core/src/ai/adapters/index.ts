import type { LanguageModel } from "ai";
import type { AiOptions } from "../../types.js";

/**
 * How the provider factory is constructed from the imported SDK package.
 * - `cloud-apikey` — `factory({ apiKey })` then `provider(modelId)`.
 * - `ollama`       — `factory({ baseURL })` then `provider(modelId)`.
 */
export type ProviderKind = "cloud-apikey" | "ollama";

interface ProviderEntry {
  /** npm package name to dynamically import at runtime. */
  pkg: string;
  /** Named export from the package, e.g. `createAnthropic`. */
  factoryName: string;
  /** Env var that holds the API key. Optional — Ollama has none. */
  envVar?: string;
  /** Default model id when the user does not specify one. */
  defaultModel: string;
  kind: ProviderKind;
}

/**
 * Registry of supported AI SDK providers.
 *
 * To add a provider: drop a new entry here and publish the corresponding
 * `@ai-sdk/*` package as an optional peer dep in core's `package.json`.
 * Users install only the providers they use.
 */
const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
  anthropic: {
    pkg: "@ai-sdk/anthropic",
    factoryName: "createAnthropic",
    envVar: "ANTHROPIC_API_KEY",
    // General default for triage + orchestrator (not calibration-sensitive).
    // The content-effort JUDGE is pinned separately — see CONTENT_EFFORT_MODEL
    // in auditor.ts — because its verdict thresholds are tuned to one model's
    // score distribution and can't move without a re-calibration run.
    defaultModel: "claude-sonnet-5",
    kind: "cloud-apikey",
  },
  openai: {
    pkg: "@ai-sdk/openai",
    factoryName: "createOpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    kind: "cloud-apikey",
  },
  google: {
    pkg: "@ai-sdk/google",
    factoryName: "createGoogleGenerativeAI",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    kind: "cloud-apikey",
  },
  mistral: {
    pkg: "@ai-sdk/mistral",
    factoryName: "createMistral",
    envVar: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    kind: "cloud-apikey",
  },
  groq: {
    pkg: "@ai-sdk/groq",
    factoryName: "createGroq",
    envVar: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    kind: "cloud-apikey",
  },
  xai: {
    pkg: "@ai-sdk/xai",
    factoryName: "createXai",
    envVar: "XAI_API_KEY",
    defaultModel: "grok-2",
    kind: "cloud-apikey",
  },
  cohere: {
    pkg: "@ai-sdk/cohere",
    factoryName: "createCohere",
    envVar: "COHERE_API_KEY",
    defaultModel: "command-r-plus",
    kind: "cloud-apikey",
  },
  ollama: {
    pkg: "ollama-ai-provider-v2",
    factoryName: "createOllama",
    defaultModel: "llama3.1:8b",
    kind: "ollama",
  },
};

/** Known provider ids plus any user-supplied string (validated at runtime). */
export type ProviderId = keyof typeof PROVIDER_REGISTRY | (string & {});

export interface ResolvedModel {
  model: LanguageModel;
  providerId: string;
  modelId: string;
}

const OLLAMA_DETECT_TIMEOUT_MS = 500;
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";

/** Cloud providers checked in priority order during auto-detection. */
const CLOUD_DETECT_ORDER = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "groq",
  "xai",
  "cohere",
] as const;

/**
 * Best-effort provider auto-detection.
 *
 * Resolution order:
 *   1. First cloud provider (in `CLOUD_DETECT_ORDER`) with its env var set.
 *   2. Ollama daemon responding at `<endpoint>/` → "ollama".
 *   3. Otherwise `null`.
 */
export async function detectProvider(endpoint?: string): Promise<string | null> {
  for (const id of CLOUD_DETECT_ORDER) {
    const entry = PROVIDER_REGISTRY[id];
    if (entry?.envVar && process.env[entry.envVar]) return id;
  }
  const url = (endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, "") + "/";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OLLAMA_DETECT_TIMEOUT_MS);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status >= 200 && res.status < 500) return "ollama";
    return null;
  } catch {
    return null;
  }
}

function supportedProviderList(): string {
  return Object.keys(PROVIDER_REGISTRY).join(", ");
}

function envVarList(): string {
  return CLOUD_DETECT_ORDER
    .map((id) => PROVIDER_REGISTRY[id]?.envVar)
    .filter((v): v is string => Boolean(v))
    .join(", ");
}

/**
 * Resolve an AI SDK `LanguageModel` for the requested (or auto-detected) provider.
 *
 * Provider SDKs are loaded lazily via dynamic `import(specifier)` so unused
 * providers don't need to be installed. If the chosen provider's package is
 * missing, the error message includes an install hint.
 */
export async function createLanguageModel(config: AiOptions): Promise<ResolvedModel> {
  const providerId = config.provider ?? (await detectProvider(config.endpoint));
  if (!providerId) {
    throw new Error(
      `No AI provider detected. Set an API key env var (${envVarList()}), run Ollama locally, or pass --ai-provider explicitly.`,
    );
  }

  const entry = PROVIDER_REGISTRY[providerId];
  if (!entry) {
    throw new Error(
      `Unknown AI provider "${providerId}". Supported: ${supportedProviderList()}. To add a provider, submit a PR with an entry in PROVIDER_REGISTRY.`,
    );
  }

  let pkgExports: Record<string, unknown>;
  try {
    // Variable specifier — prevents tsc from trying to resolve the module at build time.
    const specifier = entry.pkg;
    pkgExports = (await import(specifier)) as Record<string, unknown>;
  } catch (e) {
    const original = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Provider "${providerId}" requires "${entry.pkg}". Install it with: npm install ${entry.pkg}\nOriginal: ${original}`,
    );
  }

  const factory = pkgExports[entry.factoryName] as
    | ((opts: unknown) => unknown)
    | undefined;
  if (typeof factory !== "function") {
    throw new Error(
      `Provider "${providerId}": package "${entry.pkg}" does not export "${entry.factoryName}"`,
    );
  }

  const modelId = config.model ?? entry.defaultModel;

  if (entry.kind === "ollama") {
    const baseURL =
      (config.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, "") + "/api";
    const ollama = factory({ baseURL }) as (id: string) => LanguageModel;
    return { model: ollama(modelId), providerId, modelId };
  }

  // cloud-apikey
  const apiKey = config.apiKey ?? (entry.envVar ? process.env[entry.envVar] : undefined);
  if (!apiKey) {
    throw new Error(
      `Provider "${providerId}" needs an API key. Set ${entry.envVar} or pass --ai-key / ai.apiKey.`,
    );
  }
  const provider = factory({ apiKey }) as (id: string) => LanguageModel;
  return { model: provider(modelId), providerId, modelId };
}
