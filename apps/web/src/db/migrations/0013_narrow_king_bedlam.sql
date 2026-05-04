CREATE TABLE "watched_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitored_domain_id" uuid NOT NULL,
	"url" text NOT NULL,
	"added_by_user_id" text NOT NULL,
	"last_audited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watched_page" ADD CONSTRAINT "watched_page_monitored_domain_id_monitored_domain_id_fk" FOREIGN KEY ("monitored_domain_id") REFERENCES "public"."monitored_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_page" ADD CONSTRAINT "watched_page_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watched_page_domain_idx" ON "watched_page" USING btree ("monitored_domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_page_domain_url_uniq" ON "watched_page" USING btree ("monitored_domain_id","url");