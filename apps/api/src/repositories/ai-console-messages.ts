import { type Database, schema } from '@sangam/db';
import type { AiConsoleMessage, AiConsoleRole } from '@sangam/types';
import { desc, eq } from 'drizzle-orm';

export interface NewAiConsoleMessage {
  role: AiConsoleRole;
  content: string;
  toolsUsed?: string[] | null;
}

export interface AiConsoleMessagesRepository {
  /** Recent turns for a cafe, oldest-first (for display + as agent context). */
  listRecent(cafeId: string, limit?: number): Promise<AiConsoleMessage[]>;
  append(cafeId: string, msg: NewAiConsoleMessage): Promise<AiConsoleMessage>;
  clear(cafeId: string): Promise<void>;
}

export function createDrizzleAiConsoleMessagesRepo(db: Database): AiConsoleMessagesRepository {
  return {
    async listRecent(cafeId, limit = 50) {
      const rows = await db
        .select()
        .from(schema.aiConsoleMessages)
        .where(eq(schema.aiConsoleMessages.cafeId, cafeId))
        .orderBy(desc(schema.aiConsoleMessages.createdAt))
        .limit(limit);
      // Stored newest-first for the limit; return oldest-first for chronological use.
      return rows.reverse().map((r) => ({ ...r, toolsUsed: r.toolsUsed ?? null }));
    },

    async append(cafeId, msg) {
      const [row] = await db
        .insert(schema.aiConsoleMessages)
        .values({
          cafeId,
          role: msg.role,
          content: msg.content,
          toolsUsed: msg.toolsUsed ?? null,
        })
        .returning();
      if (!row) throw new Error('Failed to insert AI console message');
      return { ...row, toolsUsed: row.toolsUsed ?? null };
    },

    async clear(cafeId) {
      await db
        .delete(schema.aiConsoleMessages)
        .where(eq(schema.aiConsoleMessages.cafeId, cafeId));
    },
  };
}
