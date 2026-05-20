import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: FKs declared at SQL level in the migration (see drizzle/migrations).

export const auditActorTypeValues = ['owner', 'staff', 'system'] as const;
export type AuditActorType = (typeof auditActorTypeValues)[number];

/**
 * Append-only audit trail of sensitive actions (voids, refunds, discounts,
 * settlements, staff/role changes, …). This table is INSERT-only by contract:
 * the repository exposes NO update or delete operations. It is the source of
 * truth for the "who did what, when" record (positioning weapon vs. rivals).
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cafeId: uuid().notNull(),
    // Who performed the action.
    actorType: text({ enum: auditActorTypeValues }).notNull().default('system'),
    actorId: text(),
    actorName: text(),
    // Dotted action key, e.g. 'order.void', 'discount.apply', 'staff.create'.
    action: text().notNull(),
    // The thing acted upon (optional), e.g. 'order' / <orderId>.
    entityType: text(),
    entityId: text(),
    // Human-readable one-line description for the log UI.
    summary: text().notNull(),
    // Structured extras (amounts, before/after, reason, …).
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_cafe_created_at_idx').on(table.cafeId, table.createdAt),
    index('audit_logs_cafe_action_idx').on(table.cafeId, table.action),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
