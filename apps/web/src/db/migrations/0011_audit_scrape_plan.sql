-- v0.5+ change-driven monitoring summary mirrored from AuditSummary.scrapePlan.
-- Lets the per-domain dashboard render "X/Y URLs re-scraped, Z carried forward"
-- without reading the full R2 blob. Nullable: only populated on monitoring
-- runs (prior state existed and not --mode=fresh); fresh / one-shot /
-- filesystem audits don't produce a scrapePlan, so legacy rows + non-monitoring
-- runs leave this column null.
ALTER TABLE "audit" ADD COLUMN "scrape_plan" jsonb;
