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

- [SpamBrain rules index](/rules): 44 rules across 8 categories — SpamBrain + AEO + site-reputation-abuse detection + content-quality (title/heading/alt/OG), with classification-driven scoring.
- [Calibration methodology](/methodology): how pseolint's verdicts are calibrated against in-production reputable pSEO sites, with dated snapshot results, the open-source corpus + runner, and the trade-offs we accepted.
- [Thin content rule](/rules/thin-content)
- [Doorway pattern rule](/rules/doorway-pattern)
- [Near-duplicate rule](/rules/near-duplicate)
- [Boilerplate ratio rule](/rules/boilerplate-ratio)
- [Template diversity rule](/rules/template-diversity)

## Diagnostic content

- [Symptom triage index](/symptoms): match observed Search Console symptoms to underlying SpamBrain causes.

## Source

- GitHub: https://github.com/ouranos-labs/pseolint
- npm: pseolint v0.7.0 (CLI), @pseolint/core v0.7.0, @pseolint/mcp v0.7.0
- v0.5 added change-driven monitoring (May 1, 2026): per-URL state persists across runs and only URLs with evidence of change (sitemap lastmod, prior warning/error findings, age-floor) get re-fetched.
- v0.5.1 added \`links/host-section-divergence\` (May 3, 2026): graph-aware detector for sub-sections that ride a host's reputation without integrating into it — the May 2024 site-reputation-abuse policy target. Also made \`spam/publication-velocity\` corpus-aware so large directories aren't tripped on percentages that are small relative to corpus size.
- v0.5.2 (May 3, 2026) — **credibility layer.** Empirically calibrated against a curated corpus of reputable in-production pSEO sites over 9 iteration rounds. Cluster-collapse on \`spam/doorway-pattern\` (per-pair findings collapse into one cluster line). Sample-seed determinism (\`mulberry32\` PRNG) makes verdicts reproducible across runs. Info-severity bucket contribution capped at 50/bucket. Severity demotions auditable via \`summary.appliedSeverityDemotions\`. Markdown reports collapse informational findings under \`<details>\`. Dated snapshot results, the corpus, the runner, and the trade-offs we accepted are documented at /methodology and in docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md. Specific numerical claims (pass rates, per-site verdicts) live on /methodology with a \`<time>\` stamp because they drift as sites redesign.
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
