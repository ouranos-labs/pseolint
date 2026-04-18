import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdapter, detectProvider } from "../../../src/ai/adapters/index.js";

describe("createAdapter (explicit provider)", () => {
  it("creates anthropic adapter when provider='anthropic'", async () => {
    const ad = await createAdapter({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "k",
    });
    expect(ad.id).toBe("anthropic");
  });

  it("creates ollama adapter when provider='ollama'", async () => {
    const ad = await createAdapter({ provider: "ollama", model: "llama3.1:8b" });
    expect(ad.id).toBe("ollama");
  });

  it("uses default model when none given (anthropic)", async () => {
    const ad = await createAdapter({ provider: "anthropic", apiKey: "k" });
    expect(ad.model).toBe("claude-sonnet-4-6");
  });

  it("uses default model when none given (ollama)", async () => {
    const ad = await createAdapter({ provider: "ollama" });
    expect(ad.model).toBe("llama3.1:8b");
  });
});

describe("detectProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'anthropic' when ANTHROPIC_API_KEY set", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const p = await detectProvider();
      expect(p).toBe("anthropic");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns 'ollama' when no Anthropic key but Ollama responds", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    try {
      const p = await detectProvider();
      expect(p).toBe("ollama");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns null when neither available", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      const p = await detectProvider();
      expect(p).toBeNull();
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns 'ollama' on 4xx (Ollama reachable but HEAD unsupported)", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    try {
      const p = await detectProvider();
      expect(p).toBe("ollama");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns null on 5xx", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    try {
      const p = await detectProvider();
      expect(p).toBeNull();
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});

describe("createAdapter (auto-detect)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws auth error when provider undefined and detection fails", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      await expect(createAdapter({})).rejects.toMatchObject({ kind: "auth" });
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("auto-detects and builds anthropic adapter when key set", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "auto-key";
    try {
      const ad = await createAdapter({});
      expect(ad.id).toBe("anthropic");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("auto-detects and builds ollama adapter when Ollama responds", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    try {
      const ad = await createAdapter({});
      expect(ad.id).toBe("ollama");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
