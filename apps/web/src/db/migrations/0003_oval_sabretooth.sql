CREATE TABLE "alerts_dedup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"template_signature" text NOT NULL,
	"iso_week" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"template_signature" text NOT NULL,
	"severity_latest" text NOT NULL,
	"affected_page_count" integer DEFAULT 0 NOT NULL,
	"rank_score" numeric(12, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"snooze_until" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rule_message_latest" text NOT NULL,
	"representative_url" text
);
--> statement-breakpoint
CREATE TABLE "gsc_page_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"url" text NOT NULL,
	"month_bucket" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"position_avg" numeric(6, 2),
	"ctr_avg" numeric(6, 4),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"encrypted_tokens" text,
	"scope" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "last_full_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts_dedup" ADD CONSTRAINT "alerts_dedup_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings_state" ADD CONSTRAINT "findings_state_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_page_metrics" ADD CONSTRAINT "gsc_page_metrics_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_token" ADD CONSTRAINT "upload_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedup_key_uniq" ON "alerts_dedup" USING btree ("domain_id","rule_id","template_signature","iso_week");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_state_key_uniq" ON "findings_state" USING btree ("domain_id","rule_id","template_signature");--> statement-breakpoint
CREATE INDEX "findings_state_queue_idx" ON "findings_state" USING btree ("domain_id","status","rank_score");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_metrics_key_uniq" ON "gsc_page_metrics" USING btree ("domain_id","url","month_bucket");--> statement-breakpoint
CREATE INDEX "gsc_metrics_domain_idx" ON "gsc_page_metrics" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_user_kind_uniq" ON "integration" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "upload_token_user_idx" ON "upload_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_token_hash_uniq" ON "upload_token" USING btree ("token_hash");