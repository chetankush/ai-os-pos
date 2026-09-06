# Order amendment, void discipline & lifecycle

**Estimated effort: 29 engineer-days · 12 work items**

Today a placed order is frozen: there is no route that touches order_items or the money columns after POST /cafes/:cafeId/orders, the status machine is forward-only, and cancels/discounts leave no audit row. The only remedy for "make that two" or a mis-punched line is Cancel + re-punch, which burns a gapless GST serial, re-fires a KOT the kitchen is already cooking, and hides genuine voids in the noise of honest ones. This theme adds a re-pricing amendment engine (line patch + post-creation bill adjustments, both inside one locked transaction), a reason-bearing audit trail for every void/discount/amendment, lifecycle timestamps plus recall and punch-and-pay transitions, a split-tender table settle, a diner grace-window cancel, and fixes the day-end figures so gross = net + tax + round-off actually foots and a Z-report can be printed on the 80mm counter printer. The counter gets to correct mistakes without destroying the invoice series, and the owner gets a day-end that reconciles the drawer.

---

<a id="order-reprice-engine"></a>

## 🔴 `order-reprice-engine` — Re-pricing engine: adjustment intent persistence, soft line voids, orders.amend() transaction

### Approach

Foundation for gaps 1, 7, 11, 14 and reused by the table-session settle. THE AUDITOR'S POINTER IS WRONG IN ONE IMPORTANT WAY: it says the amendment should 're-run apps/api/src/orders/build.ts:134-189'. buildOrder() resolves EVERY line against the live menu (build.ts:140-171), so re-running it on an open order would silently re-price lines that were punched at 5pm using the menu price at 6pm. An amendment must preserve itemNameSnapshot/hsnSnapshot/unitPricePaise on existing lines and snapshot the live menu ONLY for newly added lines.

Step 1 — split build.ts into three exported pure functions with no behaviour change: `snapshotLines(menu, lines): NewOrderItem[]` (lift the map at build.ts:155-171 verbatim, still throwing OrderBuildError), `priceLines(lines: {unitPricePaise,quantity}[], gstRateBp, adj: BillAdjustments): Omit<BuiltOrderTotals,'items'>` (subtotal = sum(unitPricePaise*quantity) over NON-VOID lines, then the existing computeBillAdjustments), and keep `buildOrder` as a thin `priceLines(snapshotLines(...))` wrapper so POST /orders and POST /public/.../orders are byte-identical.

Step 2 — persist adjustment INTENT. orders stores only resolved paise (discountPaise, serviceChargePaise), so after adding an item we cannot tell whether '₹50 off' was a flat ₹50 or 10%. Add discount_type/discount_value_bp/discount_value_paise/service_charge_bp/round_off_enabled. Re-price rule: if discount_type is non-null, recompute the discount from type+value against the NEW subtotal; if null but discountPaise > 0 (legacy row), carry the paise amount forward clamped to min(discountPaise, newSubtotal). Same for service charge: recompute from service_charge_bp when > 0, else carry serviceChargePaise forward unchanged. packagingChargePaise is already flat and is always carried. round_off re-applies when round_off_enabled.

Step 3 — SOFT line voids, never DELETE. order_items gains is_void/void_reason/voided_at. A voided line KEEPS its quantity, unitPricePaise and lineTotalPaise (so the audit shows exactly what was voided and for how much) and is excluded by an explicit `is_void = false` predicate at every money/KOT consumer. This is the trap in the change: every one of these must be updated in the same PR — orders repo topItemsToday (:469-480), itemSalesToday (:494-507); reports repo sales() item branch (:170-180) and category branch (:196-210); table-sessions repo ordersForSession (:80-86) and history() (:270-276). findByIdAndCafe/listBySession/listKitchenTickets keep returning voided lines (the UI needs to show them struck through) — only the aggregates filter.

Step 4 — `amend()` on OrdersRepository (interface at :45-104). One db.transaction: (a) SELECT the order FOR UPDATE (drizzle 0.36 `.for('update')`) — serialises two terminals editing the same bill; (b) if input.ifUpdatedAt is present and !== order.updatedAt throw OrderAmendError('STALE_ORDER'); (c) reject on status completed/cancelled ('ORDER_CLOSED') or paymentStatus 'paid'/'pending'/'refunded' ('ALREADY_PAID') — a prepaid QR order must be refunded, not edited; (d) load current items, apply setQuantities by orderItemId (unknown id → 'UNKNOWN_LINE'; quantity 0 → is_void=true + void_reason + voided_at=now; quantity > 0 → UPDATE quantity and lineTotalPaise = unitPricePaise * quantity, un-voiding is not permitted — re-add the item instead), insert addLines (already snapshotted by the route); (e) if zero non-void lines remain throw 'EMPTY_ORDER' — an amendment may never leave a ₹0 invoice occupying a serial, the cashier must cancel; (f) merge the adjustment patch onto the stored intent, call priceLines over the surviving lines, UPDATE every money column plus amended_count = amended_count + 1 and last_amended_at = now; (g) return { order, before, delta }.

Step 5 — `diffOrderItems(before, after): OrderDelta` pure helper in apps/api/src/orders/diff.ts producing { added: {name,quantity}[], removed: {name,quantity}[], changed: {name,fromQty,toQty}[] }. Drives the supplementary KOT and the audit metadata.

Step 6 — `apportionPaise(totalPaise, weights: {key,weight}[]): Map<key,number>` in apps/api/src/orders/apportion.ts. Largest-remainder (Hamilton): raw_i = totalPaise * w_i / W computed with integer maths (num_i = totalPaise * w_i, floor_i = Math.floor(num_i / W)), R = totalPaise - Σfloor_i, then +1 paisa each to the R keys with the largest remainder num_i mod W, ties broken by larger weight then by ascending key string. Σ parts === totalPaise EXACTLY, always, including W=0 (return all zeros) and totalPaise=0. Needed by the table-session discount in work item table-session-split-settle. No apportionment happens on a single order: the discount stays a bill-level pre-tax reduction exactly as computeBillAdjustments does today, so no per-line remainder rule is required there.

No route changes in this item — it lands green under existing tests plus its own.

### Schema

Migration 0013 (additive, backward-compatible).
ALTER TABLE orders
  ADD COLUMN discount_type text,                              -- 'percent' | 'flat' | NULL
  ADD COLUMN discount_value_bp integer NOT NULL DEFAULT 0,     -- percent in basis points, 1000 = 10.00%
  ADD COLUMN discount_value_paise integer NOT NULL DEFAULT 0,  -- flat discount in paise
  ADD COLUMN service_charge_bp integer NOT NULL DEFAULT 0,
  ADD COLUMN round_off_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN amended_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_amended_at timestamptz;
ALTER TABLE order_items
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN void_reason text,
  ADD COLUMN voided_at timestamptz;
CREATE INDEX order_items_order_live_idx ON order_items (order_id) WHERE is_void = false;

BACKFILL (must ship in the same migration file, after the ADD COLUMNs):
UPDATE orders SET discount_type = 'flat', discount_value_paise = discount_paise WHERE discount_paise > 0;
UPDATE orders SET round_off_enabled = true WHERE round_off_paise <> 0;
service_charge_bp is deliberately NOT back-derived from service_charge_paise (the division is lossy); legacy rows carry their service charge forward as a flat amount, which is the documented fallback.
The round_off backfill has one known false negative: an order created with roundOff on whose pre-round total was already whole rupees has round_off_paise = 0 and will not re-round on amendment. Acceptable; documented in the migration comment.

packages/db/src/schema/orders.ts: add the matching drizzle columns (casing:'snake_case' maps discountValueBp -> discount_value_bp automatically). packages/types/src/domain.ts: Order gains discountType: 'percent'|'flat'|null, discountValueBp: number, discountValuePaise: number, serviceChargeBp: number, roundOffEnabled: boolean, amendedCount: number, lastAmendedAt: string|null; OrderItem gains isVoid: boolean, voidReason: string|null, voidedAt: string|null.

### API

none (repository + pure functions only; routes land in order-amend-api)

### Tests

apps/api/src/orders/build.test.ts (extend): 'snapshotLines rejects an unknown item', 'snapshotLines rejects an unavailable item', 'priceLines ignores voided lines in the subtotal', 'priceLines with no adjustments equals the legacy buildOrder totals (regression)', 'buildOrder still delegates to snapshotLines+priceLines with identical output for the 5%/18%/composition cases'.
apps/api/src/orders/apportion.test.ts (new): 'splits 100 paise across three equal weights as 34/33/33 and sums to 100', 'gives the remainder paisa to the largest fractional remainder first', 'breaks a remainder tie by larger weight then by ascending key', 'returns all zeros when every weight is zero', 'returns all zeros when the total is zero', 'never allocates more than the total for 10000 random weight vectors (property test)'.
apps/api/src/orders/diff.test.ts (new): 'reports a pure addition', 'reports a line void as removed with its original quantity', 'reports a quantity change with from and to', 'reports nothing when the line set is unchanged'.
apps/api/src/repositories/orders.amend.test.ts (new, mocked tx harness in the style of table-sessions.repo.test.ts): 'keeps the original unit price on an existing line when the menu price has since changed', 'snapshots the live menu price for a newly added line', 'sets is_void and void_reason instead of deleting the row when quantity is 0', 'recomputes a percent discount against the new subtotal', 'carries a legacy flat discountPaise forward clamped to the new subtotal', 'carries serviceChargePaise forward unchanged when service_charge_bp is 0', 're-applies round-off when round_off_enabled is true', 'throws EMPTY_ORDER when the last live line is voided', 'throws ALREADY_PAID for a paid order', 'throws ORDER_CLOSED for a cancelled order', 'throws STALE_ORDER when ifUpdatedAt does not match', 'throws UNKNOWN_LINE for an orderItemId from another order', 'increments amended_count and stamps last_amended_at', 'totals still satisfy total = subtotal - discount + service + packaging + tax + roundOff after the amendment'.

### Files

- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/orders/diff.ts`
- `apps/api/src/orders/diff.test.ts`
- `apps/api/src/orders/apportion.ts`
- `apps/api/src/orders/apportion.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.amend.test.ts`
- `apps/api/src/repositories/reports.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0013_*.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`

---

<a id="order-amend-api"></a>

## 🔴 `order-amend-api` — PATCH .../items, PATCH .../adjustments, DELETE .../items/:itemId

### Approach

Exposes the engine. Three routes in apps/api/src/routes/orders.ts, registered after the existing /status handler.

PATCH /cafes/:cafeId/orders/:orderId/items takes an INCREMENTAL line patch, not a full desired set. Lines the client omits are untouched. This matters: a full-set PUT means a stale tab or a flaky connection can silently drop a line the kitchen is already cooking. Each entry is either { orderItemId, quantity, notes? } (quantity 0 voids the line) or { menuItemId, quantity, notes? } (adds). The route: resolve the cafe via cafesRepo.findByIdAndOwner (404, never 403); parse; fetch menuRepo.getFullMenu(cafeId) and snapshotLines() ONLY the add entries, mapping OrderBuildError to 400 INVALID_ITEM/ITEM_UNAVAILABLE exactly as the create handler does at :142-149; call ordersRepo.amend(); map OrderAmendError codes to status (ORDER_CLOSED 409, ALREADY_PAID 409, STALE_ORDER 409, EMPTY_ORDER 400, UNKNOWN_LINE 400); cache.del(statsKey(cafeId)); respond { order, delta }.

REASON POLICY (the money-leaving rule): reason is REQUIRED when the amendment reduces the bill — i.e. when the returned after.totalPaise < before.totalPaise — and optional for a pure addition. Missing reason on a reducing amendment → 400 REASON_REQUIRED before anything is written (the route must pre-compute nothing; instead run amend() inside the transaction, and because the reason check needs the delta, do it the cheap way: if the patch contains any quantity decrease, any void, or any discount increase, require reason up front from the request shape — that is decidable without touching the DB and avoids a wasted transaction).

DELETE /cafes/:cafeId/orders/:orderId/items/:itemId is sugar over the same engine: body { reason } required (this route always reduces the bill). It calls amend({ setQuantities: [{ orderItemId: itemId, quantity: 0, notes: null }] }) and writes an order.item_void audit entry naming the item, its quantity and its lineTotalPaise. This is gap 7/14 verbatim, and 404s if the itemId does not belong to that order.

PATCH /cafes/:cafeId/orders/:orderId/adjustments carries the post-creation discount/charges (gap 11's 'coupon produced after the KOT'). Three-state semantics per key: absent = leave unchanged, null = clear, value = set. Zod: each key `.nullable().optional()`, and the handler tests `'discount' in body` to distinguish absent from null. Guards are identical (non-terminal, unpaid). A discount increase requires a reason.

All three write to the immutable audit log via auditRepo.record with the taxonomy defined in void-reason-and-audit. Metadata always carries billPrintCount so the owner can see an amendment that happened AFTER the customer bill was handed over — the classic 'edit the bill after payment' shape. Amending a printed bill is allowed (a customer really does add a chai after seeing the bill) but is flagged in metadata as billAlreadyPrinted: true.

Extend PublicRoutes? No — the diner never amends; that is a staff action (diner cancel is a separate item).

### Schema

none (uses 0013)

### API

PATCH /cafes/:cafeId/orders/:orderId/items
  body { lines: Array<{orderItemId: uuid, quantity: int 0..99, notes?: string<=200} | {menuItemId: uuid, quantity: int 1..99, notes?: string<=200}> (1..40), reason?: string 3..200, ifUpdatedAt?: ISO string }
  200 { order: OrderWithItems, delta: { added: {name,quantity}[], removed: {name,quantity}[], changed: {name,fromQty,toQty}[] } }
  400 { error:{code:'REASON_REQUIRED'|'EMPTY_ORDER'|'UNKNOWN_LINE'|'INVALID_ITEM'|'ITEM_UNAVAILABLE'|'VALIDATION_ERROR'} }
  404 cafe or order not found (NOT_FOUND)
  409 { error:{code:'ORDER_CLOSED'|'ALREADY_PAID'|'STALE_ORDER'} }
  401 unauthenticated

DELETE /cafes/:cafeId/orders/:orderId/items/:itemId
  body { reason: string 3..200 }  (required)
  200 { order: OrderWithItems, delta }
  400 REASON_REQUIRED | EMPTY_ORDER ; 404 NOT_FOUND (cafe, order, or item not on this order) ; 409 ORDER_CLOSED | ALREADY_PAID

PATCH /cafes/:cafeId/orders/:orderId/adjustments
  body { discount?: {type:'percent'|'flat', value: number>=0, reason?: string<=120} | null,
         serviceChargeBp?: int 0..10000 | null,
         packagingChargePaise?: int >=0 | null,
         roundOff?: boolean | null,
         reason?: string 3..200,
         ifUpdatedAt?: ISO string }
  200 { order: OrderWithItems }
  400 REASON_REQUIRED | VALIDATION_ERROR ; 404 NOT_FOUND ; 409 ORDER_CLOSED | ALREADY_PAID | STALE_ORDER

packages/types/src/api.ts gains AmendOrderItemsRequest, AmendOrderItemsResponse, VoidOrderItemRequest, UpdateOrderAdjustmentsRequest, OrderDelta.

### Web

none in this item (consumed by order-edit-panel-web)

### Tests

apps/api/src/routes/orders.test.ts, new describe blocks using the existing buildTestApp + createMockOrdersRepo pattern (add `amend: vi.fn()` to the mock and to the beforeEach reset list).
PATCH .../items: 'adds a line and returns the recomputed total', 'changes a line quantity and returns the delta', 'voids a line when quantity is 0', 'requires a reason when the amendment reduces the bill', 'does not require a reason for a pure addition', '409 ALREADY_PAID for a paid order', '409 ORDER_CLOSED for a cancelled order', '409 STALE_ORDER when ifUpdatedAt is stale', '400 EMPTY_ORDER when the last line would be voided', '400 ITEM_UNAVAILABLE when adding an out-of-stock menu item', '404 for an order belonging to another cafe', '401 without a token', 'invalidates the today-stats cache'.
DELETE .../items/:itemId: 'voids the single line and recomputes the total', '400 when no reason is given', '404 when the item belongs to a different order', 'records an order.item_void audit entry carrying the item name, quantity and lineTotalPaise'.
PATCH .../adjustments: 'applies a percent discount after creation and recomputes tax on the reduced base', 'clears the discount when discount is explicitly null', 'leaves the discount untouched when the key is absent', 'adds a service charge and re-rounds the total', 'requires a reason when the discount increases', 'flags billAlreadyPrinted in the audit metadata when billPrintCount > 0', '409 for a paid order'.

### Files

- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/repositories/orders.ts`
- `packages/types/src/api.ts`
- `packages/types/src/index.ts`

---

<a id="void-reason-and-audit"></a>

## 🔴 `void-reason-and-audit` — Required cancel reason + the full void/discount/amend audit taxonomy

### Approach

Gaps 3 and 12. Verified: apps/api/src/routes/orders.ts logs order.bill_reprinted (:336-347) and order.refund (:428-441) but the status handler (:259-298) and the create handler (:122-177) write nothing, so the audit page's own promise at apps/web/src/app/cafes/[id]/audit/page.tsx:45-48 ('voids, refunds, discounts') is currently false for two of the three.

1. updateStatusBodySchema (:70-73) gains `reason: z.string().trim().min(3).max(200).optional()`, and the handler returns 400 REASON_REQUIRED when nextStatus === 'cancelled' and no reason is given. THIS IS A BREAKING API CHANGE: every existing caller of PATCH .../status with {status:'cancelled'} starts failing. The only caller today is apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:494 (the ConfirmDialog onConfirm); the kitchen board never cancels. Both are updated in this item. Grepped: apps/api/src/ai/agent.ts has no order-status tool, so the AI console is unaffected.
2. After a successful cancel, persist cancel_reason on the order (column added in order-lifecycle-timestamps) and write auditRepo.record({ action:'order.void', entityType:'order', entityId:orderId, actorType:'owner', actorId:request.user.id, summary:`Voided ${order.orderNumber} (₹${total/100}) — ${reason}`, metadata:{ reason, previousStatus, totalPaise, itemCount, billPrintCount, minutesSincePlaced } }). billPrintCount and minutesSincePlaced are the two fields that separate 'punched by mistake 20 seconds ago' from 'cancelled after the food went out'.
3. Create handler: after ordersRepo.create succeeds, if built.discountPaise > 0 write action 'discount.apply' with metadata { discountPaise, type, value, reason: built.discountReason, subtotalPaise, pctOfSubtotalBp: Math.round(discountPaise*10000/subtotalPaise) }. pctOfSubtotalBp is what makes 'every discount over 50%' a one-line query for the owner.
4. Taxonomy, all dotted keys consistent with the existing order.refund/order.bill_reprinted: order.void (cancel), order.item_void (single line), order.amend (line set changed), order.adjust (bill adjustments changed), discount.apply (resolved discount goes 0 -> >0 or increases, at create OR adjust), discount.remove (goes to 0), order.recall (backward transition), order.complete.
5. order.complete is DELIBERATELY NOT written for every completion. The auditor asks for one on every completion; a 200-cover cafe would then bury its six voids under 200 routine completions and the owner would stop reading the log. Write order.complete ONLY when the completion skipped the kitchen (previousStatus is 'pending' or 'preparing' — i.e. punch-and-pay or a suspicious jump), with metadata { previousStatus, paymentMethod, totalPaise }. Every void, every item void, every discount and every reducing amendment is always logged.
6. Add an action filter to the audit page's quick filters for the new keys — the route apps/api/src/routes/audit-logs.ts already supports ?action= via AuditLogListOptions.

### Schema

none of its own (cancel_reason lands with order-lifecycle-timestamps; run that migration first or fold cancel_reason into 0013)

### API

PATCH /cafes/:cafeId/orders/:orderId/status — body gains `reason?: string 3..200`; returns 400 { error:{ code:'REASON_REQUIRED', message:'A reason is required to cancel an order' } } when status==='cancelled' without one. Response shape unchanged: 200 { order: OrderWithItems }.
packages/types/src/api.ts: UpdateOrderStatusRequest gains `reason?: string`.
No new endpoints.

### Web

apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx — the ConfirmDialog at :486-495 becomes a small form: a required reason <input> (maxLength 200, placeholder 'Wrong item / customer left / duplicate') plus three one-tap presets, with the confirm button disabled until >= 3 chars; transition('cancelled','cancel') passes { reason }. apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx — add the new action keys to the filter list and give order.void / order.item_void / discount.apply distinct badge colours (danger for voids, amber for discounts).

### Tests

apps/api/src/routes/orders.test.ts: 'rejects a cancel with no reason (400 REASON_REQUIRED)', 'accepts a cancel with a reason and records an order.void audit entry', 'the order.void metadata carries reason, previousStatus, totalPaise and billPrintCount', 'does not require a reason for a non-cancel transition', 'records discount.apply on create when a discount is present', 'does not record discount.apply on create when there is no discount', 'discount.apply metadata carries pctOfSubtotalBp', 'records order.complete only when completing from pending or preparing', 'does not record order.complete when completing from ready'.
apps/api/src/routes/audit-logs.test.ts: 'filters to action=order.void'.

### Files

- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/audit-logs.test.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx`
- `apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx`
- `packages/types/src/api.ts`

---

<a id="order-lifecycle-timestamps"></a>

## 🟠 `order-lifecycle-timestamps` — Lifecycle timestamps, recall transitions and punch-and-pay in the state machine

### Approach

Gaps 2, 6 and 8. Verified: ALLOWED_TRANSITIONS is at apps/api/src/routes/orders.ts:94-100 (the auditor's :93 is the comment line), and updateStatus (apps/api/src/repositories/orders.ts:269-292) writes only `status`, plus `paidAt` on completion. Also verified the auditor's aside: POST .../settle (:354-390) calls settleWithPayments which sets status 'completed' from ANY state without consulting the table — so punch-and-pay is already reachable today through the settle route while the /status route forbids it. The model really is inconsistent; this item makes the table match reality.

New table:
  pending:   ['preparing','ready','completed','cancelled']
  preparing: ['pending','ready','completed','cancelled']
  ready:     ['preparing','completed','cancelled']
  completed: []
  cancelled: []
pending/preparing -> completed is punch-and-pay (gap 2). preparing -> pending and ready -> preparing are recall (gap 6). completed and cancelled stay terminal: reopening a completed order is a refund problem, not a transition, and the refund route already exists.

RECALL IS NOT TIME-BOXED. The auditor suggests 'ideally time-boxed'; a lunch rush routinely leaves a ticket 30 minutes, and a window that expires strands exactly the ticket the kitchen needs to fix. Instead every backward transition is audit-logged as order.recall with metadata { from, to, minutesInPreviousState } — the owner can see a cashier recalling six tickets a day without the kitchen being unable to fix a mis-tap.

Timestamps stamped inside updateStatus:
  started_at   — set on the FIRST entry into 'preparing' only (COALESCE, never overwritten), so prep-time analytics survive a recall.
  ready_at     — set on EVERY entry into 'ready' (overwritten after a re-bump) and CLEARED TO NULL on ready -> preparing, so 'time on the pass' = now - ready_at is always the current pass and is null while cooking.
  completed_at — set on entry into 'completed'.
  cancelled_at + cancel_reason — set on entry into 'cancelled'.

BUG FIXED HERE: updateStatus currently writes paidAt = now on ANY completion (repositories/orders.ts:276-277), even one with no paymentMethod, leaving an order with paymentStatus 'unpaid' and a non-null paidAt. The order detail page only hides the contradiction with a guard at page.tsx:197. Correct it: write completed_at on every completion, and paidAt ONLY when a paymentMethod is supplied (i.e. when paymentStatus actually flips to 'paid'). Go-forward only; the backfill copies paid_at into completed_at for existing completed rows and leaves paid_at alone so history is not rewritten.

The repo signature grows a reason: updateStatus(id, cafeId, status, paymentMethod?, reason?) — the mock in orders.test.ts must be widened.

### Schema

Migration 0014 (additive).
ALTER TABLE orders
  ADD COLUMN started_at timestamptz,
  ADD COLUMN ready_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancel_reason text;
BACKFILL:
UPDATE orders SET completed_at = paid_at WHERE status = 'completed' AND completed_at IS NULL AND paid_at IS NOT NULL;
UPDATE orders SET cancelled_at = updated_at WHERE status = 'cancelled' AND cancelled_at IS NULL;   -- best available approximation, noted in the migration comment
Deliberately NOT run: `UPDATE orders SET paid_at = NULL WHERE payment_status <> 'paid'`. It would be the correct cleanup of the historic bug but it rewrites financial history; flag it to the owner as an optional one-off with sign-off.
packages/db/src/schema/orders.ts + packages/types/src/domain.ts Order: startedAt/readyAt/completedAt/cancelledAt: string|null, cancelReason: string|null.

### API

PATCH /cafes/:cafeId/orders/:orderId/status — same path and body shape (plus `reason` from void-reason-and-audit). Behavioural change only: transitions pending->completed, preparing->completed, pending->ready, preparing->pending and ready->preparing now return 200 instead of 400 INVALID_TRANSITION. completed->anything and cancelled->anything still return 400 INVALID_TRANSITION. Response 200 { order: OrderWithItems } now carries the new timestamps.

### Web

None here beyond type flow — the timestamps are consumed by kitchen-close-and-recall and z-report-print. apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx:197 keeps its paidAt guard (now redundant but harmless).

### Tests

apps/api/src/routes/orders.test.ts: 'allows pending -> completed (punch and pay)', 'allows preparing -> completed', 'allows ready -> preparing (recall) and records an order.recall audit entry', 'allows preparing -> pending (recall)', 'still rejects completed -> preparing', 'still rejects cancelled -> pending', 'a no-op same-status PATCH is still accepted'.
apps/api/src/repositories/orders.status.test.ts (new): 'stamps started_at on the first entry into preparing', 'does not overwrite started_at when re-entering preparing after a recall', 'overwrites ready_at on every entry into ready', 'clears ready_at on ready -> preparing', 'stamps completed_at and cancelled_at on the terminal transitions', 'writes paidAt only when a paymentMethod is supplied', 'does not write paidAt when completing without a method (regression for the unpaid-with-paidAt bug)', 'persists cancel_reason on a cancel'.

### Files

- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.status.test.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0014_*.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`

---

<a id="kitchen-close-and-recall-ui"></a>

## 🟠 `kitchen-close-and-recall-ui` — Kitchen board: Served bump, recall control, per-state age badge, ticket links to the order

### Approach

Gaps 5 and 6 on the web side. Verified: COLUMNS at apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:31-51 gives the ready column `bump: null` (:46-50), and TicketCard renders a dead 'Ready for pickup' caption (:316-321) with no link anywhere on the card.

1. Ready column gets `bump: { next: 'completed', label: 'Served', icon: <HandPlatter className="size-4"/> }`. ready -> completed is already legal (routes/orders.ts:97) so no API change is needed for this half.
2. Recall: a small ghost icon button (RotateCcw, aria-label `Recall ${orderNumber} to ${previousLabel}`) in the card header for the preparing and ready columns, PATCHing status back one state. The ready -> preparing recall goes through ConfirmDialog ('This ticket is on the pass and the floor view may already show the table as ready') because it is visible to the front of house; preparing -> pending fires immediately. Both use the existing optimistic-move-then-refresh pattern at :118-144 and toast 'Recalled to Preparing'.
3. Card links to the order: wrap ONLY the order-number line (:254) in a Next <Link href={`/cafes/${cafeId}/orders/${ticket.id}`}> with an explicit tap target (min-h-11) — not the whole card, because the bump Button must stay clickable and a button inside an anchor is invalid HTML.
4. Age badge switches to a per-state clock using the new timestamps: New shows now - createdAt ('waiting 4m'), Preparing shows now - startedAt ('cooking 7m'), Ready shows now - readyAt ('on pass 12m'). WARN_MIN/LATE_MIN thresholds are applied to the per-state age, so a ticket that has been ready for 15 minutes finally goes red instead of looking identical to one still cooking (gap 8's complaint). Extract the whole calculation into apps/web/src/lib/ticket-age.ts as `ticketAge(ticket, nowMs): { label: string; minutes: number; tone: 'calm'|'warn'|'late' }` so it is unit-testable (web tests live under src/lib).
5. Voided lines: TicketCard's item list (:283-295) renders is_void lines struck-through with a 'VOID' chip so a kitchen that already started the dish sees it was pulled.

NOTE ON A KNOWN SIDE EFFECT: a kitchen 'Served' bump completes an order whose paymentStatus is still 'unpaid', and todayStats/dayEnd currently key revenue off status='completed', so the day's revenue would inflate. That is fixed properly in day-end-money-model (revenue keys off paymentStatus), not worked around in the UI — do not ship this item before that one, or ship them together.

### API

none (uses the transitions opened in order-lifecycle-timestamps)

### Web

apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx — COLUMNS gains the ready bump and a `recall: { prev: OrderStatus; label: string } | null` per column; bump() generalised to transition(ticket, next, kind) so recall reuses it; TicketCard gains the Link, the recall button and the void-line rendering. NEW apps/web/src/lib/ticket-age.ts + ticket-age.test.ts. apps/web/src/app/cafes/[id]/kitchen/page.tsx passes cafeId through to the board (it already does).

### Tests

apps/web/src/lib/ticket-age.test.ts (new): 'a pending ticket ages from createdAt and reads "waiting Nm"', 'a preparing ticket ages from startedAt and reads "cooking Nm"', 'a ready ticket ages from readyAt and reads "on pass Nm"', 'falls back to createdAt when startedAt is null (legacy row)', 'returns tone calm below 10 minutes, warn at 10, late at 20', 'returns "now" for a zero-or-negative age'.
apps/api/src/routes/orders.test.ts already covers the ready -> completed and ready -> preparing transitions; add 'the kitchen ticket feed excludes an order completed from the ready column' against listKitchenTickets.

### Files

- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/lib/ticket-age.ts`
- `apps/web/src/lib/ticket-age.test.ts`
- `apps/api/src/routes/orders.test.ts`

---

<a id="punch-and-pay-ui"></a>

## 🟠 `punch-and-pay-ui` — Tender picker on the order builder + one-tap settle on the orders list row

### Approach

Gap 2's UI half. Today a ₹60 chai-and-samosa costs five interactions and a page load: Place order -> land on the detail page -> Start preparing -> Mark as ready -> Mark as completed -> pick a method -> Complete.

1. Order builder (apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx). Add a tender segmented control immediately above the Place-order button in CartPanel (the button is at :1119-1135): `Pay later | UPI | Cash | Card`, UPI-first to match the counter. The choice persists per device+cafe in localStorage under `sangam:tender-default:{cafeId}` (hydrated after mount like the existing AUTOPRINT_KEY pattern at :218-231 so SSR and CSR markup match). The button label becomes `Place order · ₹X` or `Place & take ₹X · UPI`.
   handleSubmit gains a second leg: after POST /cafes/:cafeId/orders returns, if a tender was chosen, immediately POST /cafes/:cafeId/orders/:id/settle with { payments: [{ method, amountPaise: data.order.totalPaise }] } — the existing split-tender route, which already completes the order and writes the order_payments row. Then toast `Order ${orderNumber} · paid by UPI`, resetForm(), and STAY ON THE BUILDER (no router.push) so the next customer can be punched straight away. That is the whole point: at 250 covers a day the navigation is the tax.
   Two failure modes must be handled explicitly, not swallowed:
   - Offline (the enqueue path at :350-358): a queued order has no id, so it cannot be settled. Force the tender back to 'Pay later' for that submission and toast 'Saved offline — record the payment when it syncs'. Never silently drop a recorded tender.
   - Create succeeded, settle failed: the order EXISTS and is unpaid. Do NOT reset the cart silently; show the error inline with a link to /cafes/{cafeId}/orders/{id} and the text 'Order placed but not settled — take payment on the order'.
2. Orders list (apps/web/src/app/cafes/[id]/orders/page.tsx:81-123). OrderRow is currently a bare <Link> wrapping the whole Card, so a settle button cannot be nested inside it (invalid HTML, and the anchor swallows the click). Restructure: the Card becomes a relative container, the Link becomes an absolutely-positioned stretched overlay over the left region, and a new client component <QuickSettle> sits above it in the stacking order on the right, rendered only when order.status !== 'cancelled' && order.paymentStatus === 'unpaid'. It is a 3-button popover (UPI/Cash/Card) that POSTs the same settle payload and router.refresh()es. Because page.tsx is an RSC, QuickSettle is a new 'use client' file under _components/.
3. Extract the tender maths shared by the builder, QuickSettle, order-actions.tsx and the table sheet into apps/web/src/lib/tender.ts: `toPaise(rupeeInput: string): number` (Math.round(Number(x) * 100), NaN -> 0) and `splitBalance(rows, totalPaise): { allocatedPaise, remainingPaise, balanced }`. order-actions.tsx:162-166 currently inlines this; the duplication is how the ₹0.5 rounding bugs get in.

### API

none — reuses POST /cafes/:cafeId/orders/:orderId/settle { payments:[{method, amountPaise}] } -> 200 { order }, 409 ALREADY_PAID, 400 AMOUNT_MISMATCH (which already exists at apps/api/src/routes/orders.ts:354-390 and already bypasses the status machine).

### Web

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx (tender control in CartPanel, second leg in handleSubmit, localStorage default, offline guard); NEW apps/web/src/app/cafes/[id]/orders/_components/quick-settle.tsx; apps/web/src/app/cafes/[id]/orders/page.tsx (OrderRow restructure to stretched-link + sibling control); NEW apps/web/src/lib/tender.ts + tender.test.ts; apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx (use the shared helpers).

### Tests

apps/web/src/lib/tender.test.ts (new): 'toPaise converts a rupee string with two decimals exactly (241.50 -> 24150)', 'toPaise returns 0 for an empty or non-numeric input', 'toPaise rounds a third decimal to the nearest paisa', 'splitBalance reports balanced only when the allocation equals the total to the paisa', 'splitBalance reports the remaining amount when under-allocated', 'splitBalance reports a negative remaining when over-allocated'.
apps/api/src/routes/orders.test.ts: 'settles a pending order in one call (punch and pay) and completes it', 'rejects a settle whose tenders do not sum to the total (400 AMOUNT_MISMATCH)', 'rejects settling an already-paid order (409 ALREADY_PAID)' — the last two exist; add the first.

### Files

- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/orders/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/_components/quick-settle.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx`
- `apps/web/src/lib/tender.ts`
- `apps/web/src/lib/tender.test.ts`
- `apps/api/src/routes/orders.test.ts`

---

<a id="order-edit-panel-web"></a>

## 🔴 `order-edit-panel-web` — Edit-order panel on the order detail page + supplementary KOT

### Approach

Gap 1's UI half, and the thing that makes gaps 7/11/14 actually usable at a counter. The auditor suggests 'reusing the cart from order-builder.tsx'. Verified: that cart is 1166 lines of state living inside OrderBuilder with no exported sub-component, and its CartPanel is coupled to create-time concerns (offline queue, auto-print toggle, session banner). Lifting it wholesale is a bad trade. Extract instead the two genuinely shared pieces and build a purpose-made panel:
  - apps/web/src/app/cafes/[id]/orders/_components/item-pad.tsx — the searchable category-filtered menu pad (order-builder.tsx's visibleCategories rendering), props { categories, onPick(menuItem) }.
  - apps/web/src/app/cafes/[id]/orders/_components/adjustments-fields.tsx — the discount/service/packaging/round-off block (order-builder.tsx:985-1067), props { value, onChange, disabled }.
Both are then used by the builder AND the edit panel, so the two screens cannot drift apart.

NEW apps/web/src/app/cafes/[id]/orders/[orderId]/edit-order-panel.tsx ('use client'), rendered on apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx inside the left column above the Items card, collapsed behind an 'Edit order' button that is only shown when order.status is pending/preparing/ready AND order.paymentStatus is unpaid/failed (mirrors the API guard so the cashier never taps into a 409).
Panel model — it is a PATCH BUILDER, not a cart clone. It holds a Map<orderItemId, newQuantity> of pending changes plus a list of pending additions, and renders the current lines with -/+ steppers, a Void button per line, and struck-through rendering for lines already voided. A live 'Before ₹X -> After ₹Y' strip recomputes locally using the same money maths as the builder (import the shared computeBill; it already mirrors computeBillAdjustments) so the cashier sees the new total before committing. Nothing is sent until 'Apply changes'.
A reason field appears (required, with presets 'Customer changed order' / 'Wrong item punched' / 'Item unavailable') the moment the pending patch reduces the total — matching the server's money-leaving rule exactly, so the 400 REASON_REQUIRED is unreachable from the UI.
Submit sends ONE PATCH .../items carrying every pending line change plus ifUpdatedAt: order.updatedAt (the RSC already has it), then router.refresh(). A 409 STALE_ORDER shows 'This order changed on another terminal — reload and try again' with a reload button.
Adjustments are a second, independent 'Discount & charges' section in the same panel posting to PATCH .../adjustments.

SUPPLEMENTARY KOT — the reason the kitchen tolerates amendments. The PATCH response carries `delta`. On success, if the order has been KOT-printed, open /cafes/{cafeId}/orders/{orderId}?autoprint=kot-amend in a new tab (same popup-blocker-friendly window.open-before-navigate trick the builder uses at :331-341). apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx gains a third mode 'kot-amend' rendering an 80mm slip headed 'KOT — AMENDMENT' with the order number, the time, and only the delta: '+2 × Masala Chai', 'VOID 1 × Masala Dosa', '3 -> 2 × Ginger Tea'. The delta is passed via sessionStorage keyed on the order id (a URL is too small and would leak item names into history). Never reprint the full ticket for a one-line change — that is exactly the waste the audit is about.
The Items card on page.tsx renders voided lines struck through with a muted 'Voided — {reason}' caption, and the header shows an 'Amended ×N' chip when order.amendedCount > 0.

### API

consumes PATCH /cafes/:cafeId/orders/:orderId/items, DELETE /cafes/:cafeId/orders/:orderId/items/:itemId and PATCH /cafes/:cafeId/orders/:orderId/adjustments from order-amend-api

### Web

NEW apps/web/src/app/cafes/[id]/orders/[orderId]/edit-order-panel.tsx; NEW apps/web/src/app/cafes/[id]/orders/_components/item-pad.tsx; NEW apps/web/src/app/cafes/[id]/orders/_components/adjustments-fields.tsx; apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx (fetch the menu via serverFetch for the pad, render the panel, render voided lines + the Amended chip); apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx (kot-amend mode + the autoprint=kot-amend branch); apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx (consume the two extracted components); NEW apps/web/src/lib/order-patch.ts + order-patch.test.ts (pure patch-builder + local re-price preview).

### Tests

apps/web/src/lib/order-patch.test.ts (new): 'builds an empty patch when nothing changed', 'emits a quantity change for an edited line', 'emits quantity 0 for a voided line', 'emits an add entry for a newly picked menu item', 'previews the new total using the existing line snapshot prices, not current menu prices', 'flags reasonRequired when the patch reduces the total', 'does not flag reasonRequired for a pure addition', 'excludes already-voided lines from the before-total', 'the preview total matches the server formula for a percent discount + service charge + round-off (golden case shared with build.test.ts)'.
apps/web/src/lib/kot-delta.test.ts (new): 'renders an addition as "+2 × Masala Chai"', 'renders a void as "VOID 1 × Masala Dosa"', 'renders a quantity change as "3 -> 2 × Ginger Tea"', 'returns no lines for an empty delta so no slip is printed'.

### Files

- `apps/web/src/app/cafes/[id]/orders/[orderId]/edit-order-panel.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/_components/item-pad.tsx`
- `apps/web/src/app/cafes/[id]/orders/_components/adjustments-fields.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/lib/order-patch.ts`
- `apps/web/src/lib/order-patch.test.ts`
- `apps/web/src/lib/kot-delta.ts`
- `apps/web/src/lib/kot-delta.test.ts`

---

<a id="table-session-split-settle"></a>

## 🟠 `table-session-split-settle` — Split-tender + bill-level discount on a table tab, with a real tender ledger

### Approach

Gap 4. Verified both pointers: settleSessionBodySchema at apps/api/src/routes/table-sessions.ts:34-36 takes exactly one paymentMethod, and the repo's settle() at apps/api/src/repositories/table-sessions.ts:352-388 does a blanket UPDATE across every non-cancelled order on the tab, writing NO order_payments rows at all. That second half is a live reporting bug beyond the stated gap: a table settled by cash and one settled by UPI both land only in orders.paymentMethod, which happens to work today only because the tab is single-tender.

API: settleSessionBodySchema becomes { payments?: [{method, amountPaise}] (1..4), paymentMethod?: PaymentMethod (legacy, still accepted), discount?: {type,value,reason?} } with a refine requiring one of payments/paymentMethod. Legacy paymentMethod normalises to payments: [{ method, amountPaise: sessionTotalAfterDiscount }], so the existing sheet keeps working during rollout and there is no breaking change.

Repo settle(id, cafeId, input) inside one transaction:
 1. Lock the session row FOR UPDATE; 409 if already closed.
 2. Load the tab's non-cancelled orders WITH their live (non-void) items.
 3. Apply the session discount, if any. It is applied ON TOP of each order's own discount, so the weight for order i is w_i = subtotalPaise_i - discountPaise_i (its post-own-discount food value). Compute D from type/value against W = Σ w_i, clamp D <= W, then share = apportionPaise(D, weights) from the engine item. REMAINDER RULE: largest-remainder (Hamilton) with ties broken by larger weight, then ascending order id, so Σ shares === D EXACTLY and never a paisa more or less. For each order set discountPaise += share_i (and discount_type/value left as the order's own — the session share is recorded in the audit metadata, not re-derived), then re-run priceLines over that order's live lines with its stored adjustment intent to rewrite taxPaise/roundOffPaise/totalPaise. Reusing priceLines is why order-reprice-engine must land first.
 4. Validate Σ payments.amountPaise === Σ order.totalPaise (post-discount) -> throw AMOUNT_MISMATCH (route maps to 400) before any write commits.
 5. Write the tender ledger. order_payments.orderId is NOT NULL, so a session-level ₹1500 cash tender must be attributed to concrete orders. ALLOCATION RULE — a waterfall, not an apportionment, because it is exact by construction: walk the orders oldest-first (createdAt, then id) keeping a running balance = order.totalPaise; walk the tenders in the order the cashier entered them; each tender fills the current order's remaining balance and spills the excess into the next order. Because step 4 already proved Σ tenders === Σ balances, the walk terminates with every balance at zero and every tender fully consumed, producing at most n+m-1 rows and no remainder. Each row: { cafeId, orderId, kind:'payment', method, amountPaise }.
 6. UPDATE each order: status 'completed', paymentStatus 'paid', paidAt=now, completedAt=now, paymentMethod = payments.length === 1 ? payments[0].method : null. Leaving it null for a true split is what makes the dayEnd split-tender fold-in at repositories/reports.ts:87-105 pick these rows up.
 7. Close the session.
Route writes audit: 'session.settle' { sessionId, tableLabel, payments, orderIds, discountPaise } and 'discount.apply' when D > 0 — a ₹200 knock-off on a table is exactly the entry the owner needs.

Web: apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx currently offers three single-method buttons (:109-130). Replace with the shared tender editor extracted from order-actions.tsx:311-441 into apps/web/src/app/cafes/[id]/_components/tender-picker.tsx (single/split toggle, up-to-4 rows, live balance strip, MethodPicker) used by BOTH screens — killing the duplication the auditor flagged. Add a 'Discount' row above the totals block (%/₹ toggle + reason, reusing adjustments-fields' discount sub-component) that previews the new tab total live.

### Schema

none (uses discount/adjustment-intent columns from 0013 and completed_at from 0014)

### API

POST /cafes/:cafeId/table-sessions/:sessionId/settle
  body { payments?: Array<{method:'cash'|'upi'|'card'|'online', amountPaise: int>=1}> (1..4),
         paymentMethod?: 'cash'|'upi'|'card'|'online',   // legacy single-tender, still accepted
         discount?: { type:'percent'|'flat', value: number>=0, reason?: string<=120 } }
  refine: at least one of payments / paymentMethod
  200 { session: TableSessionDetail }
  400 { error:{code:'AMOUNT_MISMATCH', message:'Tendered ₹X must equal the tab total ₹Y'} } | 400 DISCOUNT_TOO_HIGH
  404 NOT_FOUND (cafe or session) ; 409 { error:{code:'SESSION_CLOSED'} } ; 401 unauthenticated
packages/types/src/api.ts: SettleTableSessionRequest gains payments and discount.

### Web

apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx (tender picker + discount row + the settle payload); NEW apps/web/src/app/cafes/[id]/_components/tender-picker.tsx (extracted from order-actions.tsx); apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx (consume the extracted picker).

### Tests

apps/api/src/routes/table-sessions.test.ts: 'settles a tab with two tenders', 'still accepts the legacy paymentMethod body', 'rejects tenders that do not sum to the tab total (400 AMOUNT_MISMATCH)', 'applies a session discount and settles the reduced total', 'rejects a discount larger than the tab value (400 DISCOUNT_TOO_HIGH)', '409 for an already-closed session', '404 for a session on another owner\'s cafe', 'records session.settle and discount.apply audit entries'.
apps/api/src/repositories/table-sessions.repo.test.ts: 'apportions a session discount across three orders so the shares sum to the discount exactly', 'gives the remainder paisa deterministically when the split does not divide evenly', 'excludes cancelled orders from the discount weights', 'writes one order_payments row per (order, tender) segment of the waterfall', 'the waterfall spills a tender across two orders when it exceeds the first balance', 'the sum of order_payments equals the sum of order totals', 'sets paymentMethod for a single tender and null for a split', 'leaves cancelled orders untouched'.

### Files

- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/table-sessions.repo.test.ts`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/_components/tender-picker.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx`
- `packages/types/src/api.ts`

---

<a id="diner-self-cancel"></a>

## 🟠 `diner-self-cancel` — Diner grace-window cancel on the QR order

### Approach

Gap 9. New route beside apps/api/src/routes/public.ts:164. The security model is the one already in use for GET /public/cafes/:slug/orders/:orderId: the order id is an unguessable uuid the diner's own device holds, so no session is needed.

Guards, all of them required:
  - cafe resolves by slug (404 NOT_FOUND)
  - order belongs to that cafe (404)
  - order.source === 'qr' — a diner must never be able to cancel a counter order even with its id (404, not 403, so the endpoint leaks nothing)
  - order.status === 'pending' — once the kitchen starts, it is a staff decision (409 TOO_LATE)
  - order.paymentStatus is 'unpaid' or 'failed' — a paid or payment-pending order needs a refund, not a cancel (409 ALREADY_PAID)
  - Date.now() - Date.parse(order.createdAt) <= DINER_CANCEL_GRACE_MS, exported as 90_000 from a new apps/api/src/orders/grace.ts so it is tunable and testable (409 CANCEL_WINDOW_CLOSED, message 'Ask a staff member to cancel this order')
Idempotent: an already-cancelled order returns 200 with the cancelled order rather than an error, so a double-tap on a flaky 3G connection does not show a scary failure.
Audit: publicRoutes has no audit repository today — PublicRoutesOptions (public.ts:15-19) gains auditRepository?: AuditLogsRepository, defaulted to createDrizzleAuditLogsRepo(app.db). Record { action:'order.void', actorType:'system', actorId:null, actorName:'Diner (QR)', metadata:{ channel:'qr', reason, secondsSincePlaced, totalPaise } }. That is the entry that lets an owner tell a diner-cancelled ticket from a staff void.
The cancel goes through ordersRepo.updateStatus(id, cafeId, 'cancelled', undefined, reason) so cancelled_at and cancel_reason are stamped by the same code path as the counter.

PublicOrder (packages/types/src/api.ts:274-282) gains createdAt: string so the client can run the countdown across a page refresh — additive and diner-safe (PublicOrderDetail already exposes createdAt).

Web: apps/web/src/app/m/[slug]/diner-order.tsx confirmation screen (the actions block at :930-967) gains a 'Cancel this order' text button under the primary actions, shown only while kind is 'counter' or 'choose' and canDinerCancel() is true, with a live 'You can cancel for another 0:47' countdown that removes the button when it expires. Confirmation is a single inline 'Yes, cancel' — no modal; a diner who just realised their mistake should not fight a dialog. On success it flips the screen to a 'Cancelled' state and calls updateDinerOrder(slug, id, {status:'cancelled'}).
apps/web/src/app/m/[slug]/ai-widget.tsx OrdersView (:425-480) gains the same control per card, driven by the same helper.
The window logic goes in apps/web/src/lib/diner-orders.ts as `canDinerCancel(record: {status, paymentStatus, placedAt}, nowMs: number): boolean` and `cancelSecondsLeft(placedAt, nowMs): number`, with DINER_CANCEL_GRACE_MS mirrored as a client constant — web tests live under src/lib, so this is where the coverage goes.

### API

POST /public/cafes/:slug/orders/:orderId/cancel   (unauthenticated)
  body { reason?: string<=200 }
  200 { order: PublicOrder }   (also 200 + the cancelled order when it was already cancelled — idempotent)
  404 { error:{code:'NOT_FOUND'} }  — unknown slug, unknown order, or a non-QR order
  409 { error:{code:'TOO_LATE', message:'This order is already being prepared — ask a staff member'} }
  409 { error:{code:'ALREADY_PAID', message:'This order is paid — ask a staff member for a refund'} }
  409 { error:{code:'CANCEL_WINDOW_CLOSED', message:'Ask a staff member to cancel this order'} }
packages/types/src/api.ts: PublicOrder gains createdAt: string; new CancelPublicOrderRequest { reason?: string }.

### Web

apps/web/src/app/m/[slug]/diner-order.tsx (cancel button + countdown + cancelled state on the confirmation screen); apps/web/src/app/m/[slug]/ai-widget.tsx (cancel control in OrdersView); apps/web/src/lib/diner-orders.ts (canDinerCancel, cancelSecondsLeft, DINER_CANCEL_GRACE_MS).

### Tests

apps/api/src/routes/public.test.ts: 'cancels a pending QR order inside the grace window', 'is idempotent — cancelling an already-cancelled order returns 200', 'rejects a cancel after the grace window (409 CANCEL_WINDOW_CLOSED)', 'rejects a cancel once the order is preparing (409 TOO_LATE)', 'rejects a cancel on a paid order (409 ALREADY_PAID)', 'refuses to cancel a counter order and 404s rather than leaking its existence', '404s for an order belonging to another cafe', 'records an order.void audit entry with actorName "Diner (QR)" and channel qr', 'does not require authentication'.
apps/web/src/lib/diner-orders.test.ts (new file): 'canDinerCancel is true for a pending unpaid order placed 30s ago', 'canDinerCancel is false after 91 seconds', 'canDinerCancel is false once the status is preparing', 'canDinerCancel is false when the order is paid', 'cancelSecondsLeft counts down and floors at 0'.

### Files

- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/orders/grace.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/app/m/[slug]/ai-widget.tsx`
- `apps/web/src/lib/diner-orders.ts`
- `apps/web/src/lib/diner-orders.test.ts`
- `packages/types/src/api.ts`

---

<a id="day-end-money-model"></a>

## 🔴 `day-end-money-model` — Day-end figures that foot: real net sales, discount/charge lines, bill-number range

### Approach

Gaps 10 (numbers half) and 13. Verified: apps/api/src/repositories/reports.ts:50 is `net: sum(schema.orders.subtotalPaise)` and apps/api/src/orders/build.ts:41-42 documents subtotalPaise as the line subtotal BEFORE any discount. So on a day with discounts the 'Net sales' tile can exceed the 'Gross sales' tile beside it, and the CA reads it as post-discount revenue.

1. Extend the first aggregate in dayEnd() (:47-55) with sum(discountPaise), sum(serviceChargePaise), sum(packagingChargePaise), sum(roundOffPaise). All are integers; do the arithmetic in JS over Number(...) of the sums — no float, no SQL expression.
2. Recompute:
     subtotalPaise      = Σ orders.subtotalPaise                       (NEW field, carries the old netSales meaning)
     taxableValuePaise  = subtotal - discount + service + packaging    (NEW)
     netSalesPaise      = taxableValuePaise                            (SAME NAME, CHANGED MEANING — post-discount, pre-tax)
     grossSalesPaise    = Σ orders.totalPaise                          (unchanged)
   Assert the identity in a test: gross === net + tax + roundOff, and net === subtotal - discount + service + packaging. Any day where these do not foot is a bug, and the test is the contract.
   THE FIELD-MEANING CHANGE IS A BREAKING SEMANTIC CHANGE for netSalesPaise. Consumers: only apps/web/src/app/cafes/[id]/reports/reports-view.tsx tile (:173-175) and CSV row (:406-408), both updated here. Flag it in the DayEndReport doc comment (packages/types/src/reports.ts:24-28, which currently says 'No discount data exists yet, so it is omitted' — that comment must go).
3. Bill-number range. A separate query over `inDay` (INCLUDING cancelled orders — a voided invoice still consumed a serial, and proving the series is intact is the whole point): select min(order_number), max(order_number), count(*). order_number is INV/{fy}/{6-digit zero-padded} (build.ts:209-211) so lexical min/max equals numeric min/max within one financial year, and a single IST business day never straddles the Apr-1 FY boundary — note that in a comment.
4. Add amendedCount = count of in-day orders with amended_count > 0. It is the number an owner wants sitting next to the void count.
5. FIX THE DASHBOARD REVENUE MODEL, which kitchen-close-and-recall-ui would otherwise break. apps/api/src/repositories/orders.ts todayStats (:395-460) keys revenue and the payment breakdown off status='completed'. Once the kitchen can bump a ticket to Served, an UNPAID order counts as revenue. Change `completedToday` to key off paymentStatus in ('paid','refunded') AND createdAt >= todayStart, and fold order_payments into paymentBreakdownPaise the way dayEnd already does at reports.ts:87-125 — today a split-settled order has a null paymentMethod and vanishes from the dashboard breakdown entirely, which is a live bug independent of this theme.
6. Aggregate queries must exclude voided lines: reports.ts sales() item branch (:170-180) and category branch (:196-210) gain `eq(schema.orderItems.isVoid, false)` (also done in order-reprice-engine — verify it landed).

### Schema

none of its own — reads amended_count from 0013.

### API

GET /cafes/:cafeId/reports/day-end?date=YYYY-MM-DD — path, query and status codes unchanged. The DayEndReport payload gains:
  subtotalPaise: number
  discountPaise: number
  serviceChargePaise: number
  packagingChargePaise: number
  roundOffPaise: number
  taxableValuePaise: number
  firstBillNumber: string | null
  lastBillNumber: string | null
  billCount: number
  amendedCount: number
and netSalesPaise CHANGES MEANING from Σ subtotalPaise to subtotal - discount + service + packaging.
GET /cafes/:cafeId/orders/stats — shape unchanged; todayRevenuePaise and paymentBreakdownPaise now key off paymentStatus and include split tenders.

### Web

apps/web/src/app/cafes/[id]/reports/reports-view.tsx — the four Metric tiles (:172-180) become Gross sales / Net sales (post-discount) / Discounts / Tax, with the Orders tile moving into a second row alongside Voids and Amendments; add a 'Bill range' line under the date control showing firstBillNumber -> lastBillNumber (N bills). CSV rows (:400-412) get Subtotal, Discount, Service charge, Packaging, Taxable value, Net sales, Tax, Round off, Gross sales, First bill, Last bill, Amended — in exactly the reconciliation order so a CA can tick down the column.

### Tests

apps/api/src/repositories/reports.dayend.test.ts (new): 'net sales is subtotal minus discount plus charges, not the raw subtotal', 'gross equals net plus tax plus round-off for a day with a discount (identity test)', 'gross equals net plus tax for a day with no adjustments (regression)', 'reports a zero discount total for a day with no discounts', 'includes cancelled orders in the bill-number range but not in revenue', 'returns null bill numbers for a day with no orders', 'counts orders with amended_count > 0 as amendedCount', 'excludes voided order_items from the item sales breakdown'.
apps/api/src/routes/reports.test.ts: 'returns the extended Z-report fields', 'still defaults to today when no date is given'.
apps/api/src/repositories/orders.stats.test.ts (new): 'counts an unpaid completed order out of today revenue', 'counts a paid order in today revenue regardless of status', 'includes split-tender order_payments in the payment breakdown', 'a refunded order still appears in the breakdown at its tendered amount'.

### Files

- `apps/api/src/repositories/reports.ts`
- `apps/api/src/repositories/reports.dayend.test.ts`
- `apps/api/src/routes/reports.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.stats.test.ts`
- `packages/types/src/reports.ts`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`

---

<a id="z-report-print"></a>

## 🔴 `z-report-print` — Printable 80mm Z-report with drawer reconciliation

### Approach

Gap 10's output half. There is no print view at all today — only the CSV download at reports-view.tsx:84-96, which is useless on a counter terminal wired to a thermal printer with no spreadsheet app.

NEW apps/web/src/app/cafes/[id]/reports/z-report-print.tsx ('use client'), mounted from reports-view.tsx next to the Download button, mirroring the proven thermal pattern at apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:125-131 exactly:
  <style>{`@page { size: 80mm auto; margin: 0; } @media print { html, body { margin:0; background:#fff; } }`}</style>
  plus a `fixed inset-0 z-[999] hidden bg-white text-black print:block` container holding an 80mm mono slip, so the rest of the app never prints.

Slip layout, in strict reconciliation order (this order IS the product — an owner reads down the column and the arithmetic must visibly close):
  cafe.name / address / GSTIN / FSSAI
  Z-REPORT — {date} (IST)  ·  printed {timestamp}
  Bills: INV/2026-27/000101 -> INV/2026-27/000148  (48 bills)
  ---
  Subtotal                 12,480.00
  Less discount            −  640.00
  Service charge           +  120.00
  Packaging                +   40.00
  = Taxable value          12,000.00
  GST @5%                  +  600.00
  Round off                −    0.40
  = GROSS SALES            12,599.60
  ---
  Cash / UPI / Card / Online (count + amount, CASH visually emphasised)
  ---
  Counter / QR / Phone breakdown
  ---
  Voids: 6 (₹1,240)   Amendments: 11
  ---
  Cash reconciliation (rendered only when a drawer session exists):
    Opening float / + Cash sales / = Expected in drawer / Counted / Variance
  ---
  Signature lines: Cashier ______  Owner ______

Drawer numbers come from GET /cafes/:cafeId/cash-drawer/current (verified to exist at apps/api/src/routes/cash-drawer.ts:40-51, returning { session } or { session: null }). The block renders only when a session is returned; the report prints correctly without it. No API change.

Extract the whole slip body as a pure function `buildZReportLines(report: DayEndReport, cafe: Cafe, drawer: CashDrawerSession | null): ZLine[]` where ZLine is { label: string; paise?: number; kind: 'row'|'total'|'rule'|'heading'; sign?: '+'|'-' } into NEW apps/web/src/lib/z-report.ts. The CSV builder in reports-view.tsx:400-412 is then rewritten to consume the SAME ZLine[] so the printed slip and the downloaded CSV can never disagree — that divergence is exactly how a day-end stops being trustworthy. Money formatting reuses the existing rupeesPlain/formatRupees helpers; every value stays integer paise until the final render.

### API

none — reads GET /cafes/:cafeId/reports/day-end (extended in day-end-money-model) and GET /cafes/:cafeId/cash-drawer/current (existing)

### Web

NEW apps/web/src/app/cafes/[id]/reports/z-report-print.tsx; NEW apps/web/src/lib/z-report.ts + z-report.test.ts; apps/web/src/app/cafes/[id]/reports/reports-view.tsx (Print Z-report button beside Download CSV, fetch the drawer session alongside the day-end in the existing Promise.all at :62-70, CSV rebuilt from buildZReportLines).

### Tests

apps/web/src/lib/z-report.test.ts (new): 'the money block reconciles — subtotal minus discount plus charges equals taxable value', 'taxable value plus tax plus round-off equals gross sales', 'omits the discount line when the day had no discounts', 'renders a negative round-off with a minus sign', 'renders the bill range as first -> last with the count', 'renders "No bills" when firstBillNumber is null', 'omits the cash reconciliation block when no drawer session is passed', 'computes drawer variance as counted minus (float + cash sales)', 'shows a negative variance for a short drawer', 'the CSV built from the same lines carries every printed row in the same order'.

### Files

- `apps/web/src/app/cafes/[id]/reports/z-report-print.tsx`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`
- `apps/web/src/lib/z-report.ts`
- `apps/web/src/lib/z-report.test.ts`

---

<a id="staff-actor-attribution"></a>

## 🟠 `staff-actor-attribution` — Who did it: staff PIN login and createdBy/voidedBy on the order

### Approach

The unfinished half of gaps 3 and 12. Every audit entry this theme writes currently names request.user.id — the owner's Supabase id — because staff have no login. An owner reviewing six voids sees six entries attributed to themselves, which is worse than useless: it launders the trail. Verified the raw materials exist and nothing is wired: packages/db/src/schema/staff.ts:24 stores pinHash, apps/api/src/lib/pin.ts has hashPin + verifyPin with a constant-time compare, apps/api/src/routes/staff.ts has GET/POST/PATCH/DELETE but no login route, and grep shows verifyPin has ZERO callers anywhere in the repo.

1. POST /cafes/:cafeId/staff/login — body { staffId, pin }. Looks up the active staff row for that cafe, verifyPin against pinHash, and on success returns a SHORT-LIVED shift token: app.jwt.sign({ sub: <ownerId>, staffId, cafeId, kind:'staff-shift' }, { expiresIn: '12h' }). It is scoped to the same owner subject so no existing authorisation changes — it is an ATTRIBUTION token, not a new authorisation tier. Rate-limit to 5 attempts per staffId per 15 minutes (in-memory via apps/api/src/lib/cache.ts, keyed cacheKey('pin', cafeId, staffId)), returning 429 TOO_MANY_ATTEMPTS. A 4-digit PIN with unlimited attempts is not a control.
2. apps/api/src/plugins/auth.ts decorates request.actor = { type: 'staff', id: staffId, name } when the token carries staffId, else { type: 'owner', id: user.id, name: null }. Every auditRepo.record call site in this theme (orders.ts create/status/amend/adjust/item-void/refund/bill-printed, table-sessions settle) switches from the hard-coded actorType:'owner', actorId: request.user.id to spreading request.actor — a mechanical change, and the one that makes the audit log actually name a person.
3. orders gains created_by_staff_id and voided_by_staff_id (nullable uuid, no FK to staff so a deleted staff row does not orphan history — same soft-reference convention as order_items.menuItemId, see schema/orders.ts:111-113). create() and updateStatus() stamp them from request.actor.
4. Web: a shift picker in the cafe shell — apps/web/src/app/cafes/[id]/components/cafe-shell.tsx gains an 'On shift: {name}' chip that opens a staff list + numeric PIN pad, storing the shift token in sessionStorage (not localStorage — a shift must not survive a closed browser) and attaching it in place of the Supabase token for order mutations. The order detail page shows 'Punched by {name}' and 'Voided by {name}'; the audit view shows actorName.

HONEST SCOPE NOTE: this is the largest single item in the theme and the only one that touches the auth plugin. It can ship AFTER everything else — the rest of the theme works with owner attribution, it is just less useful. Do not fold it into void-reason-and-audit; a half-done PIN login is worse than none.

### Schema

Migration 0015 (additive).
ALTER TABLE orders
  ADD COLUMN created_by_staff_id uuid,
  ADD COLUMN voided_by_staff_id uuid;
CREATE INDEX orders_cafe_created_by_idx ON orders (cafe_id, created_by_staff_id);
No FK to staff (soft reference, matching order_items.menu_item_id). No backfill — historic orders keep NULL, which honestly means 'unattributed'.
packages/db/src/schema/orders.ts + packages/types/src/domain.ts Order: createdByStaffId: string|null, voidedByStaffId: string|null.

### API

POST /cafes/:cafeId/staff/login   (authenticated as the owner — the terminal is already signed in)
  body { staffId: uuid, pin: string 4..8 digits }
  200 { token: string, staff: { id, name, role }, expiresInSeconds: 43200 }
  401 { error:{code:'INVALID_PIN'} }      — same body for a wrong PIN and an unknown/inactive staff id, so the endpoint does not enumerate staff
  404 { error:{code:'NOT_FOUND'} }        — cafe not owned by the caller
  429 { error:{code:'TOO_MANY_ATTEMPTS'} }
packages/types/src/staff.ts: StaffLoginRequest, StaffLoginResponse.
No other endpoint changes shape; audit entries simply start carrying actorType 'staff' with a real actorId/actorName.

### Web

apps/web/src/app/cafes/[id]/components/cafe-shell.tsx (on-shift chip + PIN pad sheet, sessionStorage shift token); NEW apps/web/src/app/cafes/[id]/_components/shift-pad.tsx; NEW apps/web/src/lib/shift.ts + shift.test.ts (token store + attach helper); apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx ('Punched by' / 'Voided by' rows in the Details card); apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx (show actorName).

### Tests

apps/api/src/routes/staff.test.ts: 'issues a shift token for a correct PIN', 'rejects a wrong PIN with 401 INVALID_PIN', 'returns the same 401 body for an unknown staff id (no enumeration)', 'rejects an inactive staff member', 'rejects a staff member from another cafe with 404', 'locks out after 5 failed attempts with 429', 'the issued token carries staffId and cafeId and expires in 12h'.
apps/api/src/plugins/auth.test.ts: 'request.actor is owner for a plain Supabase token', 'request.actor is staff with id and name for a shift token', 'a shift token for a different cafe is rejected on that cafe\'s routes'.
apps/api/src/routes/orders.test.ts: 'stamps created_by_staff_id from the shift token on create', 'stamps voided_by_staff_id on a cancel', 'the order.void audit entry names the staff member, not the owner'.
apps/web/src/lib/shift.test.ts (new): 'stores and reads a shift token per cafe', 'returns null for an expired token', 'clears the token on sign-out'.

### Files

- `apps/api/src/routes/staff.ts`
- `apps/api/src/routes/staff.test.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/plugins/auth.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/lib/cache.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0015_*.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`
- `packages/types/src/staff.ts`
- `apps/web/src/app/cafes/[id]/components/cafe-shell.tsx`
- `apps/web/src/app/cafes/[id]/_components/shift-pad.tsx`
- `apps/web/src/lib/shift.ts`
- `apps/web/src/lib/shift.test.ts`

---

## Order of work

1. 1. order-reprice-engine — migration 0013 plus the pure functions and the amend() transaction. Nothing else in the theme can land first: order-amend-api, order-edit-panel-web and table-session-split-settle all re-price through priceLines, and the soft-void predicate has to reach every aggregate query in the same PR or the item reports quietly double-count.
2. 2. order-lifecycle-timestamps — migration 0014, the widened transition table and the paidAt-on-methodless-completion fix. Small, self-contained, and it unblocks both the kitchen UI and punch-and-pay. Ship before any UI that can reach the new transitions.
3. 3. void-reason-and-audit — the required cancel reason, the audit taxonomy and the create-time discount.apply. It is a BREAKING change to PATCH .../status, so the API change and the order-actions.tsx reason dialog must deploy together.
4. 4. order-amend-api — the three amendment routes on top of steps 1 and 3. Ship API-only and verify with the route tests before any UI depends on it.
5. 5. day-end-money-model — the net-sales fix, the extra Z-report fields, and the todayStats revenue/paymentStatus correction. MUST land before kitchen-close-and-recall-ui, or a kitchen Served bump inflates the day's revenue for unpaid orders.
6. 6. kitchen-close-and-recall-ui and punch-and-pay-ui in parallel — both are pure web work on transitions already open, and together they remove the five-tap takeaway.
7. 7. order-edit-panel-web — the biggest web item. It extracts item-pad and adjustments-fields out of order-builder.tsx, so land it after punch-and-pay-ui has finished editing that file to avoid a painful merge.
8. 8. table-session-split-settle — needs priceLines and apportionPaise from step 1, and it extracts tender-picker.tsx out of order-actions.tsx, which void-reason-and-audit also edits. Sequence it after step 3.
9. 9. z-report-print — needs the extended DayEndReport from step 5. Verify on a real 80mm thermal printer, not just print preview; the @page rule behaves differently on driver-fed printers.
10. 10. diner-self-cancel — independent of everything except the cancelled_at/cancel_reason columns from step 2. Can be picked up by a second engineer at any point after step 2.
11. 11. staff-actor-attribution — last. Every audit entry the theme writes says 'owner' until this lands, which is honest but weak; it is the only item that touches the auth plugin and should not be rushed alongside the money work.

## Risks

- Soft line voids are the sharpest edge in this plan. A voided order_items row keeps its quantity and lineTotalPaise (deliberately, so the audit shows what was pulled and for how much), which means EVERY aggregate must carry an explicit `is_void = false` predicate. Six call sites must change together: orders repo topItemsToday (:469-480) and itemSalesToday (:494-507), reports repo sales() item (:170-180) and category (:196-210) branches, and table-sessions repo ordersForSession (:80-86) and history() (:270-276). Miss one and the day's item sales silently over-report, which is the exact class of bug this theme exists to fix.
- Requiring a cancel reason is a breaking change to PATCH /cafes/:cafeId/orders/:orderId/status. The only in-repo caller is order-actions.tsx:494 and it is updated here, but any external terminal, script or saved Postman flow calling it starts getting 400s. Deploy the API and the web reason dialog together, or accept the reason as optional for one release with a deprecation log line first.
- netSalesPaise changes meaning rather than being renamed. Anything outside this repo reading the day-end payload — an accountant's export, a spreadsheet macro, a screenshot in a training doc — now sees a smaller number for the same day. The alternative (a new field name plus a deprecation window) is safer but leaves the wrong number on the tile for another release; the tile is the one the owner and the CA actually read, so the change is worth the break. Announce it.
- The migration 0013 backfill sets round_off_enabled = (round_off_paise <> 0). An order created with round-off on whose pre-round total already landed on a whole rupee has round_off_paise = 0 and will not re-round when amended. Harmless (the total simply is not re-rounded) but it will look like an inconsistency to whoever finds it.
- service_charge_bp is deliberately not back-derived from service_charge_paise, so amending a legacy order carries its service charge forward as a flat amount instead of recomputing the percentage. On a legacy order where the cashier then adds ₹400 of food, the service charge stays at the old rupee value. Documented as the fallback, but it will generate at least one support question.
- Concurrency on amendment is handled with SELECT FOR UPDATE plus an optional ifUpdatedAt optimistic check. If the web panel forgets to send ifUpdatedAt, two terminals amending the same tab produce a last-write-wins on the adjustment intent (the line patch itself is id-addressed and commutative, so items survive). The panel must always send it; add it to the code-review checklist.
- The table-session tender waterfall attributes a session-level tender to concrete orders oldest-first. It is exact by construction, but it means a ₹1500 cash tender on a 3-order tab can show as ₹800 cash on order 1 and ₹700 cash on order 2 in that order's tender ledger. That is correct for the day-end payment breakdown and confusing on a single order's detail page — the per-order view should label these rows 'part of a table settlement'.
- A kitchen 'Served' bump completes an order that may still be unpaid. day-end-money-model repoints revenue at paymentStatus to keep the money right, but the order LIST and the status pill will now routinely show 'Completed · Unpaid', which reads as a bug to a cashier. The orders list needs the QuickSettle affordance from punch-and-pay-ui shipped at the same time so that state is actionable rather than alarming.
- The diner cancel endpoint is unauthenticated and takes an order id. The uuid is unguessable and the route 404s (never 403s) for non-QR orders, so it leaks nothing — but it is the first public route in the app that MUTATES an order. It needs the same abuse review as the payment routes, and ideally a per-IP rate limit at the edge; the in-handler grace window is a business rule, not a rate limit.
- Per-line GST is still not modelled — one gstRateBp per order, one bill-level discount, no per-HSN taxable-value split. The Z-report will foot as a whole but cannot yet produce the HSN-wise summary a GSTR-1 filing wants. The apportionPaise helper is built here specifically so that work has an exact, tested splitter waiting for it, but it is out of scope and the Z-report should not claim to be a GST return.
- Effort is dominated by two items — the amendment engine and the edit panel — that both touch money. Neither should be compressed. If the programme needs a cut, drop staff-actor-attribution (the theme still works with owner attribution) rather than trimming the engine's test matrix.
