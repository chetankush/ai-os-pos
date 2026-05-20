import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).

export const aiConsoleRoleValues = ['user', 'assistant'] as const;
export type AiConsoleRole = (typeof aiConsoleRoleValues)[number];

/**
 * Persisted transcript of the owner's AI manager (console) chat, per cafe, so
 * the conversation + its context survive page reloads and sessions and the
 * agent can be primed with the recent history on every turn.
 */
export const aiConsoleMessages = pgTable(
  'ai_console_messages',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    role: text({ enum: aiConsoleRoleValues }).notNull(),
    content: text().notNull(),
    // Tool names the assistant invoked for this turn (assistant rows only).
    toolsUsed: jsonb().$type<string[]>(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('ai_console_messages_cafe_created_at_idx').on(table.cafeId, table.createdAt)],
);

export type AiConsoleMessageRow = typeof aiConsoleMessages.$inferSelect;
export type AiConsoleMessageInsert = typeof aiConsoleMessages.$inferInsert;
