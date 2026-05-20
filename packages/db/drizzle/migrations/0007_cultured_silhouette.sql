CREATE TABLE "invoice_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"fy" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'waiter' NOT NULL,
	"pin_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"opened_by_staff_id" uuid,
	"opening_float_paise" integer DEFAULT 0 NOT NULL,
	"closing_counted_paise" integer,
	"expected_cash_paise" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "cafes" ADD COLUMN "gst_mode" text DEFAULT 'regular_5' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_sequences_cafe_fy_idx" ON "invoice_sequences" USING btree ("cafe_id","fy");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_cafe_name_idx" ON "staff" USING btree ("cafe_id","name");--> statement-breakpoint
CREATE INDEX "staff_cafe_idx" ON "staff" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "audit_logs_cafe_created_at_idx" ON "audit_logs" USING btree ("cafe_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_cafe_action_idx" ON "audit_logs" USING btree ("cafe_id","action");--> statement-breakpoint
CREATE INDEX "cash_drawer_sessions_cafe_status_idx" ON "cash_drawer_sessions" USING btree ("cafe_id","status");