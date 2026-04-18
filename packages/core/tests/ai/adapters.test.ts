import { describe, it, expect, vi } from "vitest";
import { createLanguageModel, detectProvider } from "../../src/ai/adapters/index.js";

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
    expect(r.modelId).toBe("claude-sonnet-4-6");
  });

  it("uses default ollama model when model unspecified", async () => {
    const r = await createLanguageModel({ provider: "ollama" });
    expect(r.modelId).toBe("llama3.1:8b");
  });

  it("throws when no provider is available and auto-detect fails", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      await expect(createLanguageModel({})).rejects.toThrow(/No AI provider/);
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
      vi.restoreAllMocks();
    }
  });
});

describe("detectProvider", () => {
  it("returns 'anthropic' when ANTHROPIC_API_KEY is set", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      expect(await detectProvider()).toBe("anthropic");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns 'ollama' when local daemon responds", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Ollama is running", { status: 200 }),
    );
    try {
      expect(await detectProvider()).toBe("ollama");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
      vi.restoreAllMocks();
    }
  });

  it("returns null when nothing is configured and no daemon is up", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      expect(await detectProvider()).toBeNull();
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
      vi.restoreAllMocks();
    }
  });
});
