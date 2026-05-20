CREATE TABLE "ai_console_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cafe_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tools_used" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_console_messages_cafe_created_at_idx" ON "ai_console_messages" USING btree ("cafe_id","created_at");