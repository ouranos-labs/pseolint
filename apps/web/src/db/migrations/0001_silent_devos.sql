CREATE TABLE "monitored_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_url" text NOT NULL,
	"host" text NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"alert_email" text,
	"alert_threshold" integer DEFAULT 10 NOT NULL,
	"last_audit_id" uuid,
	"last_score" integer,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitored_domain_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"previous_audit_id" uuid,
	"previous_score" integer,
	"current_score" integer NOT NULL,
	"new_rule_ids" text[] DEFAULT '{}' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD CONSTRAINT "monitored_domain_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_alert" ADD CONSTRAINT "monitoring_alert_monitored_domain_id_monitored_domain_id_fk" FOREIGN KEY ("monitored_domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitored_user_idx" ON "monitored_domain" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "monitored_next_run_idx" ON "monitored_domain" USING btree ("next_run_at","paused");--> statement-breakpoint
CREATE UNIQUE INDEX "monitored_user_domain_uniq" ON "monitored_domain" USING btree ("user_id","host");--> statement-breakpoint
CREATE INDEX "alert_domain_idx" ON "monitoring_alert" USING btree ("monitored_domain_id");