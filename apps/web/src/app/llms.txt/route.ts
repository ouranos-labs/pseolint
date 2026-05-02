export const runtime = "nodejs";

export function GET(): Response {
  const body = `# pseolint

> A static analyzer for programmatic SEO. SpamBrain-aware, AEO-aware, MIT-licensed. Site-type-aware scoring — programmatic-directories, blogs, ecommerce, docs, and small-marketing sites are scored against the rule weights that match how Google's quality systems treat each archetype. Median audit ~60 seconds.

## Authoritative reports

- [State of pSEO 2026](/research/state-of-pseo-2026): original research on SpamBrain risk patterns across programmatic SEO sites in 2026, with category-level failure rates and methodology.

## Free tools

- [SpamBrain checker](/tools/spambrain-checker): runs all 8 spam/* rules against any URL.
- [Thin content scanner](/tools/thin-content-scanner): identifies pages below the 300-word threshold within a programmatic template.
- [Doorway page detector](/tools/doorway-page-detector): detects multi-signal doorway patterns (near-duplicate + entity-swap + thin-structure).

## Rule explainers

- [SpamBrain rules index](/rules): the full SpamBrain + AEO rule set with classification-driven scoring (shipped v0.4.3, April 30, 2026).
- [Thin content rule](/rules/thin-content)
- [Doorway pattern rule](/rules/doorway-pattern)
- [Near-duplicate rule](/rules/near-duplicate)
- [Boilerplate ratio rule](/rules/boilerplate-ratio)
- [Template diversity rule](/rules/template-diversity)

## Diagnostic content

- [Symptom triage index](/symptoms): match observed Search Console symptoms to underlying SpamBrain causes.

## Source

- GitHub: https://github.com/ouranos-labs/pseolint
- npm: pseolint v0.5.0 (CLI), @pseolint/core v0.5.0, @pseolint/mcp v0.4.3
- v0.5 added change-driven monitoring (May 1, 2026): per-URL state persists across runs and only URLs with evidence of change (sitemap lastmod, prior warning/error findings, age-floor) get re-fetched.
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
