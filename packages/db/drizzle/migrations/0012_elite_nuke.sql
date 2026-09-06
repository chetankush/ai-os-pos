ALTER TABLE "order_items" ADD COLUMN "hsn_snapshot" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_gstin" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bill_print_count" integer DEFAULT 0 NOT NULL;