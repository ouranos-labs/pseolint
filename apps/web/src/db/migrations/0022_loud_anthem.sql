CREATE TABLE "competitor_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid,
	"url" text NOT NULL,
	"rank" integer NOT NULL,
	"word_count" integer NOT NULL,
	"has_schema" boolean NOT NULL,
	"is_title_rewritten" boolean NOT NULL,
	"is_meta_desc_ignored" boolean NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serp_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"search_url" text NOT NULL,
	"total_results" integer NOT NULL,
	"templated_results" integer NOT NULL,
	"aio_citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "tool" text;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "archetype" text;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "last_verdict" text;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "authority_score" integer;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "render_mode" boolean;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "scan_options" text;--> statement-breakpoint
ALTER TABLE "orchestrator_session" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "competitor_pages" ADD CONSTRAINT "competitor_pages_scan_id_serp_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."serp_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_page_scan_idx" ON "competitor_pages" USING btree ("scan_id");