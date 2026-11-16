CREATE TYPE "public"."product_state" AS ENUM('NEW_DROP', 'IN_STOCK_EU', 'PRE_ORDER');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sourcing" AS ENUM('OFFICIAL', 'KUMMIE_ORIGINAL', 'LICENSED', 'SUPPLIER_DIRECT');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name_bg" text NOT NULL,
	"name_en" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"generation" integer NOT NULL,
	"aka" text,
	"editorial_check" boolean DEFAULT true NOT NULL,
	CONSTRAINT "groups_generation_range" CHECK ("groups"."generation" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "product_compliance" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"dispatch_estimate_bg" text,
	"dispatch_estimate_en" text,
	"delivery_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"manufacturer" text,
	"eu_responsible_person" text,
	"safety_info" jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_none" boolean DEFAULT false NOT NULL,
	"return_exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"return_exceptions_none" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt_bg" text DEFAULT '' NOT NULL,
	"alt_en" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_keywords" (
	"product_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	CONSTRAINT "product_keywords_product_id_keyword_pk" PRIMARY KEY("product_id","keyword")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary_bg" text DEFAULT '' NOT NULL,
	"summary_en" text DEFAULT '' NOT NULL,
	"subcategory_id" text NOT NULL,
	"group_id" text,
	"sourcing" "sourcing" NOT NULL,
	"state" "product_state",
	"is_limited" boolean DEFAULT false NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"name_bg" text NOT NULL,
	"name_en" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" text NOT NULL,
	"sku" text NOT NULL,
	"price_cents" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_price_positive" CHECK ("variants"."price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_compliance" ADD CONSTRAINT "product_compliance_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keywords" ADD CONSTRAINT "product_keywords_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_subcategory_idx" ON "products" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "products_group_idx" ON "products" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "subcategories_category_idx" ON "subcategories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_unique" ON "variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");