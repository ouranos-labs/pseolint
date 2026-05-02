import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askAiEngineTool } from "../../../src/ai/tools/ask-ai-engine.js";

const realFetch = globalThis.fetch;

describe("ask_ai_engine tool", () => {
  let cacheDir: string;
  beforeEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    cacheDir = await mkdtemp(join(tmpdir(), "pseolint-ask-ai-"));
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("rejects unknown engine via Zod", async () => {
    const r = await askAiEngineTool.run({
      // @ts-expect-error testing runtime guard
      engine: "openai",
      query: "x",
      apiKey: "k".repeat(20),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects missing key for the requested engine", async () => {
    const r = await askAiEngineTool.run({ engine: "anthropic", query: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/anthropic/i);
  });

  it("dispatches to Anthropic and parses cited URLs from the response text", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "The best resource is https://example.com/best-plumbers ." },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const r = await askAiEngineTool.run({
      engine: "anthropic",
      query: "Who are the best plumbers in Austin?",
      candidateUrl: "https://example.com/best-plumbers",
      apiKey: "ak-1234567890",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.engine).toBe("anthropic");
    expect(r.data.citedUrls).toContain("https://example.com/best-plumbers");
    expect(r.data.candidateCited).toBe(true);
  });

  it("dispatches to Perplexity and prefers native citations array", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Some answer text." } }],
          citations: ["https://example.com/a", "https://example.com/b"],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const r = await askAiEngineTool.run({
      engine: "perplexity",
      query: "x",
      candidateUrl: "https://example.com/a",
      apiKey: "px-1234567890",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.citedUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(r.data.candidateCited).toBe(true);
  });

  it("dispatches to Gemini and reads citations from groundingMetadata", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "answer" }] },
              groundingMetadata: {
                groundingChunks: [{ web: { uri: "https://example.com/g" } }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const r = await askAiEngineTool.run({
      engine: "gemini",
      query: "x",
      candidateUrl: "https://other.com/elsewhere",
      apiKey: "gem-1234567890",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.citedUrls).toEqual(["https://example.com/g"]);
    expect(r.data.candidateCited).toBe(false);
  });

  it("returns candidateCited=null when no candidateUrl is passed", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "no urls here" }] }), { status: 200 }),
    ) as typeof fetch;
    const r = await askAiEngineTool.run({
      engine: "anthropic",
      query: "x",
      apiKey: "ak-1234567890",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.candidateCited).toBeNull();
  });

  it("hits the cache on repeat calls when cacheDir is provided", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "answer https://example.com/x" }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const args = {
      engine: "anthropic" as const,
      query: "stable query",
      apiKey: "ak-1234567890",
      cacheDir,
    };
    const r1 = await askAiEngineTool.run(args);
    const r2 = await askAiEngineTool.run(args);
    expect(r1.ok && r2.ok).toBe(true);
    expect(calls).toBe(1);
    if (r1.ok) {
      expect(r1.data.fromCache).toBe(false);
      expect(r1.data.apiCostUsd).toBeGreaterThan(0);
    }
    if (r2.ok) {
      expect(r2.data.fromCache).toBe(true);
      expect(r2.data.apiCostUsd).toBe(0);
    }
  });
});
