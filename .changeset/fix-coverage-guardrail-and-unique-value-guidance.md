---
"@pseolint/core": patch
---

Sitemap coverage guardrail + axis-aware unique-value guidance (fixes #3, #4)

**#4 — declared-vs-discovered coverage guardrail.** When a sitemap is found at
discovery, two independent under-coverage signals now flag the run `truncated`
with `truncatedKind: "coverage"` (distinct from the backpressure
`"backpressure"` kind), reusing the existing partial-coverage surface
(CLI/Action/MCP/web):

- **(A) unreachable child sitemaps.** `collectUrlsFromSitemap` now reports child
  total/failed counts, so a sitemap **index** whose children 404 / aren't valid
  sitemaps / exceed the depth cap is flagged — the case a URL-count comparison
  can never see, and the original false-negative class.
- **(B) fetch shortfall.** Far fewer pages were FETCHED than the sitemap
  declares. Compared against pages actually fetched (pre-filter, pre-sample) and
  bounded by every deliberate limit (explicit `--sample-size`, crawl cap,
  declared total) — so noindex / non-HTML pages, intentional sampling, and a
  small crawl cap do **not** false-fire (the two false positives the first cut
  shipped with).

Adds `AuditSummary.truncatedKind: "backpressure" | "coverage"` (+ JSON schema)
so consumers and CI can branch on the cause rather than overloading one boolean.

**#3 — `content/unique-value` guidance.** The fix string is now axis-aware
(warns that content shared across same-axis sibling pages — boilerplate,
per-axis data — does NOT count), the message surfaces the shared-vs-unique word
split, and tokenization strips surrounding punctuation so `"word"` / `"word."`
count as one token (removing false precision in the surfaced counts).

Also routed a remaining `splice(0, n, ...big)` spread through the iterative
`pushAll` helper (same V8 argument-cap class as the earlier crash fix).
