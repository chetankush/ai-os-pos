CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"method" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_payments_cafe_created_at_idx" ON "order_payments" USING btree ("cafe_id","created_at");