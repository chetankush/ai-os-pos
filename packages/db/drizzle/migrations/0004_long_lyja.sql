ALTER TABLE "cafes" ADD COLUMN "online_payment_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cafes" ADD COLUMN "qr_prepaid_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_payment_id" text;