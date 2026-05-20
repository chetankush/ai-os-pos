import { type Database, schema } from '@sangam/db';
import type { AuditActorType, AuditLog } from '@sangam/types';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

/** Input to record a single audit entry. The id + createdAt are server-set. */
export interface RecordAuditInput {
  cafeId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogListOptions {
  /** Page size, newest first. Defaults applied in the repo (50, max 200). */
  limit?: number;
  /** Filter to a single action key, e.g. 'order.void'. */
  action?: string;
  /** ISO timestamps to bound createdAt (inclusive). */
  from?: string;
  to?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toAuditLog(row: schema.AuditLogRow): AuditLog {
  return {
    id: row.id,
    cafeId: row.cafeId,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Append-only writer. Other code (order voids, refunds, settlements, …) calls
 * this to leave an immutable trail. Deliberately standalone (not on the repo
 * interface) so it can be imported anywhere a `Database` is in hand.
 */
export async function recordAudit(db: Database, input: RecordAuditInput): Promise<AuditLog> {
  const [row] = await db
    .insert(schema.auditLogs)
    .values({
      cafeId: input.cafeId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert audit log — empty returning() result');
  return toAuditLog(row);
}

export interface AuditLogsRepository {
  /** Newest-first, optionally filtered by action and/or a createdAt window. */
  list(cafeId: string, opts?: AuditLogListOptions): Promise<{ logs: AuditLog[]; limit: number }>;
  /** Re-exposed here so routes can write via the repo if they prefer. */
  record(input: RecordAuditInput): Promise<AuditLog>;
}

export function createDrizzleAuditLogsRepo(db: Database): AuditLogsRepository {
  return {
    async list(cafeId, opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

      const conditions = [eq(schema.auditLogs.cafeId, cafeId)];
      if (opts.action) conditions.push(eq(schema.auditLogs.action, opts.action));
      if (opts.from) conditions.push(gte(schema.auditLogs.createdAt, opts.from));
      if (opts.to) conditions.push(lte(schema.auditLogs.createdAt, opts.to));

      const rows = await db
        .select()
        .from(schema.auditLogs)
        .where(and(...conditions))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(limit);

      return { logs: rows.map(toAuditLog), limit };
    },

    record(input) {
      return recordAudit(db, input);
    },
  };
}
