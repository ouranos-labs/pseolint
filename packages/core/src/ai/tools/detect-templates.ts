import { z } from "zod";
import { clusterUrlTemplates } from "../../site-classifier.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  urls: z.array(z.string()).min(1).describe("URL list, typically from fetch_sitemap."),
  minRatio: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Drop templates that account for less than this fraction of URLs. Default 0.01 (1%)."),
});

const outputSchema = z.object({
  templateCount: z.number().int().nonnegative(),
  totalUrls: z.number().int().nonnegative(),
  templates: z.array(
    z.object({
      template: z.string().describe("Generalized URL pattern, e.g. '/city/:slug'."),
      count: z.number().int().nonnegative(),
      ratio: z.number().min(0).max(1),
    }),
  ),
});

/**
 * Group URLs into template clusters. Wraps `clusterUrlTemplates` from the
 * site classifier. Lets the orchestrator decide where to focus sampling:
 * high-ratio templates (e.g. 80% of URLs share `/city/:slug`) deserve
 * deeper inspection than long-tail one-offs.
 */
export const detectTemplatesTool = defineTool({
  name: "detect_templates",
  description:
    "Group a URL list into template clusters (e.g. 80% of URLs share '/city/:slug', 5% share '/blog/:slug'). Returns templates sorted by descending count with the ratio of URLs each represents. Use this after fetch_sitemap to identify which template patterns dominate the site, then use sample_template to pull representative pages from each.",
  inputSchema,
  outputSchema,
  async execute({ urls, minRatio = 0.01 }) {
    const clustered = clusterUrlTemplates(urls);
    const filtered = clustered.filter((t) => t.ratio >= minRatio);
    return {
      templateCount: filtered.length,
      totalUrls: urls.length,
      templates: filtered,
    };
  },
});
