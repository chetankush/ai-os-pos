CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent_paise" integer DEFAULT 0 NOT NULL,
	"last_order_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"note" text,
	"incurred_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"stock_qty" integer,
	"low_stock_threshold" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "gst_rate_bp_override" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_cafe_phone_idx" ON "customers" USING btree ("cafe_id","phone");--> statement-breakpoint
CREATE INDEX "customers_cafe_idx" ON "customers" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "expenses_cafe_incurred_on_idx" ON "expenses" USING btree ("cafe_id","incurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_stock_menu_item_idx" ON "menu_item_stock" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "menu_item_stock_cafe_idx" ON "menu_item_stock" USING btree ("cafe_id");