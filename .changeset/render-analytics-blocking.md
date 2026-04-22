---
"@pseolint/core": minor
"pseolint": minor
---

feat: render-mode analytics blocking + aeo/summary-bait composite rule

Two additions closing concrete gaps from the v0.3.0 dogfood:

## aeo/summary-bait (new rule, severity: error)

A composite rule that fires when a page is "optimized for summarization,
not retention" — the worst-case zero-click shape:

  1. Has a strong answer-first opener (passes aeo/answer-first), AND
  2. Has NO interactive / downloadable / gated value on the page, AND
  3. Has its citable facts concentrated in the opener (≥70% of facts sit
     in the first 150 words).

The overlap of these three signals is where AI Overviews can summarise
the entire page inline and the reader never clicks through. Today each
signal fires separately; this rule surfaces the worst combination as a
single structural-fix finding with remediation.

Config keys on AuditOptions (per-rule options object):
  - openerWordCount              (default 150)
  - openerFactConcentrationThreshold (default 0.7)
  - minFactsToAnalyze            (default 3)

Public API: `summaryBaitRule(pages, entityPatterns, options?)` exported
from the package entry point. Page-scoped in RULE_SCOPE (runs in diff
audits).

## feat: block third-party analytics in render-mode audits by default

Rendered-mode audits launch real Chromium via Playwright — previously this
meant every client-side analytics beacon fired on every page visit, injecting
fake sessions into the site owner's GA / Plausible / PostHog / Mixpanel /
Hotjar / Sentry dashboards and polluting whatever conversion data they rely
on. Auditing a 4 000-page site could easily push thousands of junk pageviews
into their analytics.

v0.3.1 intercepts outbound requests at the browser-context level and aborts
any whose hostname matches the built-in blocklist of analytics / session-
replay / RUM vendors. The audit still reaches the origin to fetch HTML, CSS,
JS, fonts, images, and anything else needed to render — only the telemetry
endpoints are cut.

Other render-mode hardening in the same change:
  - distinctive UA: `Mozilla/5.0 (compatible; pseolint-render/0.3.1;
    +https://pseolint.dev/bot)` so server-side filters (GA4 internal-traffic
    rules, Cloudflare bot score, log filters) can drop the requests too
  - `DNT: 1` and `Sec-GPC: 1` request headers (privacy-respecting analytics
    honor these)
  - `window.__pseolint_audit = true` pre-navigation init script so
    cooperating sites can short-circuit their own analytics bootloader

## Config

New `AuditOptions.render.analyticsMode`:
  - `"block"` (default) — abort known analytics hosts
  - `"allow-first-party"` — block third-party analytics only; same-origin
    beacons pass through (for sites that self-host analytics)
  - `"allow"` — don't intercept anything (only for sites you own)

New `AuditOptions.render.extraBlockedHosts: string[]` — extra host
substrings to block (e.g. an internal metrics endpoint).

## CLI

    pseolint <site> --render --analytics=block               # default
    pseolint <site> --render --analytics=allow-first-party
    pseolint <site> --render --analytics=allow
    pseolint <site> --render --block-host=my-metrics.corp --block-host=…

## Public API additions

  - `DEFAULT_ANALYTICS_HOSTS` — readonly list of blocklisted host tokens
  - `isAnalyticsRequest(url, { mode?, pageOrigin?, blockedHosts?, extraBlockedHosts? })`
  - `AnalyticsMode` type

## Not changed

The non-render default `fetch()` path was already analytics-safe (no JS
executes), and that behaviour is unchanged. This release only affects
`--render` / `options.render` consumers.
