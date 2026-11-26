CREATE TYPE "public"."batch_status" AS ENUM('open', 'closed', 'ordered', 'shipped', 'received');--> statement-breakpoint
CREATE TYPE "public"."parcel_status" AS ENUM('labelled', 'handed_over', 'out_for_delivery', 'delivered', 'exception', 'cancelled');--> statement-breakpoint
CREATE TABLE "batch_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"supplier_sku" text NOT NULL,
	"description" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "batches_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"supplier_id" text NOT NULL,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"postponed" integer DEFAULT 0 NOT NULL,
	"po_reference" text,
	"supplier_reference" text,
	"supplier_tracking" text,
	"closed_at" timestamp with time zone,
	"ordered_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"extra_cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"label_pdf" "bytea" NOT NULL,
	"weight_grams" integer NOT NULL,
	"status" "parcel_status" DEFAULT 'labelled' NOT NULL,
	"handed_over_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_tracked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_sku" text NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_offers_cost_positive" CHECK ("supplier_offers"."unit_cost_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order_email" text,
	"close_weekdays" integer[] DEFAULT '{1,3,5}' NOT NULL,
	"close_hour" integer DEFAULT 12 NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"ddp" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_lines" ADD CONSTRAINT "batch_lines_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lines" ADD CONSTRAINT "batch_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lines" ADD CONSTRAINT "batch_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_lines_order_line_unique" ON "batch_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "batch_lines_batch_idx" ON "batch_lines" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_lines_order_idx" ON "batch_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_one_open_per_supplier" ON "batches" USING btree ("supplier_id") WHERE "batches"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "batches_po_reference_unique" ON "batches" USING btree ("po_reference");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "parcels_tracking_unique" ON "parcels" USING btree ("carrier","tracking_number");--> statement-breakpoint
CREATE INDEX "parcels_order_idx" ON "parcels" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "parcels_status_idx" ON "parcels" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_offers_variant_supplier_unique" ON "supplier_offers" USING btree ("variant_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_offers_variant_idx" ON "supplier_offers" USING btree ("variant_id");