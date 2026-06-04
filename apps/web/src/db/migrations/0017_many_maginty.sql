CREATE TABLE "seed_stats" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"audited_count" integer DEFAULT 0 NOT NULL,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"median_risk" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
