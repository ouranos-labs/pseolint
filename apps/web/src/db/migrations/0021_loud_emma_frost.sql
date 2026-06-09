ALTER TABLE "audit" ADD COLUMN "truncated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit" ADD COLUMN "truncated_reason" text;