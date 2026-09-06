# Dine-in table integrity

**Estimated effort: 29 engineer-days · 11 work items**

The dine-in layer has one root defect with many faces: `orders.table_session_id` is an unvalidated, unindexed, un-foreign-keyed, write-once column, and `table_sessions` has no state machine and no uniqueness guard. That is why a round can reach the kitchen labelled "Walk-in", why a QR order never joins the table's tab, why a tab can be welded to one table forever, and why a ₹2,400 tab can be abandoned by one unconfirmed tap with no audit record. The fix is a schema/constraint pass (FKs, a partial unique index for "one live tab per table", the missing hot-path index), a server-side binding + validation of `tableSessionId` on every order-creation path, then the floor operations a real service needs — move/merge/split, edit guest, billed state, reprint, offline seat/settle — layered on that foundation. For a cafe this is the difference between a demo floor plan and a room a waiter can actually run: food arrives at the right table, QR money lands on the right bill, and every destructive action has a name attached to it.

---

<a id="table-integrity-schema"></a>

## 🔴 `table-integrity-schema` — Constraints, indexes and archival for the table layer (migration 0013)

### Approach

VERIFIED: the auditor is right that no migration declares an FK for restaurant_tables, table_sessions, or orders.table_session_id — `grep 'FOREIGN KEY' packages/db/drizzle/migrations/*.sql` returns only cafes/menu/orders/order_items rows from 0001 and 0002. The comment at packages/db/src/schema/tables.ts:12-14 claiming 'FKs declared at SQL level in the migration' is false for this file. 0005_robust_sinister_six.sql is a single bare ADD COLUMN, and 0006_harsh_shape.sql creates both tables with four plain indexes and zero constraints.

This item lays the foundation every other item stands on. drizzle-kit will NOT emit the FKs (the schema deliberately avoids references() because the CJS loader can't resolve the ESM cross-imports), so the flow is: edit the schema files -> `pnpm --filter @sangam/db db:generate` for the columns/indexes -> hand-append the ALTER TABLE ... ADD CONSTRAINT and the data-repair statements to the generated 0013 file, exactly as 0001/0002 did.

One design decision the auditor did not reach: `ON DELETE RESTRICT` on table_sessions.table_id makes a table with ANY session history undeletable, and history() innerJoins restaurant_tables so hard-deleting a table already corrupts History today. So DELETE becomes archive-or-delete (behaviour lands in session-lifecycle-guards), which needs a nullable `archived_at` and forces the (cafe_id, label) unique index to become partial on `archived_at is null` — otherwise a retired 'T5' permanently blocks a new 'T5'.

The partial unique index cannot be created while duplicate live sessions exist, so the migration carries a deterministic collapse: keep the OLDEST live session per table (the one guests were actually seated on), reattach the losers' orders to it, close the losers. This is a DATA BACKFILL and is destructive-ish — it must be run with the API stopped, and the row counts logged.

The repo currently has no DB-backed test infrastructure (table-sessions.repo.test.ts runs a hand-written fake Drizzle predicate evaluator). A partial unique index and a status-guarded UPDATE cannot be proven against a fake, so this item also adds apps/api/test/db.ts exporting `describeIfDb` — a describe.skipIf wrapper gated on process.env.TEST_DATABASE_URL that migrates a scratch schema once and truncates between tests. Everything from here on that claims a concurrency guarantee gets a test there.

### Schema

packages/db/src/schema/tables.ts — restaurantTables: ADD `archivedAt: timestamp({ withTimezone: true, mode: 'string' })` (nullable). REPLACE `uniqueIndex('restaurant_tables_cafe_label_idx').on(table.cafeId, table.label)` with the same index `.where(sql`archived_at is null`)`.
tableSessions: ADD `mergedIntoId: uuid()` (nullable; set when this tab was absorbed by another), ADD `clientRequestId: uuid()` (nullable; offline-replay idempotency key), ADD `billPrintCount: integer().notNull().default(0)`, ADD `billedAt: timestamp({ withTimezone: true, mode: 'string' })` (nullable). ADD `uniqueIndex('table_sessions_one_live_per_table_idx').on(table.tableId).where(sql`status in ('open','billed')`)` and `uniqueIndex('table_sessions_cafe_client_request_idx').on(table.cafeId, table.clientRequestId).where(sql`client_request_id is not null`)`.
packages/db/src/schema/orders.ts — ADD `index('orders_table_session_idx').on(table.tableSessionId).where(sql`table_session_id is not null`)`.
packages/types/src/domain.ts — RestaurantTable gains `archivedAt: string | null`; TableSession gains `mergedIntoId: string | null`, `billPrintCount: number`, `billedAt: string | null`.

Hand-appended SQL in packages/db/drizzle/migrations/0013_*.sql, in this order:
(1) repair — `DELETE FROM table_sessions ts WHERE NOT EXISTS (SELECT 1 FROM restaurant_tables rt WHERE rt.id = ts.table_id);` then `UPDATE orders SET table_session_id = NULL WHERE table_session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.id = orders.table_session_id);`
(2) collapse duplicates — `WITH ranked AS (SELECT id, table_id, row_number() OVER (PARTITION BY table_id ORDER BY opened_at ASC, id ASC) rn, first_value(id) OVER (PARTITION BY table_id ORDER BY opened_at ASC, id ASC) keeper FROM table_sessions WHERE status IN ('open','billed')) UPDATE orders o SET table_session_id = r.keeper FROM ranked r WHERE o.table_session_id = r.id AND r.rn > 1;` followed by the matching `UPDATE table_sessions ts SET status='closed', closed_at=now() FROM ranked r WHERE ts.id=r.id AND r.rn>1;` (repeat the CTE).
(3) constraints — `ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_cafe_id_fk FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;` / `ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_cafe_id_fk FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;` / `ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_table_id_fk FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE RESTRICT;` / `ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_merged_into_fk FOREIGN KEY (merged_into_id) REFERENCES table_sessions(id) ON DELETE SET NULL;` / `ALTER TABLE orders ADD CONSTRAINT orders_table_session_id_fk FOREIGN KEY (table_session_id) REFERENCES table_sessions(id) ON DELETE SET NULL;`
BREAKING/BACKFILL: step (2) mutates live rows; step (3) will fail loudly if step (1) was skipped. All new columns are nullable or defaulted, so the API can be deployed before or after the migration.

### Tests

apps/api/src/repositories/table-sessions.db.test.ts (new, describeIfDb): 'rejects a second open session on the same table with 23505'; 'allows a second session on a table once the first is closed'; 'allows an open session on table A and table B simultaneously'; 'treats a billed session as live for the one-live-tab index'. apps/api/src/repositories/tables.db.test.ts (new, describeIfDb): 'refuses to delete a table that has any session (FK RESTRICT)'; 'allows a new table with the label of an archived table'; 'rejects a duplicate label among non-archived tables'. apps/api/src/repositories/orders.db.test.ts (new, describeIfDb): 'rejects an order whose table_session_id does not exist'; 'nulls orders.table_session_id when the session row is deleted'. packages/db/test/migrate-0013.test.ts (new, describeIfDb): 'collapses two open sessions on one table, keeping the older and reattaching the newer session orders'; 'nulls orders.table_session_id pointing at a vanished session'; 'is idempotent when re-run against an already-migrated schema'.

### Files

- `packages/db/src/schema/tables.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0013_table_integrity.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`
- `apps/api/test/db.ts`
- `apps/api/src/repositories/table-sessions.db.test.ts`
- `apps/api/src/repositories/tables.db.test.ts`
- `apps/api/src/repositories/orders.db.test.ts`
- `packages/db/test/migrate-0013.test.ts`

---

<a id="order-session-binding"></a>

## 🔴 `order-session-binding` — Validate tableSessionId and derive tableLabel server-side on order create

### Approach

This one change closes gap 2 (kitchen sees 'Walk-in'/'counter') and gap 8 (round attached to a closed or foreign session) together, and it fixes them for every caller — counter, offline replay, and any future AI/import path — instead of only the button the auditor pointed at.

VERIFIED: apps/api/src/routes/orders.ts:151-155 copies `body.tableSessionId ?? null` and `body.tableLabel ?? null` straight into NewOrder with no lookup at all. apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:353,355 sends tableSessionId but only sends tableLabel from a free-text input the cashier never fills when adding to a tab. apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:151 is `order.tableLabel ? `Table ${order.tableLabel}` : 'Walk-in'` and apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:256-261 falls back to `ticket.source` (rendering 'counter'). Both pointers confirmed.

The auditor offers a client-side option (send sessionTableLabel from the builder) and a better server-side one. Take only the server-side one: the client fix leaves the offline replay and QR paths broken and can be defeated by a stale tab.

Approach: add `findLiveWithTable(id, cafeId)` to TableSessionsRepository — an innerJoin of table_sessions to restaurant_tables filtered on `id`, `cafeId` and `status IN ('open','billed')`, returning `{ session, table } | null`. Add `tableSessionsRepository?: TableSessionsRepository` to OrdersRoutesOptions (defaulting to createDrizzleTableSessionsRepo(app.db), so routes/index.ts needs no change). In POST /cafes/:cafeId/orders, after the ownsCafe check and before buildOrder: if body.tableSessionId is present, resolve it; null result -> 409 SESSION_NOT_LIVE. On success set `tableLabel = live.table.label` unconditionally — the session's physical table always wins over a client-supplied label, because a stale client label is exactly the bug. Without a session, keep `body.tableLabel ?? null`.

409 (not 404) is deliberate: the cafe exists and is owned, this is a state conflict. A session belonging to another cafe returns the same 409 and leaks nothing, because the house 404-for-another-owner's-cafe rule is already satisfied by the ownsCafe check above it.

Offline-replay consequence that must be handled here, not later: a round queued in apps/web/src/lib/offline-queue.ts against a tab that gets settled before the reconnect will now 409 forever and jam the queue (flush() at offline-queue.ts:140-158 leaves failures queued indefinitely). The sender in order-builder.tsx must catch a 409 with code SESSION_NOT_LIVE, retry ONCE with tableSessionId stripped and tableLabel set to the label the queue recorded, and toast 'Round for Table 7 arrived after the tab was settled — billed separately'. So enqueue() must also persist the label: extend QueuedOrder with `tableLabelHint?: string`.

### Schema

none (uses the orders_table_session_idx and the FK from table-integrity-schema)

### API

POST /cafes/:cafeId/orders — request body unchanged (tableSessionId?: uuid, tableLabel?: string ≤40). New behaviour: when tableSessionId is supplied and does not resolve to a live (open|billed) session in this cafe -> 409 { error: { code: 'SESSION_NOT_LIVE', message: 'That table tab is closed. Re-open the table or place this as a counter order.' } }. When it does resolve, the created order's tableLabel is forced to the session's table label regardless of the tableLabel in the body. 201 response shape unchanged ({ order: OrderWithItems }). No other status codes change.

### Web

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — stop rendering the free-text 'Table' input when `inSession` is true (line ~1084) and show the resolved `sessionTableLabel` read-only instead; in handleSubmit stop sending tableLabel when inSession; add the SESSION_NOT_LIVE 409 handling described above to both the direct submit path (line ~402) and the queue sender (line ~204 `sender`). apps/web/src/lib/offline-queue.ts — QueuedOrder gains `tableLabelHint?: string`; enqueue() takes it as a second optional arg. No change needed to print-views.tsx or kitchen-board.tsx — they render correctly once tableLabel is populated.

### Tests

apps/api/src/routes/orders.test.ts: 'attaches the session table label to a dine-in round (tableLabel comes from the session, not the body)'; 'overrides a stale client tableLabel with the session table label'; 'returns 409 SESSION_NOT_LIVE for a closed session'; 'returns 409 SESSION_NOT_LIVE for a session belonging to another cafe'; 'accepts a billed session (guests order after the bill is printed)'; 'leaves tableLabel as sent when no tableSessionId is given'; 'does not call the sessions repo at all when tableSessionId is absent'. apps/api/src/repositories/table-sessions.db.test.ts: 'findLiveWithTable returns the joined table for an open session'; 'findLiveWithTable returns null for a closed session'; 'findLiveWithTable returns null across cafes'. apps/web/src/lib/offline-queue.test.ts: 'enqueue stores the tableLabelHint alongside the payload'; 'a queued order round-trips its hint through readQueue'.

### Files

- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/table-sessions.db.test.ts`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/offline-queue.test.ts`

---

<a id="qr-orders-join-tab"></a>

## 🔴 `qr-orders-join-tab` — QR orders resolve their table and join (or open) that table's tab

### Approach

Gaps 4 and 13 are one bug with two symptoms; fix once. VERIFIED: apps/api/src/routes/public.ts:128 is a literal `tableSessionId: null` and body.tableLabel at :127 is passed through untouched. The QR link is generated at apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:132 as `/m/${slug}?table=${encodeURIComponent(label)}` and apps/web/src/app/m/[slug]/page.tsx:34-40 forwards it verbatim to diner-order.tsx, which sends it as tableLabel at :298. So the scanned label IS restaurant_tables.label — an exact (cafeId, label) lookup is correct, not a fuzzy match.

Approach in POST /public/cafes/:slug/orders: add `tablesRepository?` and `tableSessionsRepository?` to PublicRoutesOptions. When body.tableLabel is present, look up the table by (cafe.id, trimmed label, archived_at IS NULL) via a new `findByLabelAndCafe` on TablesRepository. If found, find the live session for it; if none, open one (guestName/guestPhone from the diner's own fields, partySize null). Set tableSessionId and force the order's tableLabel to the canonical `table.label`. If the label matches NO table (takeaway QR, typo, a poster from a table that was renamed) leave tableSessionId null and keep the free-text label — a public menu must never refuse an order over a floor-plan mismatch.

Two diners at one table scanning at the same second both try to open: the partial unique index from table-integrity-schema turns the loser into a 23505. Catch it in the route, re-read findLiveByTable, and use the winner's session. Do not surface the race to the diner.

If the resolved session is already 'billed' (bill printed, guests order one more round) attach anyway AND flip the status back to 'open' via a new repo `reopen(id, cafeId)`, plus an audit entry — otherwise the floor sits on 'waiting for payment' while an unbilled round is being cooked.

Second defect this exposes, and it must ship in the same change or QR money gets double-counted: apps/api/src/repositories/table-sessions.ts:363-379 settles EVERY non-cancelled order on the tab with the session's method and a fresh paidAt. A prepaid QR order (cafe.qrPrepaidRequired / Razorpay, already paymentStatus='paid' with providerPaymentId) would be overwritten to 'cash' and re-counted in the day-end payment breakdown. Add `ne(schema.orders.paymentStatus, 'paid')` to that UPDATE's WHERE, and surface the split in TableSessionDetail so the cashier collects the right number: `paidPaise` (sum of totalPaise over already-paid non-cancelled orders) and `duePaise` (totalPaise − paidPaise). Both are sums of integer paise — no apportionment, no rounding. The sheet's Settle button must read duePaise, not totalPaise.

### Schema

none new. Uses tableSessions.clientRequestId? No — that is offline-only. Relies on the one-live-tab partial unique index from table-integrity-schema. packages/types/src/domain.ts — TableSessionDetail gains `paidPaise: number` and `duePaise: number` (additive; existing consumers that ignore them keep working).

### API

POST /public/cafes/:slug/orders — request body unchanged. New behaviour: when tableLabel matches a non-archived restaurant_tables row for this cafe, the created order gets that table's live session id (opening a session if none exists) and its tableLabel is normalised to the canonical table.label. When it matches nothing, behaviour is exactly as today. Response unchanged: 201 { order: { id, orderNumber, status, paymentStatus, totalPaise, tableLabel } }. Never returns a new error code — a table-resolution failure is silent by design.
GET /cafes/:cafeId/table-sessions/:sessionId — response { session: TableSessionDetail } now additionally carries paidPaise and duePaise (additive).
POST /cafes/:cafeId/table-sessions/:sessionId/settle — unchanged contract here, but orders already paymentStatus='paid' are no longer re-stamped.

### Web

apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx — Settle button label becomes `Settle ${formatRupees(detail.duePaise)}`; when paidPaise > 0 add a 'Already paid online ₹X' row above the Total block and mark the individual OrderBlock (line 229) with a small 'Paid' chip when order.paymentStatus === 'paid'. apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx — add a 'Paid online' line and print the amount due when duePaise !== totalPaise. No change to apps/web/src/app/m/[slug]/* — the diner flow already sends the label.

### Tests

apps/api/src/routes/public.test.ts: 'attaches a QR order to the open session for the scanned table'; 'opens a session for the scanned table when none is open, so the floor shows it occupied'; 'reuses the same session for a second round from the same table'; 'reopens a billed session and attaches the new round'; 'leaves tableSessionId null when the label matches no table'; 'leaves tableSessionId null when no tableLabel is sent'; 'normalises the order tableLabel to the canonical table label'; 'does not attach to a table in another cafe with the same label'; 'recovers from a concurrent open (23505) by using the winning session'. apps/api/src/routes/table-sessions.test.ts: 'settle leaves an already-paid QR order untouched (method and paidAt preserved)'; 'detail reports paidPaise and duePaise'; 'duePaise equals totalPaise when nothing is prepaid'. apps/api/src/repositories/table-sessions.db.test.ts: 'settle does not overwrite paymentMethod on a paid order'.

### Files

- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/repositories/tables.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `packages/types/src/domain.ts`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`

---

<a id="session-lifecycle-guards"></a>

## 🔴 `session-lifecycle-guards` — State guards, force-close confirmation + audit, and table archival

### Approach

Gaps 5 and 9 share a root cause: nothing in the table layer checks the state it is transitioning from. Four guards, one audit entry, one UI dialog.

(a) Seat race. VERIFIED at apps/api/src/routes/table-sessions.ts:90-98 — a findOpenByTable read followed by an unguarded insert. The partial unique index from table-integrity-schema makes the DB the arbiter; wrap `sessionsRepo.open(data)` in try/catch and map a 23505 on table_sessions_one_live_per_table_idx to the SAME 409 SESSION_ALREADY_OPEN the pre-check returns. Keep the pre-check: it is the fast path and gives a nicer message.

(b) Double-tap settle. VERIFIED at apps/api/src/repositories/table-sessions.ts:354-360 — an existence check, then an unconditional UPDATE. Move the guard into the UPDATE's WHERE (`status IN ('open','billed')`) and return a discriminated result so the route can tell 'gone' from 'already settled'. This is an INTERNAL BREAKING CHANGE to TableSessionsRepository.settle's signature; the mock in apps/api/src/routes/table-sessions.test.ts:136 and the existing settle tests must be updated in the same commit.

(c) Force close. VERIFIED at apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx:145-152 — a plain text button, no confirm, and apps/api/src/repositories/table-sessions.ts:390-397 UPDATEs with no status check and writes no audit row, unlike the refund at apps/api/src/routes/orders.ts:428. Make the API refuse by default and require an explicit, reasoned override: load the detail, count non-cancelled orders with paymentStatus !== 'paid'; if any and !force -> 409 with the counts in the error details so the confirm dialog can print real numbers; with force + a reason, close and write the audit entry. Guard the UPDATE on `status IN ('open','billed')` so a second tap gets 409 ALREADY_CLOSED rather than resetting closedAt.

(d) History must stop hiding abandoned tabs. VERIFIED at apps/api/src/repositories/table-sessions.ts:257-266 (`eq(paymentStatus,'paid')`) and :295 (`if (orders.length === 0) continue`) — a force-closed tab has no paid orders so it vanishes entirely, which is precisely how a ₹2,400 write-off becomes invisible. Change the order query to `ne(status,'cancelled')`, keep the skip only for sessions that never had an order, and add per-session `paidPaise` and `settled: boolean`. CRITICAL money rule: TableHistoryTableSummary.totalBilledPaise must now sum paidPaise, not totalPaise — it means 'money actually taken' and must not silently start including written-off tabs. Also skip sessions with mergedIntoId set (they are not bills).

(e) Table delete. VERIFIED at apps/api/src/repositories/tables.ts:71-77 — an unconditional DELETE. With the FK RESTRICT from table-integrity-schema a hard delete of a table with history now raises 23503, so the route must branch: live session -> 409 TABLE_IN_USE; historical sessions -> archive (set archived_at); neither -> hard delete. list() and floor() filter `archivedAt IS NULL`; getDetail/history do NOT (a settled bill must still be able to name its table).

### Schema

No new columns beyond table-integrity-schema. packages/types/src/domain.ts — TableHistorySession gains `paidPaise: number` and `settled: boolean`; TableHistoryTableSummary.totalBilledPaise CHANGES MEANING to 'sum of paidPaise' (document it in the interface comment). packages/types/src/api.ts — new `CloseSessionRequest { force?: boolean; reason?: string }`. Repository signature changes (internal, breaking): `settle(id, cafeId, paymentMethod): Promise<{ ok: true; detail: TableSessionDetail } | { ok: false; reason: 'not_found' | 'already_closed' }>`; `close(id, cafeId): Promise<{ ok: true; session: TableSession } | { ok: false; reason: 'not_found' | 'already_closed' }>`; new `sessionCounts(tableId, cafeId): Promise<{ live: number; total: number }>` on TableSessionsRepository; new `archive(id, cafeId): Promise<RestaurantTable | null>` on TablesRepository; `findOpenByTable` RENAMED to `findLiveByTable` and its WHERE widened to `status IN ('open','billed')`.

### API

POST /cafes/:cafeId/table-sessions — unchanged body. Now also returns 409 { error: { code: 'SESSION_ALREADY_OPEN', message: 'This table already has an open session' } } when the DB unique index rejects a concurrent insert (previously a silent duplicate).
POST /cafes/:cafeId/table-sessions/:sessionId/settle — unchanged body { paymentMethod }. New: 409 { error: { code: 'ALREADY_SETTLED', message: 'This table was already settled' } } when the session is closed. 404 unchanged for a missing session.
POST /cafes/:cafeId/table-sessions/:sessionId/close — body CHANGED from {} to { force?: boolean, reason?: string ≤200 }. 200 { session: TableSession } when the tab has no unpaid orders. 409 { error: { code: 'SESSION_HAS_UNPAID_ORDERS', message: 'Table 7 has 3 unpaid orders worth ₹2,400. Settle them or close with a reason.', details: { unpaidCount: 3, unpaidTotalPaise: 240000 } } } when unpaid orders exist and force !== true. 400 { error: { code: 'REASON_REQUIRED', message: 'Give a reason when closing a tab without payment' } } when force === true and reason is missing or shorter than 3 characters. 409 { error: { code: 'ALREADY_CLOSED', ... } } on a repeat. On a successful forced close, an audit row is written: action 'table_session.force_closed', actorType 'owner', actorId request.user.id, entityType 'table_session', entityId sessionId, summary `Closed Table ${label} without payment — ₹${unpaidTotalPaise/100} across ${unpaidCount} orders`, metadata { tableId, tableLabel, unpaidCount, unpaidTotalPaise, reason }.
DELETE /cafes/:cafeId/tables/:tableId — 204 unchanged for the no-history case. NEW: 204 with the table archived (not deleted) when it has any session history — response body stays empty; the tables list simply stops returning it. NEW: 409 { error: { code: 'TABLE_IN_USE', message: 'Table 7 has a live tab. Settle or close it first.' } } when a live session exists.
GET /cafes/:cafeId/table-sessions/history — response gains paidPaise and settled per session; totalBilledPaise per table now sums paidPaise.

### Web

apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx — replace the bare button at 145-152 with a ConfirmDialog (import { ConfirmDialog } from '@/components/ui/confirm-dialog', same pattern as orders/[orderId]/order-actions.tsx:486-495): destructive, title 'Close Table 7 without payment?', description built from the 409 details ('3 orders worth ₹2,400 will be left unpaid and this will be recorded against your login.'), plus a required reason textarea; confirmLabel 'Close without payment', cancelLabel 'Keep tab open'. The flow is: first POST without force to get the counts, render the dialog from the 409 details, then POST again with { force: true, reason }. apps/web/src/app/cafes/[id]/tables/history-view.tsx — render a 'Written off' chip and the paidPaise/totalPaise split on rows where settled === false; the grand total at line 63-66 keeps summing totalBilledPaise (now paid money) so the headline number stays honest. apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx — handle the 409 TABLE_IN_USE from delete with a toast naming the table, and drop the row optimistically only on success.

### Tests

apps/api/src/routes/table-sessions.test.ts: 'returns 409 SESSION_ALREADY_OPEN when the repo raises 23505 on the live-session index'; 'settle returns 409 ALREADY_SETTLED for a closed session'; 'settle still returns 404 for a session in another cafe'; 'close returns 409 SESSION_HAS_UNPAID_ORDERS with counts when orders are unpaid'; 'close with force but no reason returns 400 REASON_REQUIRED'; 'close with force and a reason succeeds and writes a table_session.force_closed audit entry'; 'the audit summary carries the table label and the unpaid rupee total'; 'close of a fully paid tab succeeds without force'; 'close returns 409 ALREADY_CLOSED on a repeat'; 'history includes a force-closed session marked settled:false'; 'per-table totalBilledPaise sums paid money only'; 'history excludes a session that was merged into another'. apps/api/src/routes/tables.test.ts: 'delete returns 409 TABLE_IN_USE when a live session exists'; 'delete archives (not deletes) a table with closed sessions and returns 204'; 'delete hard-deletes a table with no session history'; 'list omits archived tables'. apps/api/src/repositories/table-sessions.db.test.ts: 'two concurrent settles produce exactly one closed transition'; 'settle guarded by status leaves a closed session untouched'.

### Files

- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/tables.ts`
- `apps/api/src/routes/tables.ts`
- `apps/api/src/routes/tables.test.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/history-view.tsx`
- `apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx`

---

<a id="billed-state-and-reprint"></a>

## 🟠 `billed-state-and-reprint` — Make the Billed floor state real, and reach the bill again after settling

### Approach

Gaps 6 and 7 are the two ends of one missing concept: a session-level bill print event. Build it once and both fall out.

IMPORTANT CORRECTION to the auditor's pointer on gap 6. It says the derivation is 'already handled at apps/api/src/repositories/table-sessions.ts:57' and implies only the writer is missing. That is half the story: floor() at :177-182 selects sessions `eq(status,'open')` ONLY, so a session set to 'billed' would drop out of the floor query entirely and the table would render as FREE with a ₹0 total — the exact opposite of the intent, and worse than the current dead legend. findOpenByTable at :127-140 has the same filter, so a billed table could also be re-seated over a live tab. Both WHERE clauses must widen to `inArray(status, ['open','billed'])` (findOpenByTable is renamed findLiveByTable in session-lifecycle-guards; this item widens its filter). deriveLiveStatus at :56-62 then works as written.

Writer: a new POST .../bill-printed mirroring the order-level one at apps/api/src/routes/orders.ts:310-351 — atomic increment plus a CASE that only promotes 'open' to 'billed' (a closed session stays closed, so a post-settle reprint does not resurrect the table on the floor), billedAt set with COALESCE so the first print's timestamp sticks. Audit only reprints (printCount > 1), same rule as orders.

Caller: do NOT do this from the sheet with window.open gymnastics. apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx is already a client component mounted inside the print page, so put the POST there, before window.print(). That makes BOTH entry points — the sheet's existing link at table-session-sheet.tsx:178-194 and the new History link — record the print with zero popup-blocker risk, and it keeps the sheet's `<a target="_blank">` exactly as it is.

Reprint (gap 7): VERIFIED — apps/web/src/app/cafes/[id]/tables/history-view.tsx:230-264 renders the expanded panel with items and totals and no action at all, and the print page at .../print/page.tsx:60,157 already handles closed sessions (billDateIso falls back to closedAt, and it prints the 'Settled …' line). So this is genuinely just a link — plus the DUPLICATE stamp, which is the part that makes it safe. Reuse billDocumentTitle(gstMode) from apps/web/src/lib/bill-document.ts instead of the hardcoded 'TAX INVOICE' at print/page.tsx:87, and stamp DUPLICATE when the returned printCount > 1, matching how print-views.tsx handles order bills.

### Schema

Columns come from table-integrity-schema: tableSessions.billPrintCount (integer NOT NULL DEFAULT 0) and tableSessions.billedAt (timestamptz NULL). Repository: new `markBillPrinted(id, cafeId): Promise<{ printCount: number; status: TableSessionStatus } | null>` implemented as a single `UPDATE table_sessions SET bill_print_count = bill_print_count + 1, status = CASE WHEN status = 'open' THEN 'billed' ELSE status END, billed_at = COALESCE(billed_at, now()) WHERE id = $1 AND cafe_id = $2 RETURNING bill_print_count, status`. No status guard in the WHERE — reprinting a settled bill is the point of gap 7. floor() and findLiveByTable() WHERE clauses widen to `inArray(status, ['open','billed'])`.

### API

POST /cafes/:cafeId/table-sessions/:sessionId/bill-printed — no request body. 200 { printCount: number, isDuplicate: boolean, status: 'open' | 'billed' | 'closed' }. 404 { error: { code: 'NOT_FOUND', message: 'Session not found' } } for a missing session or another owner's cafe. When printCount > 1, writes audit: action 'table_session.bill_reprinted', entityType 'table_session', entityId sessionId, summary `Reprinted bill for Table ${label} (copy ${printCount})`, metadata { printCount, tableId, tableLabel }.
GET /cafes/:cafeId/floor — response unchanged in shape; a table whose session is 'billed' now actually appears with liveStatus 'billed' instead of vanishing.

### Web

apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx — accept { cafeId, sessionId, seedPrintCount } props, POST bill-printed on mount, set a `duplicate` state, then window.print(); on failure fall back to the seeded count and print anyway (never block the cashier on bookkeeping, same comment as print-views.tsx:60-64). Because the DUPLICATE stamp must render in the printed markup, lift it: make the print page render a `<DuplicateStamp />` client child that AutoPrint toggles, or pass the flag up via a small client wrapper — do not re-fetch the page. apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx — swap the hardcoded 'TAX INVOICE' at line 87 for billDocumentTitle(cafe.gstMode) and add compositionDeclaration(cafe.gstMode) below the totals, both from @/lib/bill-document. apps/web/src/app/cafes/[id]/tables/history-view.tsx — HistoryView already has cafeId; thread it into SessionRow and add a 'Print bill' anchor in the expanded panel (line ~232) to `/cafes/${cafeId}/tables/sessions/${session.id}/print`, target=_blank, styled with buttonClasses({ variant: 'secondary', size: 'sm' }). apps/web/src/app/cafes/[id]/tables/floor-view.tsx — no code change needed; the Billed legend entry at line 348 stops being a lie.

### Tests

apps/api/src/routes/table-sessions.test.ts: 'bill-printed returns printCount 1 and isDuplicate false on the first print'; 'bill-printed returns isDuplicate true and writes a table_session.bill_reprinted audit entry on the second'; 'bill-printed promotes an open session to billed'; 'bill-printed leaves a closed session closed (reprint after settle)'; 'bill-printed leaves an already-billed session billed'; 'bill-printed returns 404 for another owner cafe'. apps/api/src/repositories/table-sessions.db.test.ts: 'floor() returns a billed session with liveStatus billed'; 'floor() no longer reports a billed table as free'; 'findLiveByTable matches a billed session so the table cannot be re-seated'; 'two concurrent bill prints produce counts 1 and 2, never 1 and 1'.

### Files

- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/table-sessions.db.test.ts`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`
- `apps/web/src/app/cafes/[id]/tables/history-view.tsx`

---

<a id="session-move-merge-split"></a>

## 🟠 `session-move-merge-split` — Move, merge and split a tab; edit guest details after seating

### Approach

Gaps 3 and 11 need the same thing the repository has never had: an UPDATE path for a live session and for orders.table_session_id. VERIFIED — apps/api/src/repositories/orders.ts:134 is the only writer of tableSessionId (inside create()), and TableSessionsRepository at :24-47 exposes open/find/getDetail/floor/history/settle/close and nothing else. All four operations are transactional and all four write audit entries; the one-live-tab unique index turns every 'target already occupied' race into a 23505 the route maps to 409.

MOVE is a table_id UPDATE on the session plus a tableLabel UPDATE across its orders, so a later KOT or the bill prints the new table. Already-printed paper cannot be rewritten — that is a floor-communication problem, not a data one — so the old label goes in the audit metadata and nowhere else.

MERGE names the SURVIVOR in the path and the absorbed tab in the body (state this loudly; it is the classic direction confusion). The source's orders move to the target, the source is closed with mergedIntoId set, and party sizes add (null + null stays null). mergedIntoId is why history() must skip merged sessions — otherwise every merge leaves a phantom ₹0 bill in the owner's history.

SPLIT ships in two forms, and I am deliberately NOT building the third.
  (a) By order (rounds move to a new tab on another table). Exact by construction — whole orders move, no money is divided, nothing to round. toTableId is REQUIRED, because the unique index permits only one live tab per table and the floor view maps one table to one tab; the alternative (relaxing the index to allow two tabs on one table) was considered and rejected as it breaks the floor's core abstraction. At least one order must remain on the source (otherwise the operation is a move, and the route says so). A paid order can never be split off — the money is already banked against that tab.
  (b) By tender (the 'four people want separate bills' case where they shared rounds). This does NOT move orders; it settles the one tab with up to 8 tenders. MONEY RULE for the UI's 'split evenly' helper: base = Math.floor(duePaise / n), r = duePaise − base*n, the FIRST r parts get base+1 and the rest get base — the parts therefore sum to duePaise exactly, with the extra paise deterministically on the earliest parts. MONEY RULE for recording the tenders against orders (order_payments.orderId is NOT NULL, so a session tender must be allocated): walk the unpaid orders oldest-first with remaining d_i, walk the tenders in order with remaining t_k, and emit rows of min(d_i, t_k), advancing whichever side hits zero. Every emitted amount is an integer and the emitted rows sum to exactly the tendered total; a tender that straddles two orders produces two rows. Per order, set orders.paymentMethod to the single method if all its rows share one, else null — which is exactly the convention orders.settleWithPayments already uses and exactly what the day-end split-tender aggregate at apps/api/src/repositories/reports.ts (the splitAgg branch, joined on isNull(orders.paymentMethod)) expects. No schema change, reports stay correct.
  (c) DEFERRED, and honestly so: item-level split (dividing one round's lines between two bills). It requires re-running buildOrder per part, consuming a second gapless invoice number, and apportioning the bill-level discount/service charge across the moved lines. If it is built later the apportionment rule must be: share_i = Math.floor(lineTotal_i * adjustment / subtotal), then hand the leftover paise to the largest line (ties broken by lowest line index) so the shares sum to the adjustment exactly. Do not start it inside this work item.

PATCH for guest details is folded in because it touches the same new repo update surface and the same sheet.

### Schema

tableSessions.mergedIntoId comes from table-integrity-schema. New repository methods on TableSessionsRepository: `update(id, cafeId, patch: { guestName?: string|null; guestPhone?: string|null; partySize?: number|null }): Promise<TableSession | null>` (WHERE status IN ('open','billed')); `move(id, cafeId, toTableId): Promise<TableSessionDetail | null>`; `merge(targetId, sourceId, cafeId): Promise<TableSessionDetail | null>`; `splitByOrders(id, cafeId, orderIds: string[], toTableId: string): Promise<{ from: TableSessionDetail; to: TableSessionDetail } | null>`; `settleWithTenders(id, cafeId, tenders: { method: PaymentMethod; amountPaise: number }[]): Promise<{ ok: true; detail: TableSessionDetail } | { ok: false; reason: 'not_found' | 'already_closed' | 'amount_mismatch' }>`. New method on OrdersRepository: `reassignSession(orderIds: string[], cafeId: string, toSessionId: string | null, tableLabel: string | null, tx?): Promise<number>` — the single UPDATE path for orders.table_session_id, transaction-aware. packages/types/src/api.ts: new MoveSessionRequest { tableId }, MergeSessionRequest { sourceSessionId }, SplitSessionRequest { orderIds: string[]; toTableId: string }, PatchSessionRequest { guestName?: string|null; guestPhone?: string|null; partySize?: number|null }, SplitSessionResponse { from: TableSessionDetail; to: TableSessionDetail }; SettleSessionRequest becomes a union of { paymentMethod } and { payments: { method; amountPaise }[] }.

### API

PATCH /cafes/:cafeId/table-sessions/:sessionId — body { guestName?: string ≤80 | null, guestPhone?: string matching /^\+?[0-9]{7,15}$/ | null, partySize?: integer 1..99 | null }, at least one key or 400 EMPTY_PATCH. 200 { session: TableSession }. 404 NOT_FOUND (missing session, or another owner's cafe). 409 SESSION_CLOSED.
POST /cafes/:cafeId/table-sessions/:sessionId/move — body { tableId: uuid }. 200 { session: TableSessionDetail } (the moved tab, now reporting the new table). 400 SAME_TABLE when tableId is the current table. 404 NOT_FOUND for a missing session or a table not in this cafe (or archived). 409 TARGET_TABLE_OCCUPIED { message: 'Table 9 already has a live tab — merge instead' }. 409 SESSION_CLOSED. Audit: 'table_session.moved', summary `Moved the Table ${from} tab to Table ${to}`, metadata { fromTableId, fromTableLabel, toTableId, toTableLabel, orderCount }.
POST /cafes/:cafeId/table-sessions/:sessionId/merge — :sessionId is the SURVIVOR. Body { sourceSessionId: uuid }. 200 { session: TableSessionDetail } (the survivor with both tabs' orders). 400 SAME_SESSION. 404 NOT_FOUND for either session. 409 SESSION_CLOSED when either is closed. Audit: 'table_session.merged', summary `Merged the Table ${source} tab into Table ${target}`, metadata { sourceSessionId, sourceTableLabel, targetTableLabel, movedOrderCount, movedTotalPaise }.
POST /cafes/:cafeId/table-sessions/:sessionId/split — body { orderIds: uuid[] (1..50), toTableId: uuid }. 200 { from: TableSessionDetail, to: TableSessionDetail }. 400 ORDER_NOT_ON_SESSION when any id is not currently on this tab. 400 CANNOT_SPLIT_PAID_ORDER when any named order has paymentStatus 'paid'. 400 SPLIT_LEAVES_EMPTY when every non-cancelled order was named (use move). 404 NOT_FOUND for a missing session or table. 409 TARGET_TABLE_OCCUPIED. 409 SESSION_CLOSED. Audit: 'table_session.split', summary `Split ${n} orders (₹X) off the Table ${from} tab onto Table ${to}`, metadata { orderIds, movedTotalPaise, toTableId, newSessionId }.
POST /cafes/:cafeId/table-sessions/:sessionId/settle — body is now a union: { paymentMethod: 'cash'|'upi'|'card'|'online' } (unchanged, backward compatible) OR { payments: [{ method, amountPaise: integer ≥1 }] with 1..8 entries }. With payments, sum(amountPaise) must equal detail.duePaise or 400 { error: { code: 'AMOUNT_MISMATCH', message: 'Tendered ₹1,200 must equal the amount due ₹1,180' } }. 200 { session: TableSessionDetail }. 409 ALREADY_SETTLED (from session-lifecycle-guards).

### Web

New: apps/web/src/app/cafes/[id]/tables/manage-session-sheet.tsx — a secondary sheet reached from a 'Manage table' row in table-session-sheet.tsx, offering Move / Merge / Split / Edit guest. New: apps/web/src/app/cafes/[id]/tables/table-picker.tsx — a reusable list of the cafe's tables with their live status, filtered to free tables for Move and Split and to occupied tables for Merge; it takes the floor array as a prop so it never refetches. New: apps/web/src/app/cafes/[id]/tables/split-orders-form.tsx — checkbox list of the tab's rounds with a running 'moving ₹X of ₹Y' figure, plus the destination picker. New: apps/web/src/lib/split-evenly.ts — pure `splitEvenly(duePaise: number, n: number): number[]` implementing the remainder rule above; used by the tender-split UI. Changed: apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx — add the Manage entry point and an 'n ways' tender-split control beside the payment-method grid (lines 108-143); Changed: apps/web/src/app/cafes/[id]/tables/floor-view.tsx — pass `tables` into TableSessionSheet so the pickers have the floor without another round trip, and refresh after any manage action. Changed: apps/web/src/app/cafes/[id]/tables/open-session-sheet.tsx — extract its guest-name/phone/party-size fields (lines 85-121) into a shared GuestFields component reused by the edit sheet, so the two forms cannot drift.

### Tests

apps/api/src/routes/table-sessions.test.ts, PATCH: 'updates guest name, phone and party size'; 'rejects an empty patch with 400 EMPTY_PATCH'; 'rejects a malformed phone'; 'returns 409 SESSION_CLOSED for a settled tab'; 'returns 404 for another owner cafe'. MOVE: 'moves the tab and relabels every order on it'; 'returns 409 TARGET_TABLE_OCCUPIED'; 'returns 400 SAME_TABLE'; 'returns 404 for a table in another cafe'; 'writes a table_session.moved audit entry naming both tables'. MERGE: 'moves the source orders onto the survivor and closes the source with mergedIntoId'; 'sums party sizes, leaving null when both are null'; 'returns 400 SAME_SESSION'; 'returns 409 when the source is already closed'; 'writes a table_session.merged audit entry'. SPLIT: 'moves the named orders to a new tab on the target table'; 'leaves the remaining orders and their total on the source tab'; 'returns 400 CANNOT_SPLIT_PAID_ORDER'; 'returns 400 SPLIT_LEAVES_EMPTY when all orders are named'; 'returns 400 ORDER_NOT_ON_SESSION for an order from another tab'; 'returns 409 TARGET_TABLE_OCCUPIED'. SETTLE (tenders): 'accepts two tenders summing to duePaise'; 'rejects tenders that do not sum to duePaise with 400 AMOUNT_MISMATCH'; 'allocates one tender straddling two orders into two order_payments rows'; 'sets orders.paymentMethod for an order paid by a single method and null for one split across methods'; 'the emitted order_payments rows sum to exactly the tendered total'; 'still accepts the legacy { paymentMethod } body'. apps/api/src/repositories/table-sessions.db.test.ts: 'move into a table that is seated concurrently raises 23505 and is reported as TARGET_TABLE_OCCUPIED'; 'merge is atomic — a failure mid-way leaves both tabs untouched'. apps/web/src/lib/split-evenly.test.ts: 'splits 100000 three ways as [33334, 33333, 33333]'; 'parts always sum to the input for n in 1..8 over a range of amounts'; 'a 1-paise total split 3 ways gives [1,0,0]'; 'throws for n < 1'.

### Files

- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/table-sessions.db.test.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/tables/manage-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-picker.tsx`
- `apps/web/src/app/cafes/[id]/tables/split-orders-form.tsx`
- `apps/web/src/lib/split-evenly.ts`
- `apps/web/src/lib/split-evenly.test.ts`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/floor-view.tsx`
- `apps/web/src/app/cafes/[id]/tables/open-session-sheet.tsx`

---

<a id="tab-sheet-live-refresh"></a>

## 🟠 `tab-sheet-live-refresh` — Keep the open tab sheet live so nobody settles a stale total

### Approach

VERIFIED: apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx:40-57 is a one-shot useEffect keyed on [cafeId, sessionId] with a cancelled flag and no interval, while apps/web/src/app/cafes/[id]/tables/floor-view.tsx:53-56 polls every 20s behind it. A second waiter's round therefore lands on the floor but not in the open sheet, and the cashier settles the number in front of them. The index half of gap 12 is delivered in table-integrity-schema.

Extract the polling into apps/web/src/lib/use-poll.ts — `usePoll(fn, intervalMs, { enabled })` that also refires on `visibilitychange` (document.visibilityState === 'visible') and `window.focus`, because on a counter tablet the sheet is more often woken from sleep than left running. Pure enough to unit test with fake timers. Then use it in the sheet at 10s and refactor floor-view's hand-rolled interval to the same hook so there is one implementation.

Three behaviours the poll must have, and they are the point of the item:
(1) Pause while `settling || closing` — the total must not change under a button the cashier has already pressed.
(2) When totalPaise changes between polls while the sheet is open, show an inline notice ('A new round was added — total is now ₹X') above the footer rather than silently swapping the number under the thumb. Muscle memory settles the amount the cashier read, not the amount on screen.
(3) When a poll returns session.status === 'closed' (settled on the second terminal), replace the body with 'This table was settled on another device' and a single Close button, and call onChanged() so the floor behind refreshes. Today that case silently keeps a settle button live over a closed tab.

Also fix the load-error state at :157-160: it currently replaces the whole body with red text and no way forward. Give it a Retry button wired to the same loader.

### Web

New: apps/web/src/lib/use-poll.ts and apps/web/src/lib/use-poll.test.ts. Changed: apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx (replace the useEffect at 40-57 with usePoll at 10_000ms, add the changed-total notice, the settled-elsewhere state, and a Retry on the error branch at 157-160). Changed: apps/web/src/app/cafes/[id]/tables/floor-view.tsx (replace the setInterval at 53-56 with usePoll at 20_000ms; no behaviour change). Changed: apps/web/src/app/cafes/[id]/tables/history-view.tsx is NOT touched — history is not live data.

### Tests

apps/web/src/lib/use-poll.test.ts (vitest fake timers, jsdom is already configured in apps/web/vitest.config.mts): 'calls the function once on mount'; 'calls again after the interval elapses'; 'does not call while enabled is false'; 'refires on a visibilitychange to visible'; 'refires on window focus'; 'does not stack overlapping calls when the function is slower than the interval'; 'clears the interval and listeners on unmount'. apps/web/src/app/cafes/[id]/tables/table-session-sheet.test.tsx (new; @testing-library/react is already a devDependency): 'shows the new-round notice when a poll returns a higher total'; 'does not poll while a settle is in flight'; 'shows the settled-elsewhere state and calls onChanged when a poll returns status closed'; 'the Retry button re-runs the load after a failure'.

### Files

- `apps/web/src/lib/use-poll.ts`
- `apps/web/src/lib/use-poll.test.ts`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.test.tsx`
- `apps/web/src/app/cafes/[id]/tables/floor-view.tsx`

---

<a id="offline-table-actions"></a>

## 🟠 `offline-table-actions` — Seat, settle and close a table while the internet is down

### Approach

VERIFIED: apps/web/src/app/cafes/[id]/tables/tables-tool.tsx:21-40 is a plain authedFetch that throws on any failure with no queue, and it is the only network path for open-session-sheet.tsx:56, table-session-sheet.tsx:44,62,77 and floor-view.tsx:45. The queue-and-replay pattern does exist at apps/web/src/lib/offline-queue.ts and order-builder.tsx:402-412.

An additional finding the audit did not record, and it changes the shape of this work: useOfflineQueue is mounted in exactly ONE place — apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:204. The queue only drains while the New Order page is open. A cashier who takes three orders offline and then navigates to Tables never replays them. The hook has to be hoisted into apps/web/src/app/cafes/[id]/components/cafe-shell.tsx so replay runs anywhere under /cafes/[id].

Generalise the queue rather than cloning it. New apps/web/src/lib/offline-actions.ts with a discriminated union — 'order.create' | 'session.open' | 'session.settle' | 'session.close' — sharing the storage/flush machinery. Keep offline-queue.ts's public API intact and reimplement it on top, so its existing tests keep passing.

The hard part is that seating produces a server-generated id that later rounds need. Design: 'session.open' carries a client-generated localId (crypto.randomUUID) AND a clientRequestId sent to the server. The floor renders the table as occupied from a local overlay; a round punched against it queues as 'order.create' with `tableSessionLocalId` instead of `tableSessionId`. On replay the queue drains in order, and after a successful session.open it rewrites every queued order carrying that localId to the real session id before sending it. Server-side idempotency is the tableSessions.clientRequestId column plus its partial unique index from table-integrity-schema: POST /table-sessions accepts clientRequestId, and a 23505 on that index returns the EXISTING session with 200 instead of 201, so a flaky reconnect cannot seat the table twice.

Settle and close need no new column — once session-lifecycle-guards lands, a replayed settle against a closed session returns 409 ALREADY_SETTLED, which the flusher treats as 'already done, drop it and warn', not as a failure to retry. That is the correct behaviour and it is why this item must land after that one.

Reading a tab offline: cache the last successful floor payload in apps/web/src/lib/floor-cache.ts (localStorage, per cafe, with a stored fetchedAt) and, when the floor fetch fails, render the cache with an amber 'Showing the floor as of 14:32 — offline' banner and the pending-action overlay applied. Settling from cached data is allowed; the amounts are the ones the guests were quoted anyway, and the queued settle is validated server-side on replay.

Also lift the NetworkError class out of order-builder.tsx:65-97 into apps/web/src/lib/http.ts and have tables-tool.tsx's authedFetch use it, so 'offline or 5xx = retryable, 4xx = the cashier's to fix' is one rule in one place rather than two divergent copies.

### Schema

tableSessions.clientRequestId and its partial unique index come from table-integrity-schema. packages/types/src/api.ts — OpenSessionRequest gains `clientRequestId?: string` (uuid).

### API

POST /cafes/:cafeId/table-sessions — body gains optional clientRequestId: uuid. New behaviour: when a session already exists for (cafeId, clientRequestId) the route returns 200 { session } (the existing row) instead of 201, and does NOT open a second tab. The 23505 on table_sessions_cafe_client_request_idx is caught and resolved by re-reading; the 23505 on table_sessions_one_live_per_table_idx still maps to 409 SESSION_ALREADY_OPEN. No other endpoint changes — settle and close are already idempotent-safe once guarded.

### Web

New: apps/web/src/lib/http.ts (NetworkError + a shared authedFetch that classifies failures), apps/web/src/lib/offline-actions.ts, apps/web/src/lib/offline-actions.test.ts, apps/web/src/lib/floor-cache.ts, apps/web/src/lib/floor-cache.test.ts. Changed: apps/web/src/lib/offline-queue.ts (reimplemented over offline-actions, public API unchanged), apps/web/src/lib/use-offline-queue.ts (drains every action kind, exposes a per-kind pending count), apps/web/src/app/cafes/[id]/components/cafe-shell.tsx (mount the queue hook here plus a persistent 'N actions pending' pill), apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx (drop its local NetworkError/authedFetch/useOfflineQueue in favour of the shared ones), apps/web/src/app/cafes/[id]/tables/tables-tool.tsx (authedFetch delegates to lib/http), apps/web/src/app/cafes/[id]/tables/open-session-sheet.tsx (queue on NetworkError, optimistic seat), apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx (queue settle and close on NetworkError), apps/web/src/app/cafes/[id]/tables/floor-view.tsx (cached floor + pending overlay + offline banner).

### Tests

apps/web/src/lib/offline-actions.test.ts: 'enqueues and replays actions oldest-first'; 'a failed action stays queued and its attempt count increments'; 'a successful action is removed immediately so a mid-flush crash cannot replay it'; 'rewrites a queued order tableSessionLocalId to the real session id after the session.open ahead of it succeeds'; 'drops a session.settle that returns 409 ALREADY_SETTLED and reports it as already-done'; 'drops an order.create that returns 400 and surfaces it, rather than retrying forever'; 'survives a corrupt localStorage payload by returning an empty queue'; 'namespaces queues per cafe'. apps/web/src/lib/floor-cache.test.ts: 'stores and reads back a floor payload with its fetchedAt'; 'returns null for a different cafe'; 'returns null on unparseable storage'; 'applies a pending session.open as an occupied table overlay'. apps/api/src/routes/table-sessions.test.ts: 'returns the existing session with 200 when clientRequestId was already used'; 'returns 201 for a fresh clientRequestId'; 'still returns 409 SESSION_ALREADY_OPEN when a different clientRequestId targets an occupied table'. apps/api/src/repositories/table-sessions.db.test.ts: 'two replays of the same clientRequestId create exactly one session'.

### Files

- `apps/web/src/lib/http.ts`
- `apps/web/src/lib/offline-actions.ts`
- `apps/web/src/lib/offline-actions.test.ts`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/use-offline-queue.ts`
- `apps/web/src/lib/floor-cache.ts`
- `apps/web/src/lib/floor-cache.test.ts`
- `apps/web/src/app/cafes/[id]/components/cafe-shell.tsx`
- `apps/web/src/app/cafes/[id]/tables/tables-tool.tsx`
- `apps/web/src/app/cafes/[id]/tables/open-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/floor-view.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/api/src/routes/table-sessions.ts`
- `packages/types/src/api.ts`

---

<a id="auth-return-to-page"></a>

## 🟡 `auth-return-to-page` — Bounced sessions return to the page they were on, and a 401 asks you to sign in

### Approach

VERIFIED: apps/web/src/lib/supabase/middleware.ts:45-49 clones the URL, sets pathname='/login' and redirects, dropping the requested path (and keeping any unrelated query string, which is worse than dropping it). apps/web/src/app/(auth)/login/login-form.tsx:72 unconditionally router.push('/cafes').

CORRECTION to the third pointer. The auditor suggests detecting a 401 in apps/web/src/app/cafes/[id]/error.tsx:18-46. That cannot work in production: Next.js strips server-component error messages before they reach a client error boundary, replacing them with a generic string plus a digest, so `error.message` will never contain the ApiError's 401 text on a deployed build — it only appears to work in dev. The load-bearing fix has to be server-side, in apps/web/src/lib/api-server.ts:35-47, where the 401 is actually visible: call `redirect('/login?next=…')` instead of throwing ApiError for 401/403. All 21 serverFetch call sites are React Server Components, so redirect() is legal there.

One call site will silently swallow it and must be fixed in the same change: apps/web/src/app/cafes/[id]/orders/new/page.tsx:42-51 wraps the session fetch in a bare `catch { sessionTableLabel = null }`, which would eat the NEXT_REDIRECT control-flow error and leave the user on a half-rendered page. Rethrow when isRedirectError(err). The other sites use `if (err instanceof ApiError && err.status === 404) notFound(); throw err;` which propagates correctly.

The RSC needs to know its own URL to build `next`. Middleware already rebuilds the response; have it set an `x-sangam-path` request header (pathname + search) via NextResponse.next({ request: { headers } }) — note this must be applied in BOTH places the file constructs a response, including inside the cookies.setAll callback at :19, or the header is lost whenever Supabase refreshes a token.

The redirect target is attacker-influenceable, so it goes through a guard rather than straight into router.push. apps/web/src/lib/safe-next.ts rejects anything that is not a single-slash-prefixed same-origin path — no '//host', no '/\host', no scheme, no '/login' or '/signup' (which would loop) — and falls back to '/cafes'. That is pure logic and belongs in the web unit tests.

error.tsx still gets a small improvement — a 'Sign in again' secondary link next to 'Try again' — but it is a safety net, not the fix.

### Web

New: apps/web/src/lib/safe-next.ts and apps/web/src/lib/safe-next.test.ts. Changed: apps/web/src/lib/supabase/middleware.ts (append `next` on the unauthenticated redirect at 45-49, clearing any inherited search first; honour an existing `next` on the authed-hits-/login redirect at 51-55; set the x-sangam-path request header on every NextResponse.next call). Changed: apps/web/src/lib/api-server.ts (on res.status 401 or 403, read headers().get('x-sangam-path') and redirect to `/login?next=<encoded>` instead of throwing). Changed: apps/web/src/app/(auth)/login/login-form.tsx (read the next param and router.push(safeNext(next))). Changed: apps/web/src/app/(auth)/login/page.tsx (wrap the form in Suspense — useSearchParams in a client component under the app router requires it or the build fails). Changed: apps/web/src/app/cafes/[id]/orders/new/page.tsx (rethrow redirect errors from the bare catch at 48). Changed: apps/web/src/app/cafes/[id]/error.tsx (add a 'Sign in again' link).

### Tests

apps/web/src/lib/safe-next.test.ts: 'accepts /cafes/abc/orders/123'; 'preserves a query string on the path'; 'rejects //evil.example.com'; 'rejects /\\evil.example.com'; 'rejects https://evil.example.com'; 'rejects javascript:alert(1)'; 'rejects /login and /signup to avoid a redirect loop'; 'returns /cafes for null, empty and whitespace'. apps/web/src/lib/supabase/middleware.test.ts (new): 'redirects an unauthenticated request to /login?next=<path>'; 'includes the original query string in next'; 'does not add next for a public path'; 'sends an authenticated visitor on /login to their next target when it is safe'; 'sets x-sangam-path on the forwarded request headers'. apps/web/src/app/(auth)/login/login-form.test.tsx (new): 'pushes to the next param after a successful sign-in'; 'pushes to /cafes when next is missing'; 'pushes to /cafes when next is an off-site URL'.

### Files

- `apps/web/src/lib/safe-next.ts`
- `apps/web/src/lib/safe-next.test.ts`
- `apps/web/src/lib/supabase/middleware.ts`
- `apps/web/src/lib/supabase/middleware.test.ts`
- `apps/web/src/lib/api-server.ts`
- `apps/web/src/app/(auth)/login/login-form.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/page.tsx`
- `apps/web/src/app/cafes/[id]/error.tsx`

---

<a id="drawer-shift-reconciliation"></a>

## 🟠 `drawer-shift-reconciliation` — Link orders and tenders to the cash-drawer session so a shift can be reconciled

### Approach

VERIFIED: packages/db/src/schema/cash-drawer-sessions.ts has no link to any transaction, apps/api/src/repositories/reports.ts dayEnd() keys everything on istDayRange(date), and neither orders nor order_payments carries a drawer id. So two cashiers share one set of numbers and a shift crossing midnight is split across two reports, exactly as described.

The key design decision the auditor's pointer leaves open: WHICH shift owns an order that is rung up at 5pm and paid at 11pm across a handover? Two different questions need two different columns.
  orders.cash_drawer_session_id = the shift that RANG IT UP (stamped at create). Answers 'how many covers did the evening shift do'.
  order_payments.cash_drawer_session_id = the shift that BANKED THE MONEY (stamped at settle/refund time). Answers 'was the evening drawer short'.
The cash-variance report uses the payments column. This is also what makes a shift crossing midnight work — it is shift-keyed, not date-keyed.

Every money-writing path must stamp: apps/api/src/routes/orders.ts create (order column) and settle/refund (payment rows), the updateStatus->completed-with-method path in apps/api/src/repositories/orders.ts:267-289, the session settle in apps/api/src/repositories/table-sessions.ts, and the Razorpay markPaid path in apps/api/src/routes/payments.ts. The lookup is drawerRepo.findOpen(cafeId); a null result (no drawer in use) is fine and leaves the column null.

Second defect found while reading, and it belongs here: apps/api/src/routes/cash-drawer.ts:24 takes `expectedCashPaise` from the CLIENT body and stores it verbatim, then computes variance from it at :106-109. A cashier can therefore set expected = counted and make a shortfall disappear — in a product whose positioning is the audit trail. Compute expectedCashPaise server-side (openingFloat + cash payments − cash refunds for this drawer session) and ignore the client field; keep accepting it in the schema for one release but log a warning, then remove it.

BACKFILL: historical orders and payments keep NULL. The shift report must show a 'Before shift tracking' bucket for nulls rather than folding them into the current shift — silently attributing yesterday's money to today's cashier would be worse than not reporting at all.

### Schema

packages/db/src/schema/orders.ts — orders: ADD `cashDrawerSessionId: uuid()` (nullable); ADD `index('orders_drawer_idx').on(table.cashDrawerSessionId).where(sql`cash_drawer_session_id is not null`)`.
packages/db/src/schema/order-payments.ts — orderPayments: ADD `cashDrawerSessionId: uuid()` (nullable); ADD `index('order_payments_drawer_idx').on(table.cashDrawerSessionId).where(sql`cash_drawer_session_id is not null`)`.
Migration 0014, generated by drizzle-kit then hand-appended with: `ALTER TABLE orders ADD CONSTRAINT orders_cash_drawer_session_id_fk FOREIGN KEY (cash_drawer_session_id) REFERENCES cash_drawer_sessions(id) ON DELETE SET NULL;` and the same for order_payments. Both columns nullable with no default — no data backfill, additive and deployable in either order.
packages/types/src/domain.ts — Order gains `cashDrawerSessionId: string | null`; OrderPayment gains `cashDrawerSessionId: string | null`; new `ShiftReport extends DayEndReport { drawerSessionId: string; openedAt: string; closedAt: string | null; openingFloatPaise: number; expectedCashPaise: number; countedCashPaise: number | null; variancePaise: number | null }`.

### API

GET /cafes/:cafeId/reports/shift?drawerSessionId=<uuid> — 200 { report: ShiftReport }. 400 { error: { code: 'VALIDATION_ERROR' } } for a missing or malformed drawerSessionId. 404 NOT_FOUND when the drawer session is not in this cafe (or the cafe is not owned). The aggregates mirror dayEnd but filter money on order_payments.cash_drawer_session_id and counts on orders.cash_drawer_session_id.
GET /cafes/:cafeId/cash-drawer/current — response gains `expectedCashPaise: number` (live, computed server-side) alongside the existing session, so the close screen can show the expected figure before the cashier counts.
POST /cafes/:cafeId/cash-drawer/close — body { closingCountedPaise: integer ≥0, expectedCashPaise?: integer (NOW IGNORED — server-computed), notes?: string ≤500 }. Response { session, variancePaise } unchanged in shape, but variancePaise is now always non-null when a drawer session existed, and is computed as closingCountedPaise − (openingFloatPaise + cash payments − cash refunds stamped to this drawer session).
No change to POST /cafes/:cafeId/orders or the settle endpoints' contracts — the stamping is invisible to callers.

### Web

apps/web/src/app/cafes/[id]/cash-drawer/*.tsx — show the server-computed expected cash live before close, and the variance with an explicit over/short label after; stop sending expectedCashPaise. apps/web/src/app/cafes/[id]/reports/reports-view.tsx — add a shift selector listing this cafe's drawer sessions (label: 'Morning · 08:14–16:02 · Asha') that swaps the day-end card for the shift card, including the 'Before shift tracking' bucket note when the shift reports null-stamped rows.

### Tests

apps/api/src/routes/orders.test.ts: 'stamps the open drawer session id on a created order'; 'leaves cashDrawerSessionId null when no drawer is open'; 'stamps the drawer open at settle time on the order_payments rows, not the one open at create time'. apps/api/src/routes/table-sessions.test.ts: 'session settle stamps the current drawer on every payment row'. apps/api/src/repositories/reports.test.ts: 'shift() totals only the payments stamped to that drawer session'; 'shift() excludes payments from the other cashier the same day'; 'shift() includes a shift that crosses midnight IST in one report'; 'shift() reports null-stamped historical rows in a separate bucket, not in the shift total'; 'expectedCash = openingFloat + cash payments − cash refunds'. apps/api/src/routes/cash-drawer.test.ts: 'close computes expectedCashPaise server-side and ignores the client value'; 'variance is negative when counted is less than expected (short)'; 'variance is positive when counted exceeds expected (over)'; 'close returns 409 NO_OPEN_DRAWER when none is open'. apps/api/src/routes/reports.test.ts: 'GET /reports/shift returns 404 for a drawer session in another cafe'; 'returns 400 without drawerSessionId'.

### Files

- `packages/db/src/schema/orders.ts`
- `packages/db/src/schema/order-payments.ts`
- `packages/db/drizzle/migrations/0014_drawer_link.sql`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/repositories/reports.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/routes/reports.test.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.test.ts`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`

---

<a id="reports-range-and-z-print"></a>

## 🟡 `reports-range-and-z-print` — Date-range reports and a printable Z-report slip

### Approach

VERIFIED both halves. apps/web/src/app/cafes/[id]/reports/reports-view.tsx:67 hardcodes `from=${date}&to=${date}` while apps/api/src/routes/reports.ts:72-87 already validates and honours a real range (including the one-sided-expands and from>to -> 400 INVALID_RANGE cases). So the range work is entirely web-side — no API change at all. And there is no print route under reports/, though the order and session print pages give the exact pattern.

The subtlety worth stating: a Z-report is by definition one business day (or one shift), so it must NOT silently start summing a week. When the selected range spans more than one day, hide the day-end card and show only the range sales, with a line explaining why. Keeping a 'day-end' card that quietly aggregates seven days is how owners end up filing the wrong number.

Extract the range logic to apps/web/src/lib/report-range.ts — preset -> { from, to } in IST — and move the local todayIstDate() currently inlined at reports-view.tsx:27 into it so there is one IST helper on the web side (mirroring apps/api/src/reports/date-range.ts, which stays the server's copy).

The print slip reuses the 80mm thermal pattern from apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx (the @page size:80mm rule, the Divider/Row helpers, the mono 12px receipt div). AutoPrint is duplicated between that folder and the order print flow — move it to apps/web/src/components/print/auto-print.tsx and import it from all three, rather than adding a third copy. Extend the existing CSV builder to the range in the same pass; it already exists at reports-view.tsx handleDownload.

### API

none — GET /cafes/:cafeId/reports/sales already accepts from/to/groupBy and already returns 400 INVALID_RANGE when from > to (apps/api/src/routes/reports.ts:72-87). GET /cafes/:cafeId/reports/day-end and, once drawer-shift-reconciliation lands, GET /cafes/:cafeId/reports/shift are consumed unchanged by the new print route.

### Web

New: apps/web/src/lib/report-range.ts (presets Today / Yesterday / Last 7 days / This month / Last month / Custom -> { from, to }, plus todayIstDate) and apps/web/src/lib/report-range.test.ts. New: apps/web/src/app/cafes/[id]/reports/print/page.tsx — a server component reading ?date=YYYY-MM-DD or ?drawerSessionId=<uuid>, fetching via serverFetch, rendering the 80mm Z-report (header block with cafe name/GSTIN/FSSAI, business day or shift window, order count, gross/net/tax, payment-method breakdown, source breakdown, cancelled count and value, and for a shift the opening float / expected / counted / variance lines) and mounting AutoPrint. New: apps/web/src/components/print/auto-print.tsx (moved from the session print folder; the two existing importers updated). Changed: apps/web/src/app/cafes/[id]/reports/reports-view.tsx — second date input, preset buttons, from>to guard before fetching, day-end card hidden with an explanatory line when the range spans more than one day, a 'Print Z-report' button opening the new route in a new tab, and buildCsv extended to name the range in its filename and header.

### Tests

apps/web/src/lib/report-range.test.ts: 'Today returns the same IST date for from and to'; 'Yesterday returns the previous IST date for both'; 'Last 7 days spans 7 IST days inclusive and ends today'; 'This month starts on the 1st of the current IST month'; 'Last month spans the whole previous IST month including a 28-day February'; 'a range computed just after 00:00 IST (18:30 UTC the previous day) rolls to the new IST date'; 'Custom passes through the given bounds unchanged'; 'never returns from > to for any preset'. apps/web/src/app/cafes/[id]/reports/reports-view.test.tsx (new): 'requests from and to from the range picker rather than date twice'; 'hides the day-end card for a multi-day range'; 'blocks the fetch and shows an inline error when from is after to'; 'the CSV filename carries both dates for a range'.

### Files

- `apps/web/src/lib/report-range.ts`
- `apps/web/src/lib/report-range.test.ts`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`
- `apps/web/src/app/cafes/[id]/reports/reports-view.test.tsx`
- `apps/web/src/app/cafes/[id]/reports/print/page.tsx`
- `apps/web/src/components/print/auto-print.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`

---

## Order of work

1. 1. table-integrity-schema FIRST and alone. Everything after it assumes the FKs, the one-live-tab partial unique index, the orders.table_session_id index, archived_at and the new table_sessions columns exist. It also lands apps/api/test/db.ts (describeIfDb), without which none of the concurrency claims in later items can be tested. Deploy the migration during a service window: step (2) of the SQL collapses duplicate live sessions and must not race the API.
2. 2. order-session-binding. Smallest blocker with the largest floor impact (kitchen tickets stop saying Walk-in and rounds can no longer attach to a dead tab). Depends only on the index/FK from step 1 and can ship the same day.
3. 3. qr-orders-join-tab. Depends on step 1's unique index for the concurrent-scan race and on the findLiveWithTable helper added in step 2. Ships the paid-order settle fix and paidPaise/duePaise with it — do not split those out, or QR prepaid money gets double counted the moment sessions start receiving QR orders.
4. 4. session-lifecycle-guards. Must precede offline-table-actions, because the offline flusher's 'drop a replayed settle that returns 409 ALREADY_SETTLED' rule depends on that 409 existing. Carries the repository signature change for settle/close, so do it before other items start editing the same repo.
5. 5. billed-state-and-reprint. Independent of 6-8 but must come after 4 (it widens the same floor/findLiveByTable WHERE clauses that item 4 renames). Small, visible, good confidence-builder after four structural changes.
6. 6. tab-sheet-live-refresh. Land before session-move-merge-split so the manage actions are built on a sheet that already refreshes — otherwise every new action needs its own bespoke refresh path.
7. 7. session-move-merge-split. The largest item. Needs steps 1 (unique index + mergedIntoId), 3 (duePaise for the tender split) and 4 (the guarded settle it extends). Ship move + edit-guest first behind the same Manage sheet, then merge, then split — each is independently useful on the floor.
8. 8. offline-table-actions. Last of the table work: it wraps every endpoint the previous items defined, and rewriting the queue before those contracts settle means doing it twice. Hoisting useOfflineQueue into cafe-shell.tsx also fixes the existing order queue, so verify order replay still works before touching the session actions.
9. 9. auth-return-to-page. Fully independent of the table layer — can be done by a second developer in parallel with any step, or slotted in as a break between 4 and 5.
10. 10. drawer-shift-reconciliation. Independent of the table layer except that its settle-time stamping must be added to the session settle path, so run it after 7 or accept a small merge in table-sessions.ts.
11. 11. reports-range-and-z-print. Last. The shift selector in reports-view.tsx wants step 10's endpoint, and the print route reuses the AutoPrint component that step 5 has already touched.

## Risks

- The 0013 migration mutates live data. Step (2) reattaches orders from duplicate live sessions and closes the losers; step (1) nulls dangling orders.table_session_id. If any cafe is mid-service the reattachment can move a round onto a tab the waiter is not looking at. Run with the API stopped, log the affected row counts before and after, and keep a pre-migration dump. If any cafe is already live, dry-run the two SELECTs first and eyeball the result.
- ON DELETE RESTRICT on table_sessions.table_id is a one-way door for the layout editor: after this migration no table with history can ever be hard-deleted. The archive path in session-lifecycle-guards is what makes that liveable, so the two must ship together or the layout editor starts throwing raw 23503s at users.
- TableHistoryTableSummary.totalBilledPaise changes meaning (from 'sum of session totals' to 'money actually taken'). Any owner comparing today's History figure to yesterday's screenshot will see a difference on any tab that was force-closed. It is the correct number, but it is a visible behaviour change and should be called out in release notes rather than shipped silently.
- The repository interface changes for settle() and close() (discriminated result instead of `| null`) break every existing mock in apps/api/src/routes/table-sessions.test.ts. It is a compile-time break with no runtime surprise, but it means those tests must be updated in the same commit or CI is red between items.
- The concurrency guarantees in this plan (one live tab per table, no double settle, no double bill-print count, idempotent offline replay) cannot be proven by the existing fake-Drizzle test harness. They need apps/api/test/db.ts and a real Postgres in CI. If CI does not get a Postgres service, those tests are skipped by describeIfDb and the guarantees are asserted but unverified — which is worse than not claiming them.
- Auto-opening a table session from a QR scan means a diner can now change the floor plan. A stray scan of a poster in the corridor, or someone scanning a table's QR from outside, marks that table occupied and the waiter walks past a table with real guests at it. Mitigation: only auto-open when the label resolves to a real non-archived table, and give the floor a way to close a QR-opened tab with zero orders in one tap.
- The 401-to-login redirect in serverFetch is a control-flow throw. Any current or future serverFetch call site with a bare catch swallows it and renders a broken page. One such site exists today (orders/new/page.tsx:48) and is fixed here, but nothing prevents the next one — consider a lint rule or a shared wrapper rather than trusting review.
- Item-level bill splitting (dividing one round's lines between two bills) is explicitly out of scope. A cafe that expects true per-cover splitting on shared rounds will find the by-order split and the N-way tender split insufficient. The apportionment rule for it is specified in session-move-merge-split so it can be built later without re-deriving the design, but it is a separate multi-day piece involving a second invoice-sequence consumer.
- The offline seat flow stores an optimistic session on the device and reconciles on reconnect. Two devices seating the same table while both are offline will produce one winner and one loser at replay time (the unique index decides). The loser's queued rounds must be re-pointed at the winning session — the flusher does this — but a cashier who watched the table 'work' offline will see the tab merge under them. Show it explicitly rather than letting it happen quietly.
- Effort here is dominated by two items (session-move-merge-split and offline-table-actions, ~10 of the 29 days). If the schedule compresses, ship items 1-5 and 9 — that is the blocker set plus the two cheap fixes — and defer 6-8 and 10-11. Do not compress by skipping the DB-backed tests; the integrity work is the whole point of the theme.
