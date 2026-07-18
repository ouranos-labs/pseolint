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
    // openai is an optional peer — we never installed it in the dev workspace,
    // so this should surface the install hint.
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    try {
      await expect(
        createLanguageModel({ provider: "openai" }),
      ).rejects.toThrow(/requires "@ai-sdk\/openai".*npm install @ai-sdk\/openai/s);
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }
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
