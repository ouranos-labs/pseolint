import "server-only";
import { listSupportedProviders, isProviderInstalled } from "@pseolint/core";

/**
 * Display metadata for the bring-your-own-key form.
 *
 * The *list* of providers is not defined here: it comes from core's registry
 * via `listSupportedProviders()`. This file only adds the things a registry has
 * no business knowing (a human label, where to get a key, what the key looks
 * like). Anything in core but missing here still renders, with fallbacks.
 *
 * That split is deliberate. The dashboard previously hardcoded its own
 * four-provider list; two of those four had no installed SDK, so the key saved
 * fine and the audit failed later with an install error nobody saw. A provider
 * can no longer appear in the UI unless core actually knows how to build it.
 */
type Display = {
  label: string;
  /** What the vendor calls its models, for the option row. */
  family?: string;
  /** Where to get a key. */
  consoleUrl?: string;
  /** Recognisable prefix, used only as a hint and a soft client-side warning. */
  keyPrefix?: string;
};

const DISPLAY: Record<string, Display> = {
  anthropic: {
    label: "Anthropic",
    family: "Claude",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
  },
  openai: {
    label: "OpenAI",
    family: "GPT",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
  google: {
    label: "Google",
    family: "Gemini",
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  mistral: {
    label: "Mistral",
    family: "Mistral",
    consoleUrl: "https://console.mistral.ai/api-keys",
  },
  groq: {
    label: "Groq",
    family: "Llama, Kimi, Qwen",
    consoleUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
  },
  xai: {
    label: "xAI",
    family: "Grok",
    consoleUrl: "https://console.x.ai",
    keyPrefix: "xai-",
  },
  cohere: {
    label: "Cohere",
    family: "Command",
    consoleUrl: "https://dashboard.cohere.com/api-keys",
  },
  ollama: {
    label: "Ollama",
    family: "self-hosted",
    consoleUrl: "https://ollama.com/download",
  },
};

export type AiProviderOption = {
  id: string;
  label: string;
  family?: string;
  consoleUrl?: string;
  keyPrefix?: string;
  defaultModel: string;
  /** Ollama needs a base URL, not a key. */
  needsKey: boolean;
  /** False when the SDK is not resolvable here: rendered disabled, not hidden. */
  installed: boolean;
};

/**
 * Every provider core knows about, each flagged with whether its SDK can
 * actually be loaded in this deployment.
 *
 * Unavailable providers are returned rather than filtered out so the UI can say
 * "not available on this deployment" instead of silently shrinking the list,
 * which is how the original gap stayed invisible for so long.
 */
let cached: Promise<AiProviderOption[]> | null = null;

export function aiProviderOptions(): Promise<AiProviderOption[]> {
  // Memoised for the life of the process: which SDKs are installed is fixed by
  // the deployment and cannot change at runtime, and the probe is 8 dynamic
  // imports. Recomputing it on every page render would load every provider SDK
  // on every request to earn an answer that is already known.
  cached ??= computeProviderOptions();
  return cached;
}

async function computeProviderOptions(): Promise<AiProviderOption[]> {
  const registry = listSupportedProviders();
  const installed = await Promise.all(registry.map((p) => isProviderInstalled(p.id)));
  return registry.map((p, i) => ({
    id: p.id,
    label: DISPLAY[p.id]?.label ?? p.id,
    family: DISPLAY[p.id]?.family,
    consoleUrl: DISPLAY[p.id]?.consoleUrl,
    keyPrefix: DISPLAY[p.id]?.keyPrefix,
    defaultModel: p.defaultModel,
    needsKey: p.kind !== "ollama",
    installed: installed[i],
  }));
}

/** Provider ids core will accept. The server action validates against this. */
export function knownProviderIds(): Set<string> {
  return new Set(listSupportedProviders().map((p) => p.id));
}
