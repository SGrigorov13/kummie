CREATE TYPE "public"."return_courier" AS ENUM('speedy', 'econt', 'boxnow');--> statement-breakpoint
CREATE TYPE "public"."return_decision" AS ENUM('pending', 'accepted', 'refused');--> statement-breakpoint
CREATE TYPE "public"."return_disposition" AS ENUM('to_supplier', 'keep');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'received', 'refunded', 'rejected');--> statement-breakpoint
CREATE TABLE "return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"decision" "return_decision" DEFAULT 'pending' NOT NULL,
	"refuse_reason" text,
	"disposition" "return_disposition",
	CONSTRAINT "return_lines_qty" CHECK ("return_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "returns_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"status" "return_status" DEFAULT 'requested' NOT NULL,
	"courier" "return_courier" NOT NULL,
	"reason" text,
	"refund_due_on" date NOT NULL,
	"received_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"refund_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_lines_return_line_unique" ON "return_lines" USING btree ("return_id","order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "returns_seq_unique" ON "returns" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_status_idx" ON "returns" USING btree ("status");