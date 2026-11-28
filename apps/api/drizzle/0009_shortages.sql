CREATE TYPE "public"."shortage_kind" AS ENUM('missing', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."shortage_status" AS ENUM('open', 'arrived', 'refunded');--> statement-breakpoint
CREATE TABLE "batch_damage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"supplier_sku" text NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"photo" "bytea",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_damage_qty" CHECK ("batch_damage"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "shortages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_line_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"damage_id" uuid,
	"kind" "shortage_kind" NOT NULL,
	"qty" integer NOT NULL,
	"due_on" date NOT NULL,
	"status" "shortage_status" DEFAULT 'open' NOT NULL,
	"claim_sent_at" timestamp with time zone,
	"refund_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortages_qty" CHECK ("shortages"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "refunded_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_damage" ADD CONSTRAINT "batch_damage_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_batch_line_id_batch_lines_id_fk" FOREIGN KEY ("batch_line_id") REFERENCES "public"."batch_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_damage_id_batch_damage_id_fk" FOREIGN KEY ("damage_id") REFERENCES "public"."batch_damage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_damage_batch_sku_unique" ON "batch_damage" USING btree ("batch_id","supplier_sku");--> statement-breakpoint
CREATE UNIQUE INDEX "shortages_line_kind_unique" ON "shortages" USING btree ("batch_line_id","kind");--> statement-breakpoint
CREATE INDEX "shortages_status_idx" ON "shortages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shortages_order_idx" ON "shortages" USING btree ("order_id");