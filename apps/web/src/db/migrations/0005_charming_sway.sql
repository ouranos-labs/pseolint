ALTER TABLE "monitored_domain" ADD COLUMN "verification_token" text;--> statement-breakpoint
ALTER TABLE "monitored_domain" ADD COLUMN "verified_at" timestamp with time zone;