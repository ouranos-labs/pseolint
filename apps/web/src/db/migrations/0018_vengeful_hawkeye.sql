CREATE TABLE "leaderboard_claim" (
	"host" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"og_title_override" text,
	"og_description_override" text,
	"pinned_audit_id" uuid,
	"is_hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_claim" ADD CONSTRAINT "leaderboard_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leaderboard_claim_user_idx" ON "leaderboard_claim" USING btree ("user_id");