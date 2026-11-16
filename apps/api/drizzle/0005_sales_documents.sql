CREATE TYPE "public"."document_kind" AS ENUM('receipt', 'receipt_storno', 'invoice', 'credit_note');--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"series" text PRIMARY KEY NOT NULL,
	"last_number" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"series" text NOT NULL,
	"number" bigint NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refers_to_id" uuid,
	"refund_id" uuid,
	"total_cents" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "auth_code" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "terminal_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "transaction_ref" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_number_unique" ON "sales_documents" USING btree ("series","number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_order_kind_unique" ON "sales_documents" USING btree ("order_id","kind") WHERE "sales_documents"."kind" in ('receipt', 'invoice');--> statement-breakpoint
CREATE INDEX "sales_documents_order_idx" ON "sales_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_documents_issued_idx" ON "sales_documents" USING btree ("issued_at");