# pseolint Pro: Reframe & Dashboard Redesign

**Date:** 2026-04-21
**Status:** Design approved; implementation plan pending
**Depends on:** existing monitoring-per-domain pivot (2026-04-20); GSC OAuth verification timeline (external)

## 1. Problem statement

The current Pro dashboard is a cadence admin table, it lets users add domains and see when the next re-audit will fire. The pricing page ($19/mo) promises a product: per-domain trend lines, history, AI triage, PDF export. The gap between promise and delivery is wide enough that the dashboard does not defend the price, and it was built against a pivot spec that is only one day old.

Separately, the product currently targets a single persona (technically fluent site owners who can use the CLI) while the addressable market for programmatic-SEO hygiene is dominated by non-technical operators running Webflow CMS, WordPress ACF, Framer, or Wix sites. At $19/mo we need both personas to be first-class, not one as an afterthought.

## 2. Reframe in one sentence

**pseolint Pro is a hosted pSEO quality surface that tells you (every time you ship) which of your template-generated pages are hurting you, ranked by the traffic they are actually getting.**

Two axes lock this in:

- **When is pseolint invoked?** At publish events in whatever workflow the user has: CI, CMS webhook, manual "check this batch," or a daily diff-audit fallback. Not at our crawler's schedule.
- **What grounds the score?** Google Search Console impressions joined with rule hits at URL level. Not our static score alone.

The open-source CLI, action, and core engine stay the funnel. Pro sells the *infrastructure around the engine* (persistence, joins, scheduling, dispatch, team-friendly surfaces) not features hidden behind a paywall.

## 3. Personas

**P1, Technical pSEO operator.** Owns a repo. Uses the CLI locally. Converts to Pro when tired of managing cross-run state, trends, and portfolio aggregation by hand.

**P2, CMS-driven pSEO operator.** Webflow CMS directory, WordPress ACF matrix, Framer programmatic pages, Wix. No repo, no terminal, no CI. Converts to Pro because the CLI is irrelevant to them and the hosted dashboard is the only interaction surface they can use.

**Lead persona: P2.** Onboarding, empty states, and the visual hero are P2-shaped. P1 tolerates any onboarding, they will figure it out. Designing primarily for P2 does not alienate P1 but does unlock a market an order of magnitude larger than hand-rolled Next.js directories.

## 4. OSS / Pro boundary

**OSS (unchanged, already shipped):** full audit engine (`@pseolint/core`), CLI (`@pseolint/cli`), GitHub Action (`@pseolint/action`), local state + `--since` diff runs, `pseolintrc` budgets, action exit codes, AI triage with bring-your-own API key, all formatters except PDF.

**Pro owns:**
- Hosted cross-run persistence across domains and weeks
- GSC OAuth + URL-level join with rule hits
- Scheduled diff-audits and weekly full re-audits
- Alert dispatch (email / Slack / webhook)
- Portfolio-level aggregation with persistent, domain-scoped suppressions
- Managed AI triage (our API keys, daily budget caps, shared prompt cache)
- Private hosted reports with shareable URLs
- PDF export
- Team seats (v1.2+)
- Hosted CMS webhook endpoints (Webflow v1.1, WordPress plugin v1.2)
- GitHub App with PR comments (v1.2, upgrading from action recipe)

**New surface on the CLI side:** a single thin command, `pseolint upload <report.json> --token <t>`. POSTs existing audit JSON to a Pro ingestion endpoint. The CLI stays ignorant of Pro; Pro knows how to ingest OSS output. No coupling in the wrong direction.

## 5. Dashboard: three surfaces, one page

### 5.1 Portfolio strip (top)

One row per monitored domain. Columns: last diff-audit timestamp, pages changed since last check, delta finding count, policy/CI status, GSC-connected indicator (value or "Connect" CTA), link into domain detail. Compact. Replaces the current admin table.

Pause/resume/delete controls move into the domain detail view so no user loses monitoring control, but they stop occupying the primary dashboard real estate.

### 5.2 Fix queue (middle: the money surface)

A flat, ranked list of open findings across all monitored domains.

**Ranking formula:**
- When GSC is connected for the domain:
  `log(1 + monthly_impressions) × severity_weight × affected_pages`
- When GSC is not connected:
  `severity_weight × affected_pages`

**Per row:** rule + one-line human summary (CMS-aware when a CMS pattern is detected), template pattern + affected page count, impact estimate, primary action. Available actions: `open report`, `view pages`, `snooze` (1w / 30d / 90d), `dismiss`. "Acknowledge" is not a distinct state, reading is implicit.

**Suppressions** are persistent and **domain-scoped**. Keyed on `(domain_id, rule_id, template_signature)` so a single "dismiss" on `/state/{s}/city/{c}` covers all 2,000 matched pages and inherits to new pages matching the same inferred template.

**Pagination:** 50 rows per page, URL-state driven (`?page=3`). Keyset pagination on `(rank_score DESC, id)`. Export CSV exposes "export current view" and "export all" explicitly.

### 5.3 Integrations panel (bottom)

A card per connector. Each card shows connected status, last sync, and a "what this enables" blurb.

- **Search Console**: universal. v1 stubbed ("Connect"), v1.1 live.
- **GitHub Action recipe**: P1. v1. Copy-paste YAML snippet using `npx @pseolint/cli audit` + `npx @pseolint/cli upload`. No hosted app in v1.
- **Webflow webhook**: P2. v1.1.
- **WordPress plugin**: P2. v1.2 (plugin-directory review is the long pole).
- **GitHub App with PR comments**: P1. v1.2 (upgrade from action recipe).
- **Daily diff-audit fallback**: universal, default-on for every monitored domain. v1.

Every domain has the fallback. Integrations layer richer triggers on top but are never required for the product to work.

## 6. Core user loops

**P2 onboarding (lead):** sign in → "add your first site" (URL) → background first audit kicks off → user lands on fix queue, pre-populated as the audit completes → prominent-but-skippable CTA: "Connect Search Console to prioritize by traffic." Goal: sign-up to clicking a real finding in under 3 minutes, zero external setup.

**P1 onboarding:** same entry, but the Integrations panel surfaces the GitHub Action YAML snippet prominently, and the empty state mentions "or upload CI results from your repo."

**Day-2 loop:** Monday 06:00 UTC cron sends a digest email with the top 3 fix-queue items for the week. User clicks through, lands on fix queue, acts on one item, snoozes or dismisses others.

**Publish-event loop:** trigger fires (CLI upload, CMS webhook, or daily diff-audit poll) → audit runs on new or changed URLs → findings merge into `findings_state` → alerts dispatch only if a budget violation or score-delta threshold is crossed (see §10 for alert gating).

## 7. Data model additions

New tables on top of existing `monitored_domains` and `audits`:

- **`findings_state`**: per-domain persistent finding rollup. Key: `(domain_id, rule_id, template_signature)`. Columns: first-seen, last-seen, affected-page-count, `severity_latest` (from the most recent run: not the max ever seen), status (`open | snoozed | dismissed`), snooze-until, cached `rank_score`. No `user_id`, forward-compatible with team seats.
- **`integrations`**: one row per `(user_id, kind)`. Kinds: `gsc`, `github`, `webflow`, `wordpress`. Columns: encrypted tokens, last-sync, scope. `user_id` migrates to `org_id` with team seats.
- **`gsc_page_metrics`**: `(domain_id, url, month)` → `impressions, clicks, position, ctr`. Populated daily from the GSC API when the integration is connected.
- **`upload_tokens`**: user-scoped API tokens for `pseolint upload`. Bcrypt-hashed at rest, displayed exactly once at creation.
- **`alerts`**: audit log for outbound alert dispatch with per-rule-per-week dedup key.

Existing `audits` table continues to store per-run snapshots for history and report hosting.

## 8. Scheduler: extend existing Inngest function

Keep the current `monitor-domains` hourly cron. Extend, don't replace. Reasoning: it already implements `nextRunAt`-driven dispatch, per-host throttle, bounded work-per-tick (20 domains), ±30 min jitter, per-user quota, and audit logging. A parallel fanout would duplicate all of this.

**Extensions:**
- Every monitored domain gets **both** cadences: not an either/or. Add `last_full_run_at` on `monitored_domains`. Each hourly dispatch checks: if `now - last_full_run_at >= 7d`, this run is a **full re-audit** and `last_full_run_at` gets updated; otherwise it's a **daily diff-audit**. `next_run_at` bumps by +24h on both kinds (with jitter) so full runs naturally replace the weekly diff on their scheduled day.
- Dispatch selects audit path: diff runs call `executeAuditInProcess(..., { state: { since: true } })`; full runs pass no `since` flag.
- Daily diff-audit runs **per-page rules only**: those whose output depends on a single page, not the corpus. The split is driven by a `scope: "page" | "corpus"` annotation on each rule module, not a hand-maintained list, so the plan's DB migration also touches rule metadata.
- Weekly full re-audit runs **all rules** including corpus-scoped ones (near-duplicate SimHash, entity-swap, template-diversity, template-coverage, cannibalization family).

**Exception:** `pseolint upload` ingests a pre-computed JSON that already contains all rules including cross-page. The scheduler does not re-run; we merge ingested findings into `findings_state` directly. This gives P1 full-rule coverage at their CI cadence without waiting for Monday.

**Weekly digest email:** new Inngest cron at Monday 06:00 UTC in v1. Per-user timezone localization deferred to v1.1+.

## 9. CMS-aware finding messages

A lightweight translation layer on top of existing rule messages. Detects CMS patterns in the URL and rewrites messages with domain-appropriate vocabulary.

Detection rules for v1 (narrow, expandable):
- `/collections/*` or `?collection=` → Webflow CMS vocabulary ("your Collection X has Y")
- `/category/*` or `/tag/*` or `/?p=` → WordPress vocabulary ("your Post Type / Taxonomy X has Y")
- Default → existing generic message

**Collision handling:** some paths match multiple CMS patterns (e.g. `/collections/*` can be WooCommerce as well as Webflow). When patterns collide, we disambiguate with a low-cost secondary signal, a single substring check against the page HTML already in our cache (`wp-content`, `webflow.com/api`, etc.). If no signal disambiguates, we fall back to the generic message rather than guessing. Never block a finding because its CMS pattern is ambiguous.

This is a copy + pattern-match pass, not new rules. Missing patterns fall back to the current generic message. Pattern coverage grows from user feedback after launch.

## 10. Alert gating

Alerts fire only if **either** condition is met, per domain:

1. Composite score delta ≥ 10 between the most recent two audits, **or**
2. A new `(rule_id, template_signature)` combination appears with `critical` or `error` severity: i.e. no `open` row existed in `findings_state` for that key prior to this run.

Using the `(rule_id, template_signature)` grain matches the grain of the fix queue and `findings_state`, avoids a separate per-URL history table, and gives alerts the same cardinality as the user's actionable unit of work.

**Dedup:** `(domain_id, rule_id, template_signature, iso_week)` key in `alerts`. The same combination firing additional pages within the same ISO week does not send a second email.

Below these thresholds: silent. No "everything looks fine" weekly emails (those are the Monday digest, which summarizes fix-queue state, not alert state).

## 11. Pricing-page adjustments

Minor copy shifts to match the reframe:

- "AI triage, Sonnet-class, 50 triages per day" → **"Managed AI triage: no keys to configure, budget caps enforced."** Capability is OSS; Pro sells the ops burden removed.
- "1,000-page crawl budget, 5× the free limit" → clarify this applies to the **web-UI free tier**, not the CLI. CLI has no crawl limit and never will.
- Add line: **"The CLI is free and always will be. Pro adds the infrastructure around it."** Developer-honest positioning converts better than pretending the OSS core is a taste of a walled garden.
- PDF export stays Pro-only (not in OSS core).

## 12. Scope phasing

### v1 (~3 weeks, GSC stubbed)

- Three dashboard surfaces built (portfolio strip, fix queue, integrations panel)
- Daily diff-audit scheduler extension + weekly full re-audit cadence
- `findings_state` table + persistent domain-scoped suppressions
- CMS-aware finding message layer (Webflow + WordPress patterns)
- `pseolint upload` CLI command + `POST /api/audits/upload` ingestion endpoint
- GitHub Action YAML recipe card (no hosted app)
- Fix queue CSV export
- Weekly digest email (Monday 06:00 UTC, simple template)
- Alert gating per §10
- GSC card stubbed with "Connect Search Console" CTA; rank fallback formula in use

### v1.1 (~2 weeks after v1)

- GSC OAuth live once consent screen verification clears
- GSC page-metrics daily fetcher + rank formula switches to impression-weighted
- Webflow webhook receiver + CMS detection upgrade
- PDF export of fix queue

### v1.2+

- WordPress plugin (plugin-directory review adds weeks, not under our control)
- GitHub App with PR comments (upgrade from action recipe)
- Team seats with org-scoped suppressions
- Per-user timezone localization for digest

## 13. Non-goals for v1

- Ranking or traffic **prediction**: we report GSC data, we don't model the future
- Backlink analysis: not our lane
- Content rewriting / AI generation: we are a quality surface, not a producer
- Whitelabel / agency multi-client: deferred to a v2 tier
- Real-time audit: daily diff is the cadence; we are not a streaming product

## 14. Risks and mitigations

**GSC OAuth verification timeline.** New Google Cloud project verification can take 4–6 weeks. Mitigated by stubbing GSC in v1 with a rank-formula fallback; the UI reserves the column and surfaces a prominent "Connect" CTA.

**CMS finding-message translation quality.** Start narrow; expand from user feedback. Missing patterns fall back to existing generic messages. Never block a finding because its CMS pattern is unrecognized.

**Alert fatigue.** Gated per §10. Dedup per-rule-per-week. No "everything's fine" weekly mail.

**Margin compression from managed triage.** Daily budget caps per user. Shared prompt cache across users for common rule clusters. If economics don't work at scale, we tier triage (e.g., Pro gets N/month, a higher tier gets more).

**Loss of existing pause/resume/delete access.** Controls move into domain detail; they do not disappear. Regression risk if this detail page isn't wired on v1 launch.

**Suppression misuse.** Users who dismiss everything will see an empty fix queue and conclude the tool does nothing. Mitigation: show a "X suppressed findings across Y domains" bar above the fix queue so dismissals remain visible.

## 15. Success criteria

- **v1 launch signal:** a P2 user goes from sign-up → monitored domain → clicking a real fix-queue item → reading the report in under 3 minutes with zero external setup.
- **Activation:** ≥ 30% of free-tier sign-ups add at least one monitored domain.
- **Pro retention (30 days):** ≥ 40% of paid accounts open the dashboard at least once a week (fix queue stickiness).
- **v1.1 signal:** GSC-connected accounts show ≥ 2× engagement on fix queue vs. non-connected accounts (validates the join matters).
- **Churn sentinel:** if ≥ 20% of Pro accounts dismiss more than half their findings, the fix queue is not producing actionable output: revisit rule weighting and message quality.

## 16. Open questions for implementation (non-blocking)

- **Rank score recomputation:** materialized weekly vs. recomputed on fix-queue render? Lean: cache `rank_score` on `findings_state` and refresh on finding writes + nightly cron. Simpler than live recomputation, accepts up to 24h staleness for the impressions factor.
- **Upload token rotation:** self-serve rotation UI in v1 or manual? Lean: self-serve rotation + single active token per user in v1.
- **Webflow webhook auth:** HMAC signature from Webflow vs. our own shared-secret token? Lean: Webflow's HMAC when it's available; shared-secret for platforms without signing.
- **GSC row-data privacy floor:** GSC API returns no URL-level data below a traffic threshold. Display strategy when this happens? Lean: show the domain's aggregate impressions in rank scoring and mark individual rows "GSC data withheld (low traffic)." Transparent beats fake.

These can be resolved during implementation without re-opening the design.
