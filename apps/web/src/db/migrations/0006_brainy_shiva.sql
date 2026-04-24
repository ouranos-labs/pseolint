CREATE TABLE "domain_data_source" (
	"domain_id" uuid PRIMARY KEY NOT NULL,
	"records" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_rule_override" (
	"domain_id" uuid PRIMARY KEY NOT NULL,
	"overrides" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_data_source" ADD CONSTRAINT "domain_data_source_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_rule_override" ADD CONSTRAINT "domain_rule_override_domain_id_monitored_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_key" ADD CONSTRAINT "user_ai_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;