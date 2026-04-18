import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOllamaAdapter } from "../../../src/ai/adapters/ollama.js";
import { AdapterError } from "../../../src/ai/types.js";

describe("ollama adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response on 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: '{"hi":1}' },
          prompt_eval_count: 12,
          eval_count: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const ad = createOllamaAdapter({ model: "llama3.1:8b" });
    const r = await ad.chat({ system: "S", user: "U" });
    expect(r.text).toBe('{"hi":1}');
    expect(r.usage).toEqual({ input: 12, output: 5 });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = (fetchSpy.mock.calls[0]?.[0] as URL | string).toString();
    expect(url).toContain("/api/chat");
  });

  it("uses configured endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: "ok" },
          prompt_eval_count: 1,
          eval_count: 1,
        }),
        { status: 200 },
      ),
    );
    const ad = createOllamaAdapter({ model: "m", endpoint: "http://other:9999" });
    await ad.chat({ system: "s", user: "u" });
    const url = (fetchSpy.mock.calls[0]?.[0] as URL | string).toString();
    expect(url).toBe("http://other:9999/api/chat");
  });

  it("maps ECONNREFUSED to AdapterError(network)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );
    const ad = createOllamaAdapter({ model: "m" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "network" });
  });

  it("maps 404 to AdapterError(invalid-response) with pull hint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("model not found", { status: 404 }),
    );
    const ad = createOllamaAdapter({ model: "missing" });
    try {
      await ad.chat({ system: "s", user: "u" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterError);
      const ae = e as AdapterError;
      expect(ae.kind).toBe("invalid-response");
      expect(ae.message).toMatch(/ollama pull missing/);
    }
  });

  it("maps 500 to AdapterError(server)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 500 }));
    const ad = createOllamaAdapter({ model: "m" });
    await expect(ad.chat({ system: "s", user: "u" })).rejects.toMatchObject({ kind: "server" });
  });

  it("estimates tokens via chars/4", () => {
    const ad = createOllamaAdapter({ model: "m" });
    const est = ad.estimateInputTokens({ system: "1234", user: "5678" });
    expect(est).toBe(2);
  });

  it("id is 'ollama'", () => {
    expect(createOllamaAdapter({ model: "m" }).id).toBe("ollama");
  });
});
