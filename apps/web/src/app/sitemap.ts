import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";

// Build-time static (CDN-served): no cold start, always a fast 200, and
// lastModified freezes at build time rather than changing every request (a
// per-request `now` makes the whole sitemap look perpetually modified).
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const now = new Date();

  type Entry = {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  };

  const evergreen: Entry[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
    { path: "/leaderboard", changeFrequency: "daily", priority: 0.7 },
    { path: "/limits", changeFrequency: "monthly", priority: 0.4 },
    { path: "/abuse", changeFrequency: "yearly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];

  const indexes: Entry[] = [
    { path: "/tools", changeFrequency: "monthly", priority: 0.8 },
    { path: "/rules", changeFrequency: "monthly", priority: 0.8 },
    { path: "/symptoms", changeFrequency: "monthly", priority: 0.8 },
    { path: "/research", changeFrequency: "monthly", priority: 0.7 },
    // Credibility hub (calibration methodology). Was missing from the sitemap —
    // a high-trust, link-worthy page that should be crawled.
    { path: "/methodology", changeFrequency: "monthly", priority: 0.7 },
    // MCP server setup (remote + stdio) — acquisition surface for the AI-assistant channel.
    { path: "/mcp-server", changeFrequency: "monthly", priority: 0.8 },
  ];

  // Tools resist AI Overviews (interactive) — high priority for crawl + cite signals.
  const tools: Entry[] = [
    ...MARKETING_TOOLS.map((t): Entry => ({
      path: `/tools/${t.slug}`,
      changeFrequency: "monthly",
      priority: 0.9,
    })),
    { path: "/tools/nextjs-programmatic-seo", changeFrequency: "monthly", priority: 0.9 },
    { path: "/tools/programmatic-seo-checklist", changeFrequency: "monthly", priority: 0.9 },
  ];

  // Rule explainers — primary topical-authority surface.
  const rules: Entry[] = [
    ...MARKETING_RULES.map((r): Entry => ({
      path: `/rules/${r.slug}`,
      changeFrequency: "monthly",
      priority: 0.8,
    })),
    { path: "/rules/crawl-budget-optimization", changeFrequency: "monthly", priority: 0.8 },
    { path: "/rules/structured-data-at-scale", changeFrequency: "monthly", priority: 0.8 },
    { path: "/rules/webflow-vs-wordpress-pseo", changeFrequency: "monthly", priority: 0.8 },
    { path: "/rules/programmatic-seo-ai-content", changeFrequency: "monthly", priority: 0.8 },
    { path: "/rules/internal-linking-silos", changeFrequency: "monthly", priority: 0.8 },
  ];

  // Symptom diagnostic pages — bottom-funnel intent, evergreen.
  const symptoms: Entry[] = MARKETING_SYMPTOMS.map((s): Entry => ({
    path: `/symptoms/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // Original-data report — link bait + LLM citation magnet.
  const research: Entry[] = [
    { path: "/research/state-of-pseo-2026", changeFrequency: "yearly", priority: 0.9 },
    { path: "/research/ai-overviews-seo-impact", changeFrequency: "yearly", priority: 0.9 },
    { path: "/research/programmatic-seo-case-study", changeFrequency: "yearly", priority: 0.9 },
    { path: "/research/datasets-for-programmatic-seo", changeFrequency: "yearly", priority: 0.9 },
  ];

  return [...evergreen, ...indexes, ...tools, ...rules, ...symptoms, ...research].map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
