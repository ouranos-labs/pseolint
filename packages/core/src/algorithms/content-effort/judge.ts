// judge.ts
import { generateObject, type LanguageModel } from "ai";
import type { ParsedPage } from "../../types.js";
import { buildEffortPrompt, effortSchema } from "./schema.js";
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
  siteEffort: number | null; // null = no judgeable templates → moderator no-ops
}

const DEFAULT_PER_TEMPLATE_CAP = 3;
const DEFAULT_SITE_CAP = 10;
/** A template counts as "large" once it holds at least this share of total weight. */
const LARGE_TEMPLATE_SHARE = 0.2;

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
  const perTemplateCap = opts.perTemplateCap ?? DEFAULT_PER_TEMPLATE_CAP;
  const siteCap = opts.siteCap ?? DEFAULT_SITE_CAP;
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
  // No judgeable templates → ABSENT. Downstream (Task 6) no-ops on non-finite/undefined
  // scores and treats null as absent, so the moderator stays fail-safe on no evidence.
  if (weights.length === 0) return { perTemplate, siteEffort: null };
  // Min-large-template dominates: weighted mean, then pull toward the worst large template
  // (lowest effort among templates holding ≥LARGE_TEMPLATE_SHARE of total weight; order-independent).
  const totalWeight = weights.reduce((a, w) => a + w.weight, 0);
  const wmean = weights.reduce((a, w) => a + w.effort * w.weight, 0) / Math.max(1, totalWeight);
  const large = weights.filter((w) => w.weight >= totalWeight * LARGE_TEMPLATE_SHARE);
  const pool = large.length ? large : weights;
  const worstLarge = pool.reduce((min, w) => Math.min(min, w.effort), 100);
  const siteEffort = clamp(Math.min(wmean, (wmean + worstLarge) / 2));
  return { perTemplate, siteEffort };
}

/** Production generate: structured-output judge (no tools → injection can at most return an in-range number). */
export function makeLlmGenerate(model: LanguageModel, signal?: AbortSignal): (text: string) => Promise<number> {
  return async (contentText: string) => {
    const { system, user } = buildEffortPrompt(contentText);
    const out = await generateObject({ model, system, prompt: user, schema: effortSchema, maxOutputTokens: 200, abortSignal: signal });
    return out.object.effort;
  };
}
