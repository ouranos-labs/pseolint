ALTER TABLE "audit" RENAME COLUMN "score" TO "risk";--> statement-breakpoint
ALTER TABLE "monitored_domain" RENAME COLUMN "last_score" TO "last_risk";--> statement-breakpoint
ALTER TABLE "monitoring_alert" RENAME COLUMN "previous_score" TO "previous_risk";--> statement-breakpoint
ALTER TABLE "monitoring_alert" RENAME COLUMN "current_score" TO "current_risk";--> statement-breakpoint
ALTER TABLE "alert_default" RENAME COLUMN "score_drop_threshold" TO "risk_rise_threshold";
