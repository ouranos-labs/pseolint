---
"@pseolint/core": minor
"pseolint": patch
---

Add `tech/core-web-vitals` rule. Under `--render`, the renderer now installs `largest-contentful-paint` / `layout-shift` PerformanceObservers before navigation and reads them back after networkidle, attaching LCP, CLS, and TTFB to each page. The rule flags pages in Google's "poor" tier (LCP >4000ms, CLS >0.25) as a `warning`, with metric-specific fix guidance. This is a headless-Chromium lab snapshot — a directional signal that catches gross regressions, not CrUX field data; INP is omitted because it needs real interaction a passive crawl can't produce. No-op without `--render` (the rule guards on the presence of measured vitals, exactly like `tech/csr-bailout`).
