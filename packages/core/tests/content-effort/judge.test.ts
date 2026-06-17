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
