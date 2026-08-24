/**
 * Hand-written editorial guides under `/rules/*` and `/tools/*`.
 *
 * These pages are authored as their own route files, so: unlike `MARKETING_RULES`
 * and `MARKETING_TOOLS`: nothing iterates them. That is exactly how 7 of the 8
 * ended up as orphans (`links/orphan-pages`, the one blocker in pseolint.dev's own
 * audit): they shipped in the sitemap with zero inbound internal links, which
 * starves them of crawl equity no matter how good the content is.
 *
 * This registry is the single source of truth so the section hubs can link them
 * and `tests/unit/marketing-guides.test.ts` can fail the build when a new
 * editorial page is added without one.
 */

export type MarketingGuide = {
  /** Route slug within its section; the path is `/{section}/{slug}`. */
  slug: string;
  section: "rules" | "tools";
  /** Card heading on the hub. Kept shorter than the page's own <title>. */
  title: string;
  /** One-line summary for the hub card. */
  blurb: string;
};

export const MARKETING_GUIDES: readonly MarketingGuide[] = [
  {
    slug: "programmatic-seo-mistakes",
    section: "rules",
    title: "5 Programmatic SEO Mistakes to Avoid",
    blurb:
      "The failure patterns that show up most often in real audits, and the signal each one trips.",
  },
  {
    slug: "webflow-vs-wordpress-pseo",
    section: "rules",
    title: "Webflow vs WordPress for pSEO",
    blurb:
      "How the two platforms differ on template control, canonical handling, and crawl hygiene at scale.",
  },
  {
    slug: "structured-data-at-scale",
    section: "rules",
    title: "Structured Data at Scale",
    blurb:
      "Emitting schema across thousands of generated pages without shipping invalid or duplicated markup.",
  },
  {
    slug: "crawl-budget-optimization",
    section: "rules",
    title: "Crawl Budget Optimization",
    blurb:
      "Why large page counts stall in discovery, and which levers actually change what Google fetches.",
  },
  {
    slug: "internal-linking-silos",
    section: "rules",
    title: "Internal Linking Silos",
    blurb:
      "Structuring links so generated clusters stay reachable instead of stranding pages at depth.",
  },
  {
    slug: "programmatic-seo-ai-content",
    section: "rules",
    title: "AI Content Generation for pSEO",
    blurb:
      "Where generated copy holds up, where it collapses into scaled-content-abuse territory, and how to tell.",
  },
  {
    slug: "programmatic-seo-checklist",
    section: "tools",
    title: "Pre-Launch Checklist",
    blurb:
      "What to verify before publishing a programmatic set, ordered by how badly each item bites.",
  },
  {
    slug: "nextjs-programmatic-seo",
    section: "tools",
    title: "Next.js pSEO Setup Guide",
    blurb:
      "Wiring generateStaticParams, metadata, and sitemaps so a Next.js programmatic build stays indexable.",
  },
  {
    slug: "compare-pseo-tools",
    section: "tools",
    title: "Compare pSEO Tools & Credit Costs",
    blurb:
      "Credit pricing and indexation risk across the generator tools, with a simulator for your page count.",
  },
] as const;

/** Guides belonging to one section hub, in registry order. */
export function guidesForSection(section: MarketingGuide["section"]): MarketingGuide[] {
  return MARKETING_GUIDES.filter((g) => g.section === section);
}
