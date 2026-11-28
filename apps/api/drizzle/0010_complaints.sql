CREATE TYPE "public"."complaint_channel" AS ENUM('site', 'email', 'phone', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."complaint_demand" AS ENUM('repair', 'replacement', 'price_reduction', 'refund');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'resolved', 'rejected');--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "complaints_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid,
	"order_line_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"product" text NOT NULL,
	"description" text NOT NULL,
	"demand" "complaint_demand" NOT NULL,
	"channel" "complaint_channel" NOT NULL,
	"locale" text DEFAULT 'bg' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_on" date NOT NULL,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"outcome" text,
	"resolved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_seq_unique" ON "complaints" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "complaints_order_idx" ON "complaints" USING btree ("order_id");