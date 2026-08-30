import { describe, it, expect, vi } from "vitest";
import { createLanguageModel, detectProvider } from "../../src/ai/adapters/index.js";

const CLOUD_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "COHERE_API_KEY",
] as const;

function clearCloudEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const k of CLOUD_ENV_VARS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  return snapshot;
}

function restoreCloudEnv(snapshot: Record<string, string | undefined>): void {
  for (const k of CLOUD_ENV_VARS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
}

describe("createLanguageModel", () => {
  it("returns anthropic model when provider='anthropic'", async () => {
    const r = await createLanguageModel({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "test",
    });
    expect(r.providerId).toBe("anthropic");
    expect(r.modelId).toBe("claude-sonnet-4-6");
    expect(r.model).toBeDefined();
  });

  it("returns ollama model when provider='ollama'", async () => {
    const r = await createLanguageModel({ provider: "ollama", model: "llama3.1:8b" });
    expect(r.providerId).toBe("ollama");
    expect(r.modelId).toBe("llama3.1:8b");
    expect(r.model).toBeDefined();
  });

  it("uses default anthropic model when model unspecified", async () => {
    const r = await createLanguageModel({ provider: "anthropic", apiKey: "k" });
    expect(r.modelId).toBe("claude-sonnet-5");
  });

  it("uses default ollama model when model unspecified", async () => {
    const r = await createLanguageModel({ provider: "ollama" });
    expect(r.modelId).toBe("llama3.1:8b");
  });

  it("throws when no provider is available and auto-detect fails", async () => {
    const snapshot = clearCloudEnv();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      await expect(createLanguageModel({})).rejects.toThrow(
        /No AI provider detected.*ANTHROPIC_API_KEY.*OPENAI_API_KEY/s,
      );
    } finally {
      restoreCloudEnv(snapshot);
      vi.restoreAllMocks();
    }
  });

  it("throws with supported-list hint when provider is unknown", async () => {
    await expect(
      createLanguageModel({ provider: "banana", apiKey: "k" }),
    ).rejects.toThrow(/Unknown AI provider "banana".*Supported:.*anthropic.*ollama/s);
  });

  it("throws with install hint when chosen provider's SDK is missing", async () => {
    // This used to rely on @ai-sdk/openai simply not being installed in the dev
    // workspace. That is a property of the install, not of the code: the moment
    // the web app added the provider SDKs the package resolved, the assertion
    // inverted, and the test failed without the behaviour changing at all.
    // Force the failure instead, so the test covers the branch rather than the
    // contents of node_modules.
    vi.doMock("@ai-sdk/openai", () => {
      throw new Error("Cannot find module '@ai-sdk/openai'");
    });
    vi.resetModules();
    try {
      const { createLanguageModel: fresh } = await import("../../src/ai/adapters/index.js");
      await expect(
        fresh({ provider: "openai", apiKey: "test-key" }),
      ).rejects.toThrow(/requires "@ai-sdk\/openai".*npm install @ai-sdk\/openai/s);
    } finally {
      vi.doUnmock("@ai-sdk/openai");
      vi.resetModules();
    }
  });

  it("lists every registered provider with the metadata a UI needs", async () => {
    const { listSupportedProviders } = await import("../../src/ai/adapters/index.js");
    const providers = listSupportedProviders();
    const ids = providers.map((p) => p.id);
    // The registry is the single source of truth for callers that render a
    // provider picker; if one is dropped here, dashboards silently stop
    // offering it.
    expect(ids).toEqual(
      expect.arrayContaining(["anthropic", "openai", "google", "mistral", "groq", "xai", "cohere", "ollama"]),
    );
    for (const p of providers) {
      expect(p.defaultModel, `${p.id} needs a default model`).toBeTruthy();
      expect(p.pkg, `${p.id} needs a package`).toBeTruthy();
      // Only Ollama is keyless; every cloud provider must name its env var.
      if (p.kind === "cloud-apikey") expect(p.envVar, `${p.id} needs an env var`).toBeTruthy();
    }
  });

  it("reports whether a provider's SDK can actually be loaded", async () => {
    const { isProviderInstalled } = await import("../../src/ai/adapters/index.js");
    // Anthropic is a direct dev dependency of core, so it is always resolvable.
    await expect(isProviderInstalled("anthropic")).resolves.toBe(true);
    // An id that is not in the registry can never be installed.
    await expect(isProviderInstalled("banana")).resolves.toBe(false);
  });

  it("throws with env-var hint when cloud provider has no key", async () => {
    const snapshot = clearCloudEnv();
    try {
      await expect(
        createLanguageModel({ provider: "anthropic" }),
      ).rejects.toThrow(/needs an API key.*ANTHROPIC_API_KEY/s);
    } finally {
      restoreCloudEnv(snapshot);
    }
  });
});

describe("detectProvider", () => {
  it("returns 'anthropic' when ANTHROPIC_API_KEY is set", async () => {
    const snapshot = clearCloudEnv();
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      expect(await detectProvider()).toBe("anthropic");
    } finally {
      restoreCloudEnv(snapshot);
    }
  });

  it("prefers anthropic over openai when both keys are set", async () => {
    const snapshot = clearCloudEnv();
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENAI_API_KEY = "b";
    try {
      expect(await detectProvider()).toBe("anthropic");
    } finally {
      restoreCloudEnv(snapshot);
    }
  });

  it("returns 'openai' when only OPENAI_API_KEY is set", async () => {
    const snapshot = clearCloudEnv();
    process.env.OPENAI_API_KEY = "b";
    try {
      expect(await detectProvider()).toBe("openai");
    } finally {
      restoreCloudEnv(snapshot);
    }
  });

  it("returns 'ollama' when local daemon responds", async () => {
    const snapshot = clearCloudEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Ollama is running", { status: 200 }),
    );
    try {
      expect(await detectProvider()).toBe("ollama");
    } finally {
      restoreCloudEnv(snapshot);
      vi.restoreAllMocks();
    }
  });

  it("returns null when nothing is configured and no daemon is up", async () => {
    const snapshot = clearCloudEnv();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      expect(await detectProvider()).toBeNull();
    } finally {
      restoreCloudEnv(snapshot);
      vi.restoreAllMocks();
    }
  });
});
