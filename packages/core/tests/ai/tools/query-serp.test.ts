import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { querySerpTool } from "../../../src/ai/tools/query-serp.js";

const realFetch = globalThis.fetch;

describe("query_serp tool", () => {
  beforeEach(() => {
    delete process.env.SERPAPI_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("rejects when no API key is provided or in env", async () => {
    const r = await querySerpTool.run({ keyword: "test" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("EXECUTE_ERROR");
      expect(r.error).toContain("SerpAPI key");
    }
  });

  it("rejects empty keyword via Zod", async () => {
    const r = await querySerpTool.run({ keyword: "", apiKey: "k".repeat(20) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects num > 20 via Zod", async () => {
    const r = await querySerpTool.run({ keyword: "x", num: 50, apiKey: "k".repeat(20) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("parses a happy-path SerpAPI response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          organic_results: [
            { position: 1, title: "First", link: "https://example.com/1", snippet: "snippet 1" },
            { position: 2, title: "Second", link: "https://example.com/2", snippet: "snippet 2", source: "Example" },
          ],
          answer_box: { snippet: "direct answer" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;

    const r = await querySerpTool.run({
      keyword: "best plumber austin",
      apiKey: "test-key-1234",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.resultCount).toBe(2);
    expect(r.data.organicResults[0].title).toBe("First");
    expect(r.data.organicResults[1].source).toBe("Example");
    expect(r.data.hasAnswerBox).toBe(true);
    expect(r.data.hasKnowledgeGraph).toBe(false);
    expect(r.data.fromCache).toBe(false);
  });

  it("surfaces SerpAPI error payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 200 }),
    ) as typeof fetch;

    const r = await querySerpTool.run({ keyword: "x", apiKey: "test-key-1234" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid API key");
  });

  it("surfaces non-2xx HTTP responses as tool errors", async () => {
    globalThis.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const r = await querySerpTool.run({ keyword: "x", apiKey: "test-key-1234" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/429/);
  });

  it("falls back to SERPAPI_API_KEY env var when no apiKey is passed", async () => {
    process.env.SERPAPI_API_KEY = "env-key-1234";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ organic_results: [] }), { status: 200 }),
    ) as typeof fetch;

    const r = await querySerpTool.run({ keyword: "x" });
    expect(r.ok).toBe(true);
    delete process.env.SERPAPI_API_KEY;
  });

  it("reports apiCostUsd > 0 on a fresh fetch", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ organic_results: [] }), { status: 200 }),
    ) as typeof fetch;
    const r = await querySerpTool.run({ keyword: "x", apiKey: "k".repeat(20) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.apiCostUsd).toBeGreaterThan(0);
  });
});
