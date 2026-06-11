---
"@pseolint/core": minor
---

Add `checkOriginHealth()` — a pre-flight origin probe that runs before an audit crawls.

`BackpressureMonitor` only protects an origin *during* a crawl, after dozens of requests have already landed on a struggling server (the paperforge/Neon incident, where each fetch fanned out into uncached DB queries that exhausted the egress quota). `checkOriginHealth()` fires a handful of **concurrent** probes at the entry URL first — concurrent, so it observes the origin the way the real crawl hits it (parallel fan-out), not a rosier one-request-at-a-time picture — and returns an `ok` / `unreachable` / `degraded` verdict.

- SSRF-safe — every probe and redirect hop is re-validated against private/loopback ranges (overridable `validateHop` for tests).
- Conservative: a single transient timeout never trips it. `unreachable` requires *every* probe to fail; `degraded` requires a 5xx majority or sustained latency past the same 8s ceiling `BackpressureMonitor` uses. 4xx is not treated as degradation.
- Concurrent probes keep the wall-clock cost to ~one request, so wiring it onto a request path doesn't add N× latency.
- Fail-open: never throws, so a bug in the check can't block a legitimate audit.

In the hosted app, the public `POST /api/audits` route blocks only `unreachable` origins (nothing to audit), and the `run-audit` worker — which every audit path runs through, including the monitoring cron — pre-flights the origin and drops a `degraded`/`unreachable` one to gentle (low-concurrency) mode instead of finishing off a struggling server.
