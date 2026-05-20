CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"selection_type" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_price_paise" integer NOT NULL,
	"image_url" text,
	"is_vegetarian" boolean DEFAULT true NOT NULL,
	"is_vegan" boolean DEFAULT false NOT NULL,
	"contains_egg" boolean DEFAULT false NOT NULL,
	"spice_level" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modifier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta_paise" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "menu_categories_cafe_id_idx" ON "menu_categories" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "menu_categories_cafe_sort_idx" ON "menu_categories" USING btree ("cafe_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_item_modifiers_item_id_idx" ON "menu_item_modifiers" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_items_cafe_id_idx" ON "menu_items" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "menu_items_cafe_category_idx" ON "menu_items" USING btree ("cafe_id","category_id");--> statement-breakpoint
CREATE INDEX "menu_items_cafe_available_idx" ON "menu_items" USING btree ("cafe_id","is_available");--> statement-breakpoint
CREATE INDEX "menu_modifier_options_modifier_id_idx" ON "menu_modifier_options" USING btree ("modifier_id");--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_cafe_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_cafe_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_modifier_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "menu_item_modifiers"("id") ON DELETE CASCADE;
