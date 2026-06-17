// judge.ts
import type { ParsedPage } from "../../types.js";
import { buildEffortPrompt } from "./schema.js";
import { effortCacheKey, readEffortCache, writeEffortCache } from "./cache.js";

export interface TemplateSample { signature: string; samplePages: Pick<ParsedPage, "url" | "contentText">[]; }
export interface JudgeOpts {
  modelId: string;
  cacheDir: string;
  /** Scores ONE page's contentText 0-100. Production wiring passes a generateObject-backed fn; tests pass a fake. */
  generate: (contentText: string) => Promise<number>;
  perTemplateCap?: number; // default 3
  siteCap?: number;        // default 10
  signal?: AbortSignal;
}
export interface ContentEffortResult {
  perTemplate: Map<string, { effort: number }>;
  siteEffort: number;
}

async function scorePage(text: string, opts: JudgeOpts): Promise<number> {
  const key = effortCacheKey(text, opts.modelId);
  const cached = await readEffortCache(opts.cacheDir, key);
  if (cached !== null) return cached;
  const effort = clamp(await opts.generate(text));
  await writeEffortCache(opts.cacheDir, key, effort);
  return effort;
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function judgeContentEffort(templates: TemplateSample[], opts: JudgeOpts): Promise<ContentEffortResult> {
  const perTemplateCap = opts.perTemplateCap ?? 3;
  const siteCap = opts.siteCap ?? 10;
  const perTemplate = new Map<string, { effort: number }>();
  const weights: { effort: number; weight: number }[] = [];
  let budget = siteCap;
  for (const t of templates) {
    if (budget <= 0) break;
    const pick = t.samplePages.slice(0, Math.min(perTemplateCap, budget));
    budget -= pick.length;
    const scores: number[] = [];
    for (const p of pick) scores.push(await scorePage(p.contentText ?? "", opts));
    const effort = scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length) : 100;
    perTemplate.set(t.signature, { effort });
    weights.push({ effort, weight: t.samplePages.length }); // weight by template size
  }
  // Min-large-template dominates: weighted mean, then pull toward the worst large template.
  const wmean = weights.reduce((a, w) => a + w.effort * w.weight, 0) / Math.max(1, weights.reduce((a, w) => a + w.weight, 0));
  const worstLarge = weights.slice().sort((a, b) => b.weight - a.weight)[0]?.effort ?? wmean;
  const siteEffort = clamp(Math.min(wmean, (wmean + worstLarge) / 2));
  return { perTemplate, siteEffort };
}
