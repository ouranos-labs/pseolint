import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeContentEffort } from "../../src/algorithms/content-effort/judge.js";

// Fake AI-SDK model: generateObject() reads model.doGenerate; we instead inject a
// scorer via the opts.generate hook (see Step 3) to keep the test offline + deterministic.
function page(url: string, contentText: string) { return { url, contentText } as any; }

describe("judgeContentEffort", () => {
  it("scores one representative page per template and aggregates (min-large-template dominates)", async () => {
    const templates = [
      { signature: "/wiki/:slug", samplePages: [page("a", "thin filler"), page("b", "thin filler 2")] },
      { signature: "/guide/:slug", samplePages: [page("c", "long original guide")] },
    ];
    const fakeScores: Record<string, number> = { "thin filler": 5, "thin filler 2": 7, "long original guide": 80 };
    const dir = mkdtempSync(join(tmpdir(), "eff-judge-"));
    const res = await judgeContentEffort(templates, {
      modelId: "fake",
      cacheDir: dir,
      generate: async (text) => fakeScores[text.trim()] ?? 0,
      perTemplateCap: 3,
      siteCap: 10,
    });
    expect(res.perTemplate.get("/wiki/:slug")!.effort).toBeLessThan(10);
    expect(res.perTemplate.get("/guide/:slug")!.effort).toBe(80);
    // site effort: low-effort large template should dominate -> well below the high one
    expect(res.siteEffort).toBeLessThan(40);
  });

  it("worst-large aggregation is order-independent (two equal-weight large templates)", async () => {
    // Two large templates of equal weight, efforts 90 and 10. The lowest-effort
    // large template must drive siteEffort regardless of array order (Bug 1).
    const fakeScores: Record<string, number> = { "high effort body": 90, "low effort body": 10 };
    const generate = async (text: string) => fakeScores[text.trim()] ?? 0;
    const highFirst = [
      { signature: "/high", samplePages: [page("a", "high effort body"), page("b", "high effort body")] },
      { signature: "/low", samplePages: [page("c", "low effort body"), page("d", "low effort body")] },
    ];
    const lowFirst = [
      { signature: "/low", samplePages: [page("c", "low effort body"), page("d", "low effort body")] },
      { signature: "/high", samplePages: [page("a", "high effort body"), page("b", "high effort body")] },
    ];
    const dirA = mkdtempSync(join(tmpdir(), "eff-order-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "eff-order-b-"));
    const resHighFirst = await judgeContentEffort(highFirst, { modelId: "fake", cacheDir: dirA, generate });
    const resLowFirst = await judgeContentEffort(lowFirst, { modelId: "fake", cacheDir: dirB, generate });
    expect(resHighFirst.siteEffort).toBe(resLowFirst.siteEffort);
  });

  it("returns siteEffort null and an empty map for no templates, without calling generate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eff-empty-"));
    let calls = 0;
    const res = await judgeContentEffort([], {
      modelId: "fake",
      cacheDir: dir,
      generate: async () => { calls++; return 0; },
    });
    expect(res.siteEffort).toBeNull();
    expect(res.perTemplate.size).toBe(0);
    expect(calls).toBe(0); // no judgeable templates -> moderator no-ops, generate never called
  });

  it("serves cached scores without re-calling generate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eff-judge2-"));
    let calls = 0;
    const opts = { modelId: "fake", cacheDir: dir, generate: async () => { calls++; return 30; }, perTemplateCap: 1, siteCap: 10 };
    const t = [{ signature: "/x", samplePages: [page("u", "same body")] }];
    await judgeContentEffort(t, opts as any);
    await judgeContentEffort(t, opts as any);
    expect(calls).toBe(1); // second run hits the cache
  });
});
