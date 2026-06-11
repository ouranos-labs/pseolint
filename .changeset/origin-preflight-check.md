---
"@pseolint/core": minor
---

Add `checkOriginHealth()` — a pre-flight origin probe that runs before an audit is dispatched.

`BackpressureMonitor` only protects an origin *during* a crawl, after dozens of requests have already landed on a struggling server (the paperforge/Neon incident, where each fetch fanned out into uncached DB queries that exhausted the egress quota). `checkOriginHealth()` probes the entry URL a few times first and returns an `ok` / `unreachable` / `degraded` verdict, so callers can refuse to dispatch a full crawl at an origin that's already down or melting.

- SSRF-safe — every probe and redirect hop is re-validated against private/loopback ranges (overridable `validateHop` for tests).
- Conservative: a single transient timeout never trips it. `unreachable` requires *every* probe to fail; `degraded` requires a 5xx majority or sustained latency past the same 8s ceiling `BackpressureMonitor` uses. 4xx is not treated as degradation.
- Fail-open: never throws, so a bug in the check can't block a legitimate audit.

The hosted app wires this into `POST /api/audits` ahead of Inngest dispatch (skippable with `force` or the `DISABLE_ORIGIN_PREFLIGHT` flag).
