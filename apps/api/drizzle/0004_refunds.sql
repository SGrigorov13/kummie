CREATE TYPE "public"."refund_reason" AS ENUM('shortage', 'withdrawal', 'cancelled', 'damaged', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('succeeded', 'pending', 'failed');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider_refund_id" text,
	"amount_cents" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"status" "refund_status" NOT NULL,
	"actor" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_unique" ON "refunds" USING btree ("idempotency_key");