# pseolint content cluster plan

Working doc. The **structure** here is fixed; the **priority order** is
provisional until the `Vol` / `KD` slots are filled from a real keyword tool
(Ahrefs — currently no plan — or Google Keyword Planner). Until then, priority
is proxied by **benchmark prevalence** (how often the rule fired across the
[20-site benchmark](../apps/web/src/app/research/pseo-audit-benchmark-2026/page.tsx))
× **search intent**.

Domain reality: pseolint.dev is **DR ~2.4**. Individual posts won't rank cold —
the cluster (one pillar, tightly interlinked spokes) is what earns topical depth.
Publish on a **~weekly cadence**, not a dump; cadence is itself an
`aeo/freshness-signals` win.

## How to use this doc

1. Restore a volume source, then fill `Vol` (US monthly) + `KD` (0–100) per row.
2. Re-sort spokes by `Vol × intent ÷ KD` — that becomes the publish order.
3. Draft one pillar + one spoke per week. Each spoke MUST link up to the pillar
   and to ≥1 sibling; the pillar links down to every spoke.
4. Every claim ends in a runnable `npx pseolint` check — that's the moat over the
   prose-only posts already ranking.

## Pillar

| Field | Value |
|---|---|
| Working title | Programmatic SEO in 2026: The Compliance & Citability Playbook |
| Target term | `programmatic seo best practices` / `programmatic seo compliance` |
| Vol / KD | ___ / ___ |
| Role | Broad hub. Won't rank head-on at DR 2.4 — its job is to interlink the cluster and catch long-tail. Links **down** to all spokes. |
| Status | ⬜ not started |

## Spokes

Ordered by current proxy priority (benchmark prevalence × intent). Re-sort after
volumes land.

| # | Working title | Target term | pseolint rule(s) | Benchmark | Intent | Vol / KD | Links to | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Programmatic SEO vs. Doorway Pages | `programmatic seo doorway pages` | `spam/doorway-pattern` | 20% | high (penalty fear → audit) | ___ / ___ | pillar, #4 | ✅ published |
| 2 | llms.txt for programmatic sites: the AEO index | `llms.txt guide` / `llms txt seo` | `aeo/llms-txt` | **80%** | high (hot, freshness-weighted, less DR-gated) | ___ / ___ | pillar, #3 | ⬜ |
| 3 | Getting cited by AI: citation coverage & citable facts | `answer engine optimization` / `get cited in ai overviews` | `content/citation-coverage`, `aeo/citable-facts` | 75% | high | ___ / ___ | pillar, #2, #6 | ⬜ |
| 4 | Near-duplicate & entity-swap at scale | `near duplicate content seo` / `entity swap pages` | `spam/near-duplicate`, `spam/entity-swap` | 40% | medium | ___ / ___ | pillar, #1, #5 | ⬜ |
| 5 | Thin content at scale: unique value per template | `thin content checker` / `thin content at scale` | `spam/thin-content`, `content/unique-value` | — | medium | ___ / ___ | pillar, #4 | ⬜ |
| 6 | E-E-A-T for programmatic & directory sites | `eeat seo` / `author schema seo` | `content/eeat-signals`, `content/missing-author` | — | medium | ___ / ___ | pillar, #3 | ⬜ |
| 7 | Don't block the bots that cite you (robots for GPTBot/ClaudeBot) | `block gptbot` / `ai crawler robots txt` | `aeo/crawler-access` | 25% | medium (quick-win term) | ___ / ___ | pillar, #2 | ⬜ (optional) |
| 8 | Soft 404s & CSR bailout: the technical pSEO killers | `soft 404 seo` / `client side rendering seo indexing` | `tech/soft-404`, `tech/csr-bailout` | 5% | low-med (niche, low competition) | ___ / ___ | pillar | ⬜ (optional) |

## Supporting data assets (not spokes — everything cites these)

- [20-site audit benchmark](../apps/web/src/app/research/pseo-audit-benchmark-2026/page.tsx) — measured prevalence numbers.
- [State of pSEO 2026](../apps/web/src/app/research/state-of-pseo-2026/page.tsx) — modeled context.
- Refresh the benchmark quarterly (re-run `scripts` corpus crawl) so spokes always cite current numbers → recurring `dateModified` bump.

## Cadence (fill dates once volumes set order)

| Week | Publish | Notes |
|---|---|---|
| 0 | Pillar | Ships with links to #1 (already live) |
| 1 | Highest `Vol×intent÷KD` spoke | likely #2 (llms.txt — widest gap) |
| 2–6 | one spoke/week | re-sorted order |
| quarterly | benchmark refresh | freshness + fresh citations |

## Guardrails

- **Cluster over count.** 6 interlinked spokes > 20 orphans. Don't add spoke #9+ until 1–8 are live and interlinked.
- **Volume-gate new spokes.** No spoke ships without a filled `Vol` slot showing real demand — that's the whole "validate before building" rule.
- **One term per spoke.** Don't let two spokes target the same term (self-cannibalization — `cannibal/url-pattern` is literally one of your rules).
