CREATE TABLE "indexing_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"domain_id" uuid NOT NULL,
	"url" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "audit_leaderboard_idx";--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "host" text;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "gentle_audit_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "indexnow_key" text;--> statement-breakpoint
ALTER TABLE "indexing_request" ADD CONSTRAINT "indexing_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexing_request" ADD CONSTRAINT "indexing_request_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_request_domain_url_idx" ON "indexing_request" USING btree ("domain_id","url");--> statement-breakpoint
CREATE INDEX "indexing_request_user_idx" ON "indexing_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_leaderboard_idx" ON "audit" USING btree ("is_public","status","host","risk");