import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createAnthropicAdapter,
  __setAnthropicClientFactory,
  __resetAnthropicClientFactory,
} from "../../../src/ai/adapters/anthropic.js";
import { AdapterError } from "../../../src/ai/types.js";

describe("anthropic adapter", () => {
  afterEach(() => {
    __resetAnthropicClientFactory();
  });

  it("throws auth error when no apiKey configured and env not set", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const ad = createAnthropicAdapter({ model: "claude-sonnet-4-6" });
      await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "auth" });
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("returns response on success (via DI seam)", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "claude-sonnet-4-6", apiKey: "test-key" });
    const r = await ad.chat({ system: "S", user: "U" }, { maxOutputTokens: 500 });
    expect(r.text).toBe('{"ok":true}');
    expect(r.usage).toEqual({ input: 100, output: 20 });
    expect(create).toHaveBeenCalledOnce();
    const args = create.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: "S",
      messages: [{ role: "user", content: "U" }],
    });
  });

  it("uses default max_tokens=1500 when not provided", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "x" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await ad.chat({ system: "s", user: "u" });
    expect(create.mock.calls[0]?.[0].max_tokens).toBe(1500);
  });

  it("concatenates multiple text blocks", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "text", text: "hello " },
        { type: "tool_use", id: "x" },
        { type: "text", text: "world" },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    const r = await ad.chat({ system: "s", user: "u" });
    expect(r.text).toBe("hello world");
  });

  it("throws invalid-response when no text content", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "x" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("maps 401 to AdapterError(auth)", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("unauth"), { status: 401 }));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps 403 to AdapterError(auth)", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps 429 to AdapterError(rate-limit)", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("rate"), { status: 429 }));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "rate-limit" });
  });

  it("maps 5xx to AdapterError(server)", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("oops"), { status: 503 }));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "server" });
  });

  it("maps no-status (network) to AdapterError(network)", async () => {
    const create = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "network" });
  });

  it("maps other status (e.g., 400) to invalid-response", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("rethrows AbortError without wrapping", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const create = vi.fn().mockRejectedValue(abortErr);
    __setAnthropicClientFactory(() => ({ messages: { create } }));
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toBe(abortErr);
  });

  it("estimates tokens via chars/4", () => {
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    expect(ad.estimateInputTokens({ system: "1234", user: "5678" })).toBe(2);
  });

  it("id is 'anthropic'", () => {
    expect(createAnthropicAdapter({ model: "m", apiKey: "k" }).id).toBe("anthropic");
  });

  it("model is preserved", () => {
    expect(
      createAnthropicAdapter({ model: "claude-haiku-4-5-20251001", apiKey: "k" }).model,
    ).toBe("claude-haiku-4-5-20251001");
  });

  it("uses ANTHROPIC_API_KEY env var as fallback", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "env-key";
    const apiKeysSeen: string[] = [];
    __setAnthropicClientFactory((apiKey: string) => {
      apiKeysSeen.push(apiKey);
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        },
      };
    });
    try {
      const ad = createAnthropicAdapter({ model: "m" });
      await ad.chat({ system: "s", user: "u" });
      expect(apiKeysSeen[0]).toBe("env-key");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});

describe("anthropic adapter SDK-missing path", () => {
  beforeEach(() => {
    __resetAnthropicClientFactory();
  });
  afterEach(() => {
    __resetAnthropicClientFactory();
  });

  it("throws sdk-missing AdapterError when SDK import fails", async () => {
    // Inject a factory that throws as if the SDK wasn't installed.
    __setAnthropicClientFactory(() => {
      throw new AdapterError(
        "@anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk",
        "sdk-missing",
      );
    });
    const ad = createAnthropicAdapter({ model: "m", apiKey: "k" });
    try {
      await ad.chat({ system: "s", user: "u" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterError);
      expect((e as AdapterError).kind).toBe("sdk-missing");
      expect((e as AdapterError).message).toMatch(/npm install @anthropic-ai\/sdk/);
    }
  });
});
