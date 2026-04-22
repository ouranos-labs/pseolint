CREATE TABLE "alert_default" (
	"user_id" text PRIMARY KEY NOT NULL,
	"score_drop_threshold" integer DEFAULT 10 NOT NULL,
	"recipient_emails" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"month_yyyymm" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Backfill slugs for existing audits
ALTER TABLE "audit" ADD COLUMN "slug" text;
UPDATE "audit" SET "slug" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) WHERE "slug" IS NULL;
ALTER TABLE "audit" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "audit_slug_uniq" ON "audit" USING btree ("slug");
--> statement-breakpoint
-- Backfill slugs for existing monitored domains
ALTER TABLE "monitored_domain" ADD COLUMN "slug" text;
UPDATE "monitored_domain" SET "slug" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) WHERE "slug" IS NULL;
ALTER TABLE "monitored_domain" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "monitored_slug_uniq" ON "monitored_domain" USING btree ("slug");
--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_default" ADD CONSTRAINT "alert_default_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_log_pk" ON "usage_log" USING btree ("user_id","kind","month_yyyymm");--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD CONSTRAINT "monitored_domain_slug_unique" UNIQUE("slug");
