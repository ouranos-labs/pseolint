---
"@pseolint/core": minor
---

New `tech/resource-weight` rule, closing a real hole in `tech/html-size`.

Googlebot's documented crawl cutoff is 2 MB per FETCHED FILE, so a 2.4 MB `bundle.js` is truncated exactly like a 2.4 MB HTML document would be. `tech/html-size` measured only the HTML while citing that doc, which meant an operator reading the finding could reasonably assume their scripts and stylesheets had been checked. They had not been. The new rule errors on any single subresource at or past 2 MB and warns within 25% of it.

It also reports total page weight with a per-kind breakdown (image / script / stylesheet / font / other) at info severity. Read that finding's wording before turning it into a policy: Google documents no total-page-weight and no total-site-size crawl limit, so the number is reported as a Core Web Vitals input and the message says so explicitly. The 5 MB trigger is a reporting floor, not a published threshold (see `docs/folklore.md` #4).

Byte totals come from the browser's Resource Timing buffer, read in the same `--render` pass that already collects LCP and CLS, so this costs one extra `page.evaluate` and zero extra network requests. `RenderedPage.resources` and `ParsedPage.resources` are new optional fields. Both are absent outside `--render`: subresource bytes cannot be known without fetching the assets, and the rule will not issue speculative requests to invent a number. Totals under-report rather than guess, since `transferSize` reads 0 for cross-origin responses without `Timing-Allow-Origin`.
