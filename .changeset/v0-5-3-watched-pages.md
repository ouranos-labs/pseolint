---
"@pseolint/core": patch
"@pseolint/web": patch
---

v0.5.3 — Watched pages (Pro) + cumulative coverage card + plan-limit consolidation.

**`@pseolint/core`:** new `force.urls` option on `auditSource(...)` and `forceRefetchUrls` on `planScrapeStrategy()` — caller-curated URL list that always refetches, short-circuiting the monitoring matrix with a new `RefetchReason = "watched"`. Watched URLs absent from the discovered sitemap are still audited. JSDoc documents the fresh-mode silent-drop limitation.

**`@pseolint/web`:** Pro users can pin up to 20 URLs per monitored domain. Pinned URLs are force-refetched on every monitoring run regardless of diff-mode skip. New `watched_page` table (migration `0013_narrow_king_bedlam.sql`), server actions `addWatchedPage` / `removeWatchedPage` with full validation (SSRF guard, host-match, www-equivalence, atomic 20-page cap, duplicate rejection). Adding a URL fires an immediate `audit/requested` with `force: { urls: [...] }` — gated by the same daily/per-host/per-user-host/in-flight/blocklist suite the public POST `/api/audits` enforces, so the audit-on-add path can't bypass cost protection. Per-domain dashboard now surfaces a cumulative coverage card (total URLs audited across history + 30-day window). Plan limits consolidated into named constants in `lib/audit-limits.ts`: `DAILY_AUDIT_CAP`, `PRO_REAUDIT_SAMPLE_SIZE`, `PRO_MONITOR_SAMPLE_SIZE`, `DOWNGRADED_MONITOR_SAMPLE_SIZE`, `WATCHED_PAGES_CAP` — magic numbers eliminated from `audits/route.ts`, `monitoring.ts`, `domain-actions.ts`, `monitor-domains.ts`.
