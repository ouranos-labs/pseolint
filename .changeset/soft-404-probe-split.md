---
"@pseolint/core": patch
---

Internal: split the cheerio-dependent soft-404 probe (`evaluateProbe`) into its own module (`rules/tech/soft-404-probe.ts`) so `soft404Rule` and the `./rules/tech/soft-404` subpath stay parser-free — letting the browser extension import the rule without pulling cheerio into the service-worker bundle. Behaviour-neutral (audit output unchanged); `evaluateProbe` is still called internally by the auditor and remains covered by tests. The only externally-visible change is that `evaluateProbe` is no longer re-exported from the package root (it had no external consumers).
