/**
 * Landing-page FAQ: single source of truth.
 *
 * Rendered as visible content by the landing form. It is deliberately not
 * mirrored into JSON-LD: Google removed the FAQ rich result from Search on
 * 2026-05-07 and deleted the FAQPage documentation on 2026-06-15, so the
 * markup buys nothing, and the visible prose is what an answer engine lifts.
 * See /folklore. Answers stay plain prose (no markup) so each one reads as a
 * complete, extractable answer on its own.
 * https://developers.google.com/search/updates#removing-faq-rich-result
 */
export interface LandingFaqItem {
  q: string;
  a: string;
}

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    q: "What does pseolint actually check?",
    a: "pseolint runs rules across 8 categories over your site as a graph, not page by page: SpamBrain spam patterns (doorway clusters, near-duplicates, entity-swap templates, thin content), content quality (titles, headings, alt text, E-E-A-T signals), internal-link structure, technical indexing (canonicals, robots, sitemaps, hreflang), and AEO: whether ChatGPT, Perplexity, and Google AI Overviews can cite your pages. Every rule maps to a documented Google policy and ships with a fix. The full, current list lives at /rules.",
  },
  {
    q: "How is this different from Ahrefs or Screaming Frog?",
    a: "Those tools were built for editorially-curated sites and check pages one at a time; they're excellent at backlinks, Core Web Vitals, broken links, and keyword research, none of which pseolint does. The SpamBrain risks of programmatic SEO live between pages: doorway clusters, near-duplicate templates, and entity-swap doorways across thousands of URLs. Per-page rules can't see them. pseolint audits the link graph and groups findings by template, so fixing one template fixes every page it generates.",
  },
  {
    q: "What is the SpamBrain Risk Score?",
    a: "A 0–100 number where lower is safer. It aggregates every rule's findings into a per-template verdict (ready, caution, or concerning) and the site score is driven by the worst template with at least 5% URL coverage, so a clean section can't hide a broken one. The score is calibrated against a curated corpus of reputable, in-production pSEO sites and is reproducible at a fixed sample seed. Full methodology lives at /methodology.",
  },
  {
    q: "How do I gate it in CI/CD?",
    a: "pseolint ships as a GitHub Action and a CLI. Point it at your build output or a preview URL, set a threshold, and the run fails the build when a template degrades past your bar. JSON output plugs into any pipeline, and the Action posts a score summary as a PR comment. A copy-paste workflow is right above this section.",
  },
  {
    q: "What does it cost?",
    a: "The audit is free: no signup for anonymous single-URL scans, with higher limits once you sign in. Pro is $19/month for per-domain monitoring: scheduled re-audits, cumulative template coverage over time, AI triage, Google Search Console integration, and rule overrides. No credit card to start. See /pricing for the breakdown.",
  },
] as const;
