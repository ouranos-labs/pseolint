CREATE TABLE "growth_search_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"week_bucket" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"position_avg" numeric(6, 2),
	"ctr_avg" numeric(6, 4),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "growth_metrics_key_uniq" ON "growth_search_metrics" USING btree ("url","query","week_bucket");--> statement-breakpoint
CREATE INDEX "growth_metrics_week_idx" ON "growth_search_metrics" USING btree ("week_bucket");