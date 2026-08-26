# Sampled audits return false negatives on large pSEO sites

Status: proposed. Found 2026-08-26 while auditing codexmachina.dev.

## The observation

The same site, audited twice, one week apart, with no content change between:

| sample | pages audited | risk | verdict | ship-blockers | integrity |
|---|---|---|---|---|---|
| 20 (2026-08-17) | 20 | **7** | caution | **0** | — |
| 150 (2026-08-26) | 150 | **61** | **critical** | **30** | **F** |

codexmachina.dev: 675 URLs in the sitemap, 922 discovered by the crawler. A
combinatorial matrix (framework × database × auth × app-type, plus an additive
email axis).

The 150-page run found **8 `spam/entity-swap` clusters** — 46, 42, 24, 9, 6, 5,
3 and 2 pages — plus 21 exact-title collisions and `content/unique-value` on
137 of 150 pages. The 20-page run found none of it and returned a verdict of
"caution" with risk 7.

This is not noise. It is the difference between "this site is fine" and "this
site is critical", on the failure mode the product exists to detect.

## Why it happens

### 1. Cluster rules need within-cluster density, and stratified sampling destroys it

`spam/entity-swap` and `spam/near-duplicate` are *relational*: they compare
pages against each other. A cluster is only visible when at least two of its
members land in the sample.

The default strategy is stratified (`types.ts:564`), which spreads the sample
proportionally across detected templates. That is the right call for coverage —
and precisely the wrong one for cluster detection. Maximising template coverage
minimises the number of pages drawn from any one cluster.

Detecting an N-page cluster from a K-page sample of an M-page site is
hypergeometric. On codexmachina at K=20, M=922, even the 46-page cluster had a
low chance of contributing two members; the 2- and 3-page clusters had
essentially none. At K=150 all eight surfaced.

The rules are not wrong. They are being handed a sample constructed to hide
what they look for.

### 2. `sitemap-url-count` reports the discovery budget, not the sitemap

`auditor.ts:2552`:

```ts
const discoveryBudget = options?.sampleSize && options.sampleSize > 0
  ? Math.max(50, options.sampleSize * 2)
  : 0;
```

The signal named `sitemap-url-count` is that budget. Observed:

| site | real sitemap | reported `sitemap-url-count` | sample used |
|---|---|---|---|
| codexmachina.dev | 675 (922 crawled) | **300** | 150 (×2) |
| paperforge.dev | 5,640 | **400** | 196 (~×2) |

Off by 2.2× and 14× respectively. This value feeds `siteClassification`
(`site-classifier.ts:32`), which drives classification confidence and — via
`appliedSeverityDemotions` — which rules get demoted. paperforge's audit
demoted `spam/near-duplicate` and `spam/thin-content` as a
"programmatic-directory", a judgement made while believing the site had 400
pages instead of 5,640.

A capped internal budget is being consumed as though it were a measurement of
the site.

## Why this matters commercially

`audit-limits.ts:1`:

```ts
export const PAGE_CAP = { anon: 50, free: 200, pro: MAX_SAFE_INTEGER };
```

The anonymous audit — the homepage form, the entire top of funnel — is a
**50-page sample**. On a large pSEO site, that is the regime where this bug
lives.

So the acquisition path can tell a critically-affected site it is fine. The
prospect most in need of the product receives a clean bill of health at the
exact moment the product needs to prove its worth. Every downstream claim
("SpamBrain-proof", the leaderboard's clean corpus, the Quality Gate that
blocks indexing above risk 40) inherits the error.

It also means monitoring can be wrong: `PRO_MONITOR_SAMPLE_SIZE = 200` on the
weekly cron. Adequate for a 500-page site; thin for a 5,000-page one.

## Proposed fixes

Ordered by value per unit of work.

**1. Stop reporting a budget as a measurement.** Either parse the sitemap index
fully (it is XML and cheap — counting all 21 children of paperforge's index
took one pass) and report the true count, or rename the signal to
`discovery-budget` so nothing can read it as scale. Until then, any
classification decision keyed on site size is made on a number that is mostly a
function of the caller's `--sample-size`.

**2. Report the detection floor.** A sampled audit already knows K, M, and the
template distribution. It can state what it could not have found: *"at 50 of
922 pages, clusters smaller than ~30 pages are unlikely to surface."* That
converts a silent false negative into a stated limitation, which is both honest
and a natural upgrade prompt. This is the highest-value change and needs no new
crawling.

**3. Give cluster rules a clustered sample.** Stratified sampling optimises the
wrong objective for relational rules. Options: sample in pairs within
templates; reserve a fraction of the budget for depth rather than breadth; or
run cluster rules against a separate, deliberately clustered draw. Needs
design — the tension with coverage is real and both objectives are legitimate.

**4. Reconsider the anon cap.** 50 pages is a cost decision, and cost is real.
But a false "caution" on a critical site is worse than a slower audit or a
smaller free tier. At minimum, pair it with fix 2 so the verdict carries its own
confidence.

## How to reproduce

```bash
node packages/cli/dist/cli.js https://codexmachina.dev \
  --sample-size 20  --concurrency 2 --format json -o /tmp/small.json
node packages/cli/dist/cli.js https://codexmachina.dev \
  --sample-size 150 --concurrency 2 --format json -o /tmp/large.json
# compare .risk, .verdict, and .issues.blockers[].ruleId
```

Note that the site was fixed on 2026-08-26 (codexmachina `4a5b74a` removes the
21 title collisions), so re-running now measures a different site. The archived
150-page report is the reference.

## Related

The same audit surfaced that a 20-page sample also missed `content/unique-value`
on 137 of 150 pages — a *per-page* rule, not a relational one. Worth checking
whether that rule aggregates across the sample before firing, in which case it
has a sample-size dependency too and this is broader than the cluster rules.
