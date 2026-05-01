CREATE TABLE "fix_manifest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"schema_version" text NOT NULL,
	"domain" text NOT NULL,
	"verdict" text NOT NULL,
	"page_patch_count" integer DEFAULT 0 NOT NULL,
	"template_patch_count" integer DEFAULT 0 NOT NULL,
	"domain_patch_count" integer DEFAULT 0 NOT NULL,
	"valid_patch_count" integer DEFAULT 0 NOT NULL,
	"total_patch_count" integer DEFAULT 0 NOT NULL,
	"manifest_key" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"budget_usd" numeric(10, 4) NOT NULL,
	"spent_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"model_id" text,
	"provider_id" text,
	"log_key" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "scrape_plan" jsonb;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "og_title" text;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "og_description" text;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "og_image_url" text;--> statement-breakpoint
ALTER TABLE "fix_manifest" ADD CONSTRAINT "fix_manifest_session_id_orchestrator_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."orchestrator_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_session" ADD CONSTRAINT "orchestrator_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fix_manifest_slug_uniq" ON "fix_manifest" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "fix_manifest_session_idx" ON "fix_manifest" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "fix_manifest_domain_idx" ON "fix_manifest" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "orch_session_user_idx" ON "orchestrator_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orch_session_status_idx" ON "orchestrator_session" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orch_session_started_idx" ON "orchestrator_session" USING btree ("started_at");