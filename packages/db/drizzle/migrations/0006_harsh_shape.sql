CREATE TABLE "restaurant_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"label" text NOT NULL,
	"area" text,
	"shape" text DEFAULT 'square' NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"guest_name" text,
	"guest_phone" text,
	"party_size" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_tables_cafe_label_idx" ON "restaurant_tables" USING btree ("cafe_id","label");--> statement-breakpoint
CREATE INDEX "restaurant_tables_cafe_idx" ON "restaurant_tables" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "table_sessions_cafe_status_idx" ON "table_sessions" USING btree ("cafe_id","status");--> statement-breakpoint
CREATE INDEX "table_sessions_table_idx" ON "table_sessions" USING btree ("table_id");