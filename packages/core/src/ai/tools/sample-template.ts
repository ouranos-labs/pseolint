import { z } from "zod";
import { stratifiedSample } from "../../stratified-sample.js";
import { normalizePathToTemplate } from "../../site-classifier.js";
import { defineTool } from "./types.js";

/**
 * Match the same normalizer that `detect_templates` uses so a template key
 * produced by one tool is usable as the `template` filter on the other.
 * `stratified-sample.ts` ships a different (stricter) normalizer for its
 * cluster-aware sampling, but for orchestrator handoff we need
 * detect_templates ↔ sample_template to agree on keys.
 */
function urlToTemplateKey(url: string): string {
  try {
    return normalizePathToTemplate(new URL(url).pathname || "/");
  } catch {
    const path = url.split("?")[0].split("#")[0];
    return normalizePathToTemplate(path.startsWith("/") ? path : `/${path}`);
  }
}

const inputSchema = z.object({
  urls: z.array(z.string()).min(1).describe("URL pool to sample from."),
  n: z
    .number()
    .int()
    .positive()
    .max(500)
    .describe("Sample size. Capped at 500 to bound LLM input tokens."),
  template: z
    .string()
    .optional()
    .describe(
      "When provided, restrict sampling to URLs matching this template (as produced by detect_templates / inferUrlTemplate). When omitted, samples stratified across all detected templates.",
    ),
});

const outputSchema = z.object({
  sample: z.array(z.string()),
  sampledFrom: z.number().int().nonnegative(),
  template: z.string().nullable(),
});

/**
 * Stratified URL sampler. Two modes:
 *   - No `template`: stratified sample across all template clusters in `urls`,
 *     proportional to sqrt(cluster size). Good for "give me N representative
 *     URLs from this entire sitemap."
 *   - With `template`: restrict to URLs matching the named template, then
 *     simple random sample of size `n`. Good for "give me 5 examples from the
 *     /city/ template specifically."
 */
export const sampleTemplateTool = defineTool({
  name: "sample_template",
  description:
    "Sample URLs from a list. Without `template`, returns N URLs stratified across all detected templates (good for 'representative sample of this sitemap'). With `template`, restricts to URLs matching that template (good for 'give me 5 example pages from the /city/ template'). Capped at n=500 to keep LLM context manageable.",
  inputSchema,
  outputSchema,
  async execute({ urls, n, template }) {
    if (template === undefined) {
      const sample = stratifiedSample(urls, n);
      return { sample, sampledFrom: urls.length, template: null };
    }

    const matching = urls.filter((u) => urlToTemplateKey(u) === template);
    if (matching.length === 0) {
      return { sample: [], sampledFrom: 0, template };
    }

    if (matching.length <= n) {
      return { sample: matching, sampledFrom: matching.length, template };
    }

    // Simple shuffle-then-take (deterministic enough for orchestrator use; the
    // LLM picks N, our job is to produce N distinct URLs from the cluster).
    const shuffled = [...matching];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { sample: shuffled.slice(0, n), sampledFrom: matching.length, template };
  },
});
