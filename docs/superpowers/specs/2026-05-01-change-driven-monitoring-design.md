# Change-Driven Monitoring Design

**Status:** Draft — 2026-05-01
**Author:** philippe.kam27@gmail.com + Claude (Opus 4.7)
**Motivation:** Self-challenge of the scraping pipeline (memory: `scraper_refinement_backlog.md`) surfaced that today's `--since` flag does change-detection at the wrong layer. We pay the full network and Playwright cost on every monitoring run, then skip *rule evaluation* on unchanged pages. Rule eval is microseconds; the fetch is seconds. With the Pro pivot to per-domain monitoring, every monitoring tick on a 4k-page site re-fetches everything. This design moves the "should we re-audit this URL?" decision *upstream of the fetch*, using cheap signals (sitemap `<lastmod>`, prior state, GSC delta) to skip work entirely on URLs that haven't moved.

## Goal

On a steady-state monitoring run, fetch only URLs with evidence of change. Carry findings forward for the rest. Target: ~95% reduction in fetches and Playwright invocations on a typical pSEO site (4k pages, ~50 changes/wk) **when the sitemap emits `<lastmod>` reliably** (Next.js, WordPress/Yoast, Astro). Sites without `<lastmod>` get reduced bandwidth via cache.ts conditional GETs but still pay round-trips until the deferred HEAD-fallback path lands.

## Non-Goals

- **GSC delta input wiring.** The decision matrix accepts GSC deltas as an optional input; ingesting GSC and computing the delta lives in Pro v1.1 (separate work).
- **Sitemap-lastmod trust verification.** v1 trusts `<lastmod>` at face value. HEAD-sampling to detect lying sitemaps is a follow-up. (Mitigation in v1: open-finding recheck + age-floor + ruleset-version invalidation give us defense-in-depth.)
- **Findings staleness UX in dashboard.** "Verified 8 days ago" badges, confidence demotion after staleness threshold — Pro dashboard work, separate plan.
- **HEAD-only fetch path for unchanged-but-no-validators URLs.** v1 falls through to full GET when no `<lastmod>` and no validator. HEAD-fallback can be added later without state schema changes.
- **Replacing the existing HTTP cache.** The disk cache (cache.ts) and conditional-GET path stay. This design layers *above* the cache: cache decides "do I need to re-download bytes?", monitoring scope decides "do I need to fetch this URL at all?"

## Architecture

### The mistake we're fixing

Today's flow when `options.state.since` is set (`auditor.ts` ~1556):

1. Discover all candidate URLs (sitemap + crawl)
2. Fetch every URL with full network round-trip + Playwright if rendered
3. Compute content hash on each fetched page
4. Compare to prior state's `contentHash`
5. If unchanged → skip *rule evaluation* on it

The "savings" is steps 4–5 — microseconds of CPU. We've already paid steps 2–3 — the expensive things. **The decision has to move upstream of the fetch.**

### Pre-fetch signals, ranked by cost-per-information

| Signal | Per-URL cost | Coverage |
|---|---|---|
| Sitemap `<lastmod>` | ~zero (one sitemap fetch reveals N) | Variable; many sites lie or omit |
| Prior-run findings | zero (already in state) | Only pages with open issues |
| Age floor since last full audit | zero | Universal |
| Ruleset version | zero | Universal |
| GSC delta (Pro) | ~zero (one bulk pull) | High when wired |
| HEAD request | 1 RTT, no body | Universal |
| Conditional GET (304) | 1 RTT, sometimes no body | Universal — already done in cache.ts |
| Full GET | 1 RTT + body | What we do today |

Today every URL pays the bottom row. The redesign uses the top five to decide *before* paying the round-trip.

### Decision matrix

For each URL in the candidate set, evaluate in order. First match wins.

1. **Not in prior state** → REFETCH (reason: `new`)
2. **Prior `fetchedAt` ≥ AGE_FLOOR_DAYS** (default 7) → REFETCH (reason: `age`) — defense against silently-incorrect skips, ensures full coverage at least weekly.
3. **Prior `rulesetVersion` ≠ current** → REFETCH (reason: `ruleset`) — a new rule added to core wouldn't otherwise run on skipped pages.
4. **Prior findings include any error/critical/warning severity** → REFETCH (reason: `recheck`) — re-verify pages with open ship-blockers or should-fixes every monitoring run. **Info-only findings carry forward without recheck** (the severity gate is the load-bearing semantic; without it, any URL with any finding would always refetch and the carry-forward primitive would be dead code).
5. **Sitemap `<lastmod>` > prior `fetchedAt`** → REFETCH (reason: `lastmod`)
6. **GSC delta crosses threshold** (Pro only, when input provided) → REFETCH (reason: `gsc`)
7. **No skip evidence available** (no sitemap lastmod and no GSC) → REFETCH (reason: `no-signal`)
8. Else → **SKIP**, carry findings forward (reason recorded for diagnostics: `unchanged`)

GSC threshold default: ±20% impressions WoW or ±5 absolute clicks WoW. Tuneable, but the value isn't in this spec — it's in the Pro v1.1 GSC plan.

### State schema changes

Existing `UrlStateEntry`:

```ts
interface UrlStateEntry {
  contentHash: string;
  fetchedAt: string;
  status: number;
  findingIds: string[];
}
```

Extended:

```ts
interface UrlStateEntry {
  contentHash: string;
  fetchedAt: string;
  status: number;
  findingIds: string[];

  // New in schema v2:
  lastModified?: string;          // server's Last-Modified header at last fetch
  etag?: string;                   // server's ETag header at last fetch
  sitemapLastmodAtAudit?: string; // sitemap's <lastmod> for this URL when last audited
  rulesetVersion: string;          // ruleset signature active at last fetch
  // Pro-only fields, written when GSC is available:
  gscMetricsAtLastRun?: { impressions: number; clicks: number; period: string };
}
```

Existing `RunState`:

```ts
interface RunState {
  version: number;
  lastRun: string;
  source: string;
  renderMode: RenderMode;
  urls: Record<string, UrlStateEntry>;
  summary: { score: number; totalFindings: number; byCategory: Record<string, number> };
}
```

Extended:

```ts
interface RunState {
  // existing fields...
  rulesetVersion: string;       // active ruleset signature at this run
  lastFullAuditAt: string;      // last time every URL was actually re-fetched (vs carry-forward)
}
```

`STATE_SCHEMA_VERSION` bumps from `1` to `2`. Migration policy: same as today's renderMode-mismatch path — log a warning, treat as no prior state, perform a baseline full audit. The user pays one full run after upgrading; subsequent runs benefit. No migration code needed.

### Ruleset version derivation

v1: a manual constant `CORE_RULESET_VERSION` exported from a stable location (`packages/core/src/ruleset-version.ts`). Bumped by changelog when adding or materially changing a rule. Forward-compatible: future iteration can derive it from active rule IDs + threshold hashes without changing the field shape.

```ts
// packages/core/src/ruleset-version.ts
export const CORE_RULESET_VERSION = "1";
```

Bump rule: ship a new rule, modify a rule's logic, change a default threshold → bump. Pure refactor → don't bump.

### `planScrapeStrategy()` — the pure decision

New module `packages/core/src/scrape-strategy.ts`. Pure function, fully testable without I/O.

```ts
export type SkipReason = "unchanged";
export type RefetchReason = "new" | "age" | "ruleset" | "recheck" | "lastmod" | "gsc" | "no-signal";

export interface ScrapePlan {
  refetch: Map<string, RefetchReason>;
  skip: Map<string, SkipReason>;
}

export interface ScrapeStrategyInputs {
  candidateUrls: readonly string[];
  priorState: RunState | null;
  sitemapLastmodByUrl: ReadonlyMap<string, string>;
  gscDeltasByUrl?: ReadonlyMap<string, { impressionsDelta: number; clicksDelta: number }>;
  currentRulesetVersion: string;
  ageFloorDays: number;
  now: Date;
  gscThresholds?: { impressionsPct: number; clicksAbsolute: number };
}

export function planScrapeStrategy(inputs: ScrapeStrategyInputs): ScrapePlan;
```

The function is dependency-free (no fetch, no FS) — easy to test the decision matrix exhaustively.

### Findings carry-forward

For each URL in `plan.skip`:
- Look up `priorState.urls[url].findingIds`
- Reconstruct findings from prior state (we need full finding records, not just IDs — see schema note below)
- Mark each carried-forward finding with `carriedForward: true` and `lastVerifiedAt = priorState.urls[url].fetchedAt`

**Schema note:** today's `UrlStateEntry.findingIds` only stores IDs, not full finding records. For carry-forward to work, we either:
- (A) Store full finding records in state. Larger state file (~tens of KB per URL with findings); easy carry-forward.
- (B) Store findings separately (e.g., `priorState.findings: Record<findingId, FindingRecord>`) and reference by ID. Slightly more compact when the same finding fires on many URLs (rare).

v1 picks **(A)** — embed findings in state. The biggest pSEO sites cap at low-MB state files which is fine for `.pseolint/state.json`. Add `findings: Finding[]` to `UrlStateEntry` (or rename `findingIds` to keep history of the rename narrow — see plan).

The current `findingIds: string[]` is kept for backward compatibility within v2 schema; the new `findings: Finding[]` is the source of truth, IDs derived from it.

### Wiring into auditor

The current `auditor.ts` flow at `loadPages` ~line 1086 + `--since` filter ~line 1556 is replaced with:

```
1. discoverCandidateUrls(source) → urls + sitemapLastmodByUrl   // before fetching
2. priorState = readState(...)                                   // existing
3. plan = planScrapeStrategy({ urls, priorState, ... })          // NEW
4. fetched = scrape(plan.refetch.keys())                         // only refetch URLs
5. carriedForward = carryForwardFindings(plan.skip, priorState)  // NEW
6. allFindings = mergeFindings(fetched.findings, carriedForward)
7. writeState(updatedState)                                       // existing, with new fields
8. summary surfaces { fetched: N, carriedForward: M, reasons: ... }
```

Steps 1 and 4 are subtle: `discoverCandidateUrls` must surface sitemap-lastmod as a side output from the existing sitemap walker, not require a separate fetch. The existing `collectUrlsFromSitemap` already parses `<urlset>`; it just discards `<lastmod>`. We extend it to return `Map<url, lastmod>` alongside the URL list.

### CLI flag changes

Today: `--since` is a boolean trigger that piggybacks on prior state existence.

v1: keep `--since` working as a back-compat alias for `--mode=monitoring`. Add explicit:
- `--mode=monitoring` — use the decision matrix (default when prior state exists)
- `--mode=fresh` — full re-audit, ignore prior state for skip decisions (still write new state)
- `--age-floor-days=N` — override the 7d age floor

Behavior table:

| Flag combination | Behavior |
|---|---|
| (none, no prior state) | Full audit, write state |
| (none, prior state) | **Auto-monitoring** (NEW): apply decision matrix |
| `--since` | Same as default with prior state (back-compat) |
| `--mode=monitoring` | Force monitoring mode |
| `--mode=fresh` | Full audit even with prior state |

The auto-monitoring default is a behavior change but it's strictly safer: more pages get re-audited via the matrix than were auto-skipped today, with fewer pages re-fetched. The escape hatch is `--mode=fresh`.

### Audit summary surface

`AuditSummary` extends with:

```ts
interface AuditSummary {
  // existing fields...
  scrapePlan?: {
    fetched: number;
    carriedForward: number;
    reasonCounts: Record<RefetchReason | SkipReason, number>;
    rulesetVersion: string;
    lastFullAuditAt: string | null;
  };
}
```

Web app dashboard consumes this directly to render "5/200 re-scraped, 195 carried forward, last full audit 6 days ago".

CLI prints one line at end of run when monitoring mode was active:
```
Monitoring: 47/4012 URLs re-scraped (changed=12, recheck=23, age=8, new=4), 3965 carried forward.
```

## OSS/Pro boundary

Per the existing OSS/Pro line (memory: `product_reframe_2026_04_21.md`):

| Capability | OSS | Pro |
|---|---|---|
| Decision matrix engine | ✅ | ✅ |
| State persistence + monitoring mode | ✅ | ✅ |
| Findings carry-forward | ✅ | ✅ |
| Auto-monitoring on prior state | ✅ | ✅ |
| Sitemap-lastmod signal | ✅ | ✅ |
| Open-finding recheck | ✅ | ✅ |
| Age floor + ruleset version | ✅ | ✅ |
| GSC delta input | ❌ (field accepted but never populated) | ✅ (v1.1) |
| Continuous monitoring loop, alerts | ❌ | ✅ (already exists in `apps/web/src/inngest`) |
| Carry-forward staleness UX | ❌ | ✅ (Pro dashboard) |

A CI user running `pseolint` weekly against their own site gets the same fetch-reduction profile as a Pro monitoring run, modulated by their sitemap-lastmod hygiene. They don't get the GSC trigger. The decision matrix degrades gracefully when the GSC input is absent: row 6 just never fires.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Skipped page actually changed (lying sitemap, no validators) | Age floor (7d default) forces full re-audit; ruleset version bump invalidates all skips; open findings recheck. |
| New rule shipped, monitoring runs skip pages → rule never runs | Bump `CORE_RULESET_VERSION` in the same PR as the rule. Codify in CONTRIBUTING. |
| Findings carry-forward shows stale data | Always include `lastVerifiedAt` per carried-forward finding so consumers can reason about staleness. Pro dashboard adds visual demotion (separate plan). |
| Cache-busting site (nightly rebuild bumps every `<lastmod>`) | Loses fetch savings but post-fetch content-hash compare still avoids spurious re-flagging. Acceptable degradation. v2 can add lastmod-trust scoring. |
| State file size bloat from embedded findings | Typical: ~few KB per URL × 4k URLs ≈ low-MB state file. Inngest workers can handle this. If real sites cross 50MB, revisit option (B) shape. |
| User has stale state file from manual editing or partial run | Schema version bump on read failure; treat as no prior state. Existing behavior. |

## Migration / rollout

Single release of `@pseolint/core` v0.5.0:
- Schema bump v1→v2; old state discarded with warning
- New behavior: auto-monitoring when prior state exists
- New CLI flags: `--mode`, `--age-floor-days`
- `--since` kept as alias

Web app (`apps/web`) deploys independently after core ships:
- Inngest monitoring functions get the savings automatically (they call `auditSource` and pass prior state path)
- Dashboard summary tile reads `scrapePlan` field; falls back to "—" if absent (graceful with older core)

CHANGELOG entries in both `packages/core/CHANGELOG.md` and `apps/web/CHANGELOG.md`.

## Open questions deferred to follow-up plans

- **Q1 (sitemap-lastmod trust):** HEAD-sample 5% per run, distrust if ETag/Last-Modified disagrees with sitemap. Worth the complexity?
- **Q4 (cache-busting sites):** Detection beyond post-fetch hash compare?
- **Q5 (carry-forward staleness UX):** Confidence demotion after N days. Pro dashboard call.

These do not block v1 — the v1 design is correct without them, just less optimal in some adversarial cases.
