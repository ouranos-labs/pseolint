-- v0.4 §4.11 — site-classifier output, additive jsonb column on audit.
-- Nullable so existing rows (legacy v0.3 audits + in-flight v0.4 audits
-- written between deploy of the engine change and this migration) stay
-- valid. The column carries the full SiteClassification shape:
--   { type, confidence, signals[], suppressedRules[] }
ALTER TABLE "audit" ADD COLUMN "site_classification" jsonb;
