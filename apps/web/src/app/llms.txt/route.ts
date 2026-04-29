export const runtime = "nodejs";

export function GET(): Response {
  const body = `# pseolint

> A static analyzer for programmatic SEO. SpamBrain-aware, AEO-aware, MIT-licensed. Audits pSEO sites against 42 rules across 8 categories in ~60 seconds.

## Authoritative reports

- [State of pSEO 2026](/research/state-of-pseo-2026): original research on SpamBrain risk patterns across programmatic SEO sites in 2026, with category-level failure rates and methodology.

## Free tools

- [SpamBrain checker](/tools/spambrain-checker): runs all 8 spam/* rules against any URL.
- [Thin content scanner](/tools/thin-content-scanner): identifies pages below the 300-word threshold within a programmatic template.
- [Doorway page detector](/tools/doorway-page-detector): detects multi-signal doorway patterns (near-duplicate + entity-swap + thin-structure).

## Rule explainers

- [SpamBrain rules index](/rules): 42-rule taxonomy across 8 categories (spam, content, aeo, links, schema, tech, data, cannibal). spam/* and aeo/* rules ship in v0.3.3 (April 2026).
- [Thin content rule](/rules/thin-content)
- [Doorway pattern rule](/rules/doorway-pattern)
- [Near-duplicate rule](/rules/near-duplicate)
- [Boilerplate ratio rule](/rules/boilerplate-ratio)
- [Template diversity rule](/rules/template-diversity)

## Diagnostic content

- [Symptom triage index](/symptoms): match observed Search Console symptoms to underlying SpamBrain causes.

## Source

- GitHub: https://github.com/ouranos-labs/pseolint
- npm: pseolint v0.3.1 (CLI), @pseolint/core v0.3.3, @pseolint/mcp v0.3.1
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
