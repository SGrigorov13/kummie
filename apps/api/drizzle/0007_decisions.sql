ALTER TABLE "suppliers" ALTER COLUMN "close_weekdays" SET DEFAULT '{1,4}';--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "close_hour" SET DEFAULT 8;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "first_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "close_minute" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "in_eu" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "batches" SET "first_closes_at" = "closes_at" WHERE "first_closes_at" IS NULL;
