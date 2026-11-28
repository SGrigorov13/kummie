ALTER TABLE "suppliers" ADD COLUMN "transit_days_min" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "transit_days_max" integer DEFAULT 5 NOT NULL;