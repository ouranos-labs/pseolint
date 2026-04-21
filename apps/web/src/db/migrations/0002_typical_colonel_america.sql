CREATE TABLE "blocklist" (
	"key" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
