# Offline resilience & idempotency

**Estimated effort: 9 engineer-days · 5 work items**

Today an outage silently breaks the counter twice over: the cashier gets "Saved offline" but no paper leaves the machine (no KOT to the kitchen, no total for the customer), and when the link returns the replay can create a second order with a second gapless invoice serial, because the queue's idempotency key is generated locally and never transmitted. This theme sends a key on the FIRST attempt (not just on replay — that distinction is the whole fix), makes POST /cafes/:cafeId/orders collapse duplicates on a unique (cafe_id, idempotency_key) index, and gives the offline order real paper: an OFF- kitchen ticket and a clearly-marked PROVISIONAL estimate rendered from a printable snapshot frozen into the queue item. It then closes the loop — a pending/blocked/synced drawer that shows the real invoice number after sync and shouts if the synced total differs from the estimate already handed to the customer. Net effect for a cafe: an outage costs you nothing but a slower bill, instead of a missing kitchen ticket and double-counted revenue.

---

<a id="server-idempotent-order-create"></a>

## 🔴 `server-idempotent-order-create` — Server-side idempotent order creation (unique key per cafe, replay returns the same order)

### Approach

VERIFIED the auditor's pointer: apps/api/src/routes/orders.ts:122-177 is indeed the POST handler and it has no dedupe — it calls ordersRepo.create() unconditionally, and create() (apps/api/src/repositories/orders.ts:108-175) burns an invoice serial via the INSERT ... ON CONFLICT DO UPDATE SET last_seq = last_seq + 1 upsert on invoice_sequences inside its transaction. Two replays therefore produce two serials and double revenue in todayStats.

Design: store the key ON the order row, not in a side table. A separate reservation table would need cleanup and could orphan rows; the column keeps the key as a permanent audit fact on the invoice and — critically — lets a losing race abort the whole transaction, which rolls back the last_seq UPDATE too (it is a row update, not nextval), so no serial is consumed and CGST Rule 46(b) gaplessness survives the new retry path. Use a PLAIN uniqueIndex on (cafe_id, idempotency_key), not a partial one: Postgres treats NULLs as distinct in a unique index, so keyless orders are unaffected and drizzle-kit needs no hand-edited WHERE clause.

Route flow: read `request.headers['idempotency-key']` (Fastify lowercases), validate with z.string().trim().min(8).max(200); compute a canonical SHA-256 of the parsed body in a new apps/api/src/orders/idempotency.ts (`canonicalHash(body)` = createHash('sha256').update(JSON.stringify(sortKeysDeep(body))).digest('hex'); object keys sorted recursively, ARRAY ORDER PRESERVED — the queue payload is byte-stable once enqueued so a reorder cannot legitimately occur, and treating a reorder as reuse is the safe direction). Pass key + hash + offlineRef into NewOrder. Map the repo outcome to status: created→201, replayed→200 (+ header `idempotent-replay: true`), key_reused→409.

Repo: create() gains a fast path (findByIdempotencyKey before opening the transaction) plus a slow path (catch a 23505 whose constraint is orders_cafe_idempotency_key_idx, re-read the winner, return replayed/key_reused; rethrow 23505 on any other constraint, e.g. orders_cafe_order_number_idx, so a genuine serial collision is not swallowed).

Audit: when the body carries `offlineRef` AND `clientCreatedAt`, write an `order.created_offline` entry via auditRepo.record with metadata { offlineRef, clientCreatedAt, syncedAt }. This is the artefact a GST auditor needs when an invoice is serialised at 19:40 for an order taken at 18:05. Do NOT write it on a replay (outcome !== 'created').

### Schema

Migration 0013 (additive, nullable, no backfill), in packages/db/src/schema/orders.ts `orders`:
  idempotencyKey: text()                 -> "idempotency_key" text NULL
  idempotencyRequestHash: text()         -> "idempotency_request_hash" text NULL  (sha256 hex, 64 chars; internal, used only to detect key reuse)
  offlineRef: text()                     -> "offline_ref" text NULL  (e.g. 'OFF-K7Q-0007', the number printed on the offline kitchen ticket)
  uniqueIndex('orders_cafe_idempotency_key_idx').on(table.cafeId, table.idempotencyKey)

SQL emitted:
  ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;
  ALTER TABLE "orders" ADD COLUMN "idempotency_request_hash" text;
  ALTER TABLE "orders" ADD COLUMN "offline_ref" text;
  CREATE UNIQUE INDEX "orders_cafe_idempotency_key_idx" ON "orders" ("cafe_id","idempotency_key");

OPERATIONAL NOTE: drizzle's migrator runs statements inside a transaction, so CREATE UNIQUE INDEX CONCURRENTLY cannot be used there. At current table sizes the plain index build's brief ACCESS EXCLUSIVE lock is acceptable; if any cafe's orders table is already large, run the CONCURRENTLY variant by hand ahead of the deploy and let the migration's CREATE INDEX be a no-op via IF NOT EXISTS (hand-edit the generated SQL).

### API

MODIFIED — POST /cafes/:cafeId/orders (auth required)
  Request headers: `Idempotency-Key: <8..200 chars>` (optional; opaque)
  Request body: unchanged, plus two optional fields
    offlineRef?: string      // max 24, /^[A-Z0-9-]+$/
    clientCreatedAt?: string // ISO 8601, when the cashier actually took the order
  Responses:
    201 { order: OrderWithItems }                       — created (unchanged shape)
    200 { order: OrderWithItems } + header `idempotent-replay: true`
                                                        — same (cafe, key), same body hash; NO new order, NO new serial
    409 { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'This idempotency key was already used for a different order' } }
    400 { error: { code: 'VALIDATION_ERROR', ... } }     — key shorter than 8 / longer than 200 chars, bad offlineRef charset
    400 { error: { code: 'INVALID_ITEM' | 'ITEM_UNAVAILABLE', ... } }  — unchanged
    404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }    — unchanged (never 403)
  No key sent => behaviour is byte-identical to today (201, always a new order).

### Web

none (client work is in `client-idempotency-key-header`)

### Tests

apps/api/src/orders/idempotency.test.ts (new):
  - 'canonicalHash: two bodies with the same fields in a different key order hash identically'
  - 'canonicalHash: changing a line quantity changes the digest'
  - 'canonicalHash: reordering the items array changes the digest (documented: array order is significant)'

apps/api/src/repositories/orders.repo.test.ts (new, stubbed Database in the house style of table-sessions.repo.test.ts):
  - 'create() returns outcome "created" and writes idempotency_key + request hash on the order row'
  - 'create() short-circuits to outcome "replayed" when the key already exists with the same hash, without opening a transaction (no serial consumed)'
  - 'create() returns outcome "key_reused" when a stored order has the same key but a different hash'
  - 'create() converts a 23505 on orders_cafe_idempotency_key_idx into outcome "replayed" by re-reading the winning row'
  - 'create() rethrows a 23505 raised on orders_cafe_order_number_idx'
  - 'create() with a null idempotencyKey never queries by key and always inserts'

apps/api/src/routes/orders.test.ts (extend):
  - 'POST /orders forwards the Idempotency-Key header and its body hash to the repository'
  - 'POST /orders returns 200 with the SAME order and no second create() call when the key is replayed'
  - 'POST /orders sets the idempotent-replay response header on a replay'
  - 'POST /orders returns 409 IDEMPOTENCY_KEY_REUSED when the stored hash differs'
  - 'POST /orders with no Idempotency-Key creates a new order on every call (back-compat)'
  - 'POST /orders returns 400 VALIDATION_ERROR for a 4-character Idempotency-Key'
  - 'POST /orders records an order.created_offline audit entry when offlineRef and clientCreatedAt are present'
  - 'POST /orders does NOT record an offline audit entry when the request is a replay'
  - 'POST /orders returns 400 for an offlineRef containing lowercase or spaces'
  - 'POST /orders still 404s (not 403) for another owner\'s cafe when a key is supplied'

MANUAL (no real-DB test harness exists in this repo): two concurrent `curl` POSTs with the same Idempotency-Key against a live Postgres must yield one order, one serial, and invoice_sequences.last_seq incremented exactly once.

### Files

- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0013_<generated>.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/api/src/orders/idempotency.ts`
- `apps/api/src/orders/idempotency.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.repo.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`

---

<a id="client-idempotency-key-header"></a>

## 🔴 `client-idempotency-key-header` — Send the idempotency key on the FIRST attempt, not only on replay

### Approach

The auditor's pointer is right about the mechanism and WRONG about the timing, and the timing is the entire bug. Sending the queue item's id only from the sender (order-builder.tsx, sender is at :193-203 today — the audit's :180-190 has drifted by ~13 lines) does not fix the common double-order: the cashier taps Place order, the POST REACHES the server and the order is created, the response is lost on a flaky link, authedFetch (:68-92, defined locally in order-builder.tsx — NOT in apps/web/src/lib/api.ts as the pointer implies) throws NetworkError, handleSubmit enqueues, and the later replay carries a key the server has never seen. Two orders, two serials.

Fix: mint the key once in handleSubmit BEFORE the first fetch and reuse it for the enqueue.
  1. offline-queue.ts exports `newIdempotencyKey()` (the existing private newId(), renamed and exported) and `enqueue(cafeId, payload, snapshot, opts?: { id?: string })` so the caller can supply the already-used key.
  2. authedFetch gains an `idempotencyKey?: string` option and sets `headers.set('idempotency-key', key)`.
  3. handleSubmit: `const idempotencyKey = newIdempotencyKey();` -> POST with it -> on isNetworkError, `enqueue(cafeId, body, snapshot, { id: idempotencyKey })`.
  4. sender: `authedFetch(path, { method: 'POST', body, idempotencyKey: item.id })` — same key, so the server returns 200 replay if the first attempt actually landed.
  5. The sender's return type changes from Promise<void> to Promise<SyncedOrder> ({ orderId, orderNumber, totalPaise }) so flush can record the reconciliation (consumed by `queue-drawer-and-reconcile`).
  6. Classify replay failures: authedFetch already distinguishes 5xx (NetworkError, retryable) from 4xx. In the sender, wrap a non-network Error in the new `PermanentSendError` so flush can stop retrying it — today a 400 (menu item deleted during the outage) loops silently every 30s forever.
  7. 409 IDEMPOTENCY_KEY_REUSED is a permanent failure, surfaced as 'Already sent — check today\'s orders'.

Money: nothing is recomputed on this path; the client sends the same integer-paise body it always sent and the server remains the sole authority on totals.

### API

none (consumes the contract from `server-idempotent-order-create`)

### Web

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — authedFetch gains idempotencyKey; handleSubmit mints the key up-front and passes it to enqueue; sender passes item.id as the header and returns the synced order; PermanentSendError wrapping.
apps/web/src/lib/offline-queue.ts — export newIdempotencyKey(); enqueue accepts an opts.id; OrderSender becomes (item) => Promise<SyncedOrder>; add `export class PermanentSendError extends Error { readonly permanent = true }`; FlushResult gains `synced: SyncedOrder[]` and `blocked: string[]`.
apps/web/src/lib/use-offline-queue.ts — thread the richer FlushResult through flushNow; no behavioural change to the timers.

### Tests

apps/web/src/app/cafes/[id]/orders/new/order-builder.test.tsx (new, @testing-library/react + a stubbed global fetch):
  - 'sends an Idempotency-Key header on the very first online Place order'
  - 'reuses the SAME Idempotency-Key when the first attempt fails with a network error and the order is later replayed' (the regression test for the double-serial bug)
  - 'a 400 from the server is shown inline and NOT queued'
  - 'a 503 from the server is queued (retryable) and shows "Saved offline"'

apps/web/src/lib/offline-queue.test.ts (extend):
  - 'enqueue honours a caller-supplied id so the first attempt\'s key is preserved'
  - 'newIdempotencyKey returns a distinct value on each call and falls back when crypto.randomUUID is absent'
  - 'flush surfaces the synced order returned by the sender in FlushResult.synced'
  - 'flush marks an item blocked when the sender throws PermanentSendError and does not call the sender for it again'
  - 'flush still retries and increments attempts when the sender throws an ordinary Error'

### Files

- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.test.tsx`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/offline-queue.test.ts`
- `apps/web/src/lib/use-offline-queue.ts`

---

<a id="offline-provisional-slip"></a>

## 🔴 `offline-provisional-slip` — Print a real KOT and a PROVISIONAL estimate for an offline order

### Approach

The auditor's pointer (render a provisional local KOT/bill from the queued payload before enqueueing, order-builder.tsx:392-398 — the enqueue is at :396-402 today) is correct in intent, but a naive implementation would either reprint the raw payload (menuItemIds, no prices) or fake an invoice number. Two hard constraints shape the design:
  (a) An offline order CANNOT have an invoice serial. The serial is allocated server-side inside the create transaction and must stay gapless per (cafe, FY). So the offline paper is a KITCHEN TICKET + a PROVISIONAL ESTIMATE, never a document headed TAX INVOICE. Printing a fake serial is exactly the Rule 46(b) hazard the codebase already guards elsewhere.
  (b) The slip must render with zero network AND zero React server data. The counter is an RSC page; if the cashier reloads mid-outage the menu, the cafe and the page itself are gone. Therefore the queue item must carry everything the paper needs.

Work:
  1. Freeze a printable snapshot into the queue item at enqueue time (all money integer paise, computed by the shared math module, never re-derived at print time).
  2. Extract the money math. order-builder.tsx:118-166 has a hand-copied `computeBill` that mirrors apps/api/src/orders/build.ts computeBillAdjustments; two copies of the money rules is how a provisional estimate drifts from the invoice. Move it to apps/web/src/lib/bill-math.ts, exporting `computeBillAdjustments(subtotalPaise, gstRateBp, adj)` with byte-identical integer operations, plus `splitGstHalves(taxPaise)`. Both order-builder and the slip import it.
  3. REMAINDER RULES (state them on the module, they are the only two splits in the whole bill):
       - Bill-level discount and charges are NEVER apportioned across lines. discountPaise is one bill-level integer; serviceChargePaise = round(netFood * bp / 10000); tax = round(taxableBase * gstRateBp / 10000) computed ONCE on the whole taxable base. No per-line tax is printed anywhere, so there is no remainder to reconcile.
       - CGST/SGST is the only split: cgstPaise = Math.floor(taxPaise / 2); sgstPaise = taxPaise - cgstPaise. The odd paise always lands on SGST, and the two halves sum EXACTLY to taxPaise by construction.
       - roundOffPaise = Math.round(preRound / 100) * 100 - preRound (may be negative); totalPaise = preRound + roundOffPaise, always a whole rupee when round-off is on. The delta is printed as its own line, so screen, estimate and invoice agree to the paise.
  4. Extract the slip components. Kot / Bill / BillItemRow / Divider / Row / formatDateTime / formatRupees / formatPct currently live inside print-views.tsx (:148-406) and are typed against OrderWithItems. Move them into apps/web/src/components/print/slip.tsx, retyped against a plain `SlipDoc` view-model, with `variant: 'final' | 'provisional'`. print-views.tsx becomes a thin adapter (OrderWithItems + Cafe -> SlipDoc) and keeps all of its existing bill-printed / DUPLICATE behaviour untouched.
  5. Provisional variant differences: header reads `PROVISIONAL — NOT A TAX INVOICE`; where the final prints `Bill: INV/2026-27/000123` it prints `Ref: OFF-K7Q-0007`; it appends `Tax invoice will be issued when this order syncs.`; it never emits the strings 'TAX INVOICE' or 'BILL OF SUPPLY'; the amount-in-words and the CGST/SGST lines are still printed (the customer needs the number they are paying).
  6. Offline ticket ref: a per-device code (3 chars, persisted at `sangam:device-code`) plus a per-cafe counter at `sangam.offline-ticket-seq.<cafeId>` -> `OFF-K7Q-0007`. Sent to the server as `offlineRef` so the paper can be matched to the eventual invoice.
  7. Printing without navigation: a new offline-slip.tsx mounts a hidden `print:block` container in the order-builder (the same @page 80mm technique print-views already uses), exposing printKot(item) / printEstimate(item) which set state, wait a double-RAF, then window.print(). When autoPrintKot is on the KOT fires automatically on enqueue; the estimate is one tap on the persistent post-enqueue card (which also shows the total in rupees), so the customer never walks away without a number.

### Schema

none in Postgres. New localStorage shape on the queue item (apps/web/src/lib/offline-queue.ts), versioned so old entries are dropped rather than mis-rendered:

interface QueuedOrderSnapshot {
  v: 1;
  offlineRef: string;                    // 'OFF-K7Q-0007'
  cafe: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; pincode: string | null; gstin: string | null; fssai: string | null; gstMode: GstMode };
  tableLabel: string | null; customerName: string | null; customerPhone: string | null; notes: string | null;
  lines: Array<{ menuItemId: string; name: string; hsnCode: string | null; unitPricePaise: number; quantity: number; lineTotalPaise: number; notes: string | null }>;
  gstRateBp: number;
  subtotalPaise: number; discountPaise: number; discountReason: string | null;
  serviceChargePaise: number; packagingChargePaise: number; taxPaise: number;
  roundOffPaise: number; totalPaise: number;
}
All money fields are integers in paise. readQueue()'s defensive filter must additionally drop entries whose snapshot is missing or whose snapshot.v !== 1.

### API

none new. Uses the `offlineRef` and `clientCreatedAt` body fields added by `server-idempotent-order-create`; clientCreatedAt is `new Date(item.createdAt).toISOString()`.

### Web

NEW apps/web/src/lib/bill-math.ts — computeBillAdjustments + splitGstHalves (shared by cart preview and slip).
NEW apps/web/src/components/print/slip.tsx — SlipDoc type, <KotSlip>, <BillSlip variant='final'|'provisional'>, Divider/Row/formatRupees/formatDateTime/formatPct moved here.
NEW apps/web/src/app/cafes/[id]/orders/new/offline-slip.tsx — hidden print surface + printKot/printEstimate for a QueuedOrder.
CHANGE apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx — delete the local Kot/Bill/helpers, adapt OrderWithItems -> SlipDoc, keep markBillPrinted/DUPLICATE/?autoprint untouched.
CHANGE apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — delete the local computeBill (:118-166) in favour of bill-math; build the snapshot; on enqueue auto-print the KOT when autoPrintKot is on and show a persistent card with the total plus 'Print KOT' / 'Print estimate'.

### Tests

apps/web/src/lib/bill-math.test.ts (new):
  - 'matches the API build.ts fixture table for a 5% cafe with a 10% discount, 5% service charge and packaging'
  - 'a flat discount larger than the subtotal is clamped to the subtotal (never a negative food value)'
  - 'a percent discount above 100 is clamped to 100'
  - 'round-off makes the total an exact multiple of 100 paise and the delta can be negative'
  - 'splitGstHalves: cgst + sgst equal taxPaise exactly for an odd taxPaise (the odd paisa goes to SGST)'
  - 'splitGstHalves: returns 0/0 for a zero-tax composition cafe'
  - 'produces the identical breakdown for the identical input as the counter cart preview (no float drift at 33 paise service charge)'

apps/web/src/components/print/slip.test.tsx (new):
  - 'provisional bill prints "PROVISIONAL — NOT A TAX INVOICE" and the OFF- ref'
  - 'provisional bill never renders the string "TAX INVOICE" or "BILL OF SUPPLY"'
  - 'provisional bill prints "Tax invoice will be issued when this order syncs"'
  - 'final bill still prints TAX INVOICE and the invoice number for a regular_5 cafe'
  - 'final bill still prints BILL OF SUPPLY plus the composition declaration for a composition cafe'
  - 'final bill still stamps *** DUPLICATE *** when isDuplicate is true'
  - 'bill totals rendered equal the snapshot integers to the paise (₹241.50 is not shown as ₹242)'
  - 'KOT prints the offline ref when there is no order number, and prints no prices'
  - 'KOT prints per-line notes and the order-level note'

apps/web/src/lib/offline-queue.test.ts (extend):
  - 'enqueue freezes a v1 printable snapshot with lines, cafe header and integer-paise totals'
  - 'offline ticket refs increment per cafe and are namespaced by the device code'
  - 'readQueue drops a legacy entry that has no snapshot instead of returning it'

### Files

- `apps/web/src/lib/bill-math.ts`
- `apps/web/src/lib/bill-math.test.ts`
- `apps/web/src/components/print/slip.tsx`
- `apps/web/src/components/print/slip.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/offline-slip.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/offline-queue.test.ts`

---

<a id="queue-drawer-and-reconcile"></a>

## 🟠 `queue-drawer-and-reconcile` — Pending-order drawer, poison-item handling, and estimate-vs-invoice reconciliation

### Approach

Once an order can be queued with paper attached, the cashier needs to see and act on the queue, and needs to be told when the synced invoice disagrees with the estimate already in the customer's hand.

  1. Flush policy (apps/web/src/lib/offline-queue.ts). Today any sender throw increments attempts and leaves the item queued forever, retried every 30s with no visible outcome. Add to QueuedOrder: `blockedReason?: string | null` and `nextAttemptAt?: number`. flush() skips items with a blockedReason or with nextAttemptAt > Date.now(); on a retryable failure it sets nextAttemptAt = now + min(5000 * 2^attempts, 300000); on PermanentSendError, or once attempts reaches MAX_ATTEMPTS (20), it sets blockedReason and stops. Blocked items stay in storage — never silently dropped, because a blocked item is an order the kitchen already cooked.
  2. Synced log. On success, flush appends { queueId, orderId, orderNumber, totalPaise, provisionalTotalPaise, offlineRef, syncedAt } to `sangam.offline-synced.<cafeId>` (cap 20 entries, prune anything older than 24h) before removing the queue item, so a mid-flush crash cannot lose the link between the paper ref and the invoice.
  3. Drift warning. If totalPaise !== provisionalTotalPaise (a menu price or the cafe's gstMode changed during the outage — the server rebuilds totals from the live menu at replay time and is the authority), the drawer shows a persistent warning row: 'Estimate OFF-K7Q-0007 was ₹210.00, invoice INV/2026-27/000123 is ₹220.00 — collect the difference or issue a credit note.' Both figures come straight from stored integers; nothing is recomputed.
  4. Drawer UI. Replace the read-only OfflineBadge (order-builder.tsx:667-690) with a button carrying the same count that opens a sheet listing: queued items (time, table, total, offline ref, attempts, 'Print KOT' / 'Print estimate' / 'Discard' with a confirm), blocked items (reason + 'Retry' which clears blockedReason and nextAttemptAt), and recently synced items ('Print bill' -> /cafes/{id}/orders/{orderId}?autoprint=bill, which is the FINAL tax invoice and correctly goes through the existing bill-printed counter).
  5. Traceability on the order page: apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx shows 'Taken offline · ref OFF-K7Q-0007' when order.offlineRef is set, so a manager can match the paper ticket to the invoice.

Money: this item only displays and compares stored integers. No new arithmetic, no apportionment, no rounding.

### Schema

none in Postgres. localStorage additions (apps/web/src/lib/offline-queue.ts):
  QueuedOrder gains  blockedReason?: string | null,  nextAttemptAt?: number  (epoch ms)
  NEW key `sangam.offline-synced.<cafeId>` -> SyncedOrderRecord[]:
    { queueId: string; orderId: string; orderNumber: string; totalPaise: number; provisionalTotalPaise: number; offlineRef: string; syncedAt: number }

### API

none new. Reads `offlineRef` off the order returned by GET /cafes/:cafeId/orders/:orderId (field added by `server-idempotent-order-create`).

### Web

NEW apps/web/src/app/cafes/[id]/orders/new/pending-orders-drawer.tsx — the sheet (queued / blocked / synced sections + actions).
CHANGE apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — OfflineBadge becomes the drawer trigger; wire printKot/printEstimate from offline-slip.tsx into the drawer rows.
CHANGE apps/web/src/lib/offline-queue.ts — blockedReason/nextAttemptAt, MAX_ATTEMPTS, backoff, unblock(cafeId, id), recordSynced/listSynced/pruneSynced.
CHANGE apps/web/src/lib/use-offline-queue.ts — expose blockedCount and the synced list so the drawer re-renders after a flush.
CHANGE apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx — render the offline ref line when present.

### Tests

apps/web/src/lib/offline-queue.test.ts (extend):
  - 'flush skips an item whose nextAttemptAt is in the future and does not call the sender'
  - 'a retryable failure sets an exponential nextAttemptAt capped at five minutes'
  - 'an item is blocked with a reason after MAX_ATTEMPTS consecutive failures'
  - 'unblock clears blockedReason and nextAttemptAt so the next flush retries it'
  - 'a successful send writes the synced record BEFORE removing the queue item'
  - 'listSynced prunes records older than 24h and caps the list at 20'

apps/web/src/app/cafes/[id]/orders/new/pending-orders-drawer.test.tsx (new):
  - 'lists a queued order with its offline ref and total in rupees'
  - 'discarding a queued order removes it from storage after confirmation'
  - 'a blocked order shows its reason and a Retry action that clears the block'
  - 'a synced order shows the real invoice number and a Print bill link to the order page'
  - 'a synced order whose invoice total differs from the printed estimate shows both amounts in a warning'
  - 'a synced order whose totals match shows no warning'

### Files

- `apps/web/src/app/cafes/[id]/orders/new/pending-orders-drawer.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/pending-orders-drawer.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/lib/offline-queue.test.ts`
- `apps/web/src/lib/use-offline-queue.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx`

---

<a id="public-qr-idempotency"></a>

## 🟡 `public-qr-idempotency` — Honour Idempotency-Key on the public QR order endpoint

### Approach

apps/api/src/routes/public.ts:103-162 creates orders on the same repo path with no dedupe. A diner on cafe mobile data who double-taps, or whose response is lost mid-flight (diner-order.tsx:309 has a `submitting` flag but no retry protection across a lost response), gets two orders, two serials and two kitchen tickets. The plumbing from `server-idempotent-order-create` is already in place; this is the last mile: parse the same `Idempotency-Key` header, hash the body with the same canonicalHash, pass key + hash into NewOrder (offlineRef and clientCreatedAt stay null — a diner has no offline queue), and map created→201 / replayed→200 / key_reused→409. The diner client mints one key per cart submission attempt and reuses it if the user retries the same cart, clearing it once an order is confirmed.

Do this AFTER the counter work: public.ts must be touched anyway to compile against the new NewOrder fields, so land the nulls in work item 1 and the behaviour here.

### Schema

none (reuses orders.idempotency_key / idempotency_request_hash and orders_cafe_idempotency_key_idx)

### API

MODIFIED — POST /public/cafes/:slug/orders (no auth)
  Request headers: `Idempotency-Key: <8..200 chars>` (optional)
  Request body: unchanged
  Responses:
    201 { order: { id, orderNumber, status, paymentStatus, totalPaise, tableLabel } }  — created (unchanged shape)
    200 same body + header `idempotent-replay: true`                                   — replayed
    409 { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: '...' } }
    400 VALIDATION_ERROR / INVALID_ITEM / ITEM_UNAVAILABLE, 404 NOT_FOUND — unchanged

### Web

apps/web/src/app/m/[slug]/diner-order.tsx — hold a `submitKeyRef` minted when the diner first taps Place order, send it as the Idempotency-Key header on the POST at :309, and reset it only after a confirmed order (so a retry of the SAME cart reuses the key while a genuinely new cart gets a new one).

### Tests

apps/api/src/routes/public.test.ts (extend):
  - 'POST /public/:slug/orders returns 200 and the same order for a repeated Idempotency-Key'
  - 'POST /public/:slug/orders creates two distinct orders when no key is sent'
  - 'POST /public/:slug/orders returns 409 when the key is reused with a different cart'
  - 'POST /public/:slug/orders never exposes owner-only fields (customerPhone, idempotencyRequestHash) on a replay response'

### Files

- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`

---

## Order of work

1. 1. Types first: add idempotencyKey / idempotencyRequestHash / offlineRef to the Order domain type (packages/types/src/domain.ts) and offlineRef / clientCreatedAt to CreateOrderRequest (packages/types/src/api.ts). Then fix the compile fallout — every `makeOrder`-style fixture across apps/api/src/**/*.test.ts constructs a full Order literal and will fail to typecheck.
2. 2. Write the failing route tests in apps/api/src/routes/orders.test.ts (replay, 409 reuse, no-key back-compat, offline audit entry) plus the canonicalHash tests. Confirm red.
3. 3. Add apps/api/src/orders/idempotency.ts (canonicalHash + the key zod schema) with its unit tests. Green.
4. 4. Schema + migration: edit packages/db/src/schema/orders.ts, run `pnpm --filter @sangam/db db:generate`, review the emitted 0013 SQL by hand (three nullable columns + one plain unique index; no backfill), then `db:migrate` locally.
5. 5. Repository: change OrdersRepository.create to return CreateOrderResult, add findByIdempotencyKey, implement the fast path + the 23505 recovery path. Write apps/api/src/repositories/orders.repo.test.ts against a stubbed Database in the house style. Update the mock repo in orders.test.ts and public.test.ts.
6. 6. Route: wire the header, the hash, the outcome→status mapping and the order.created_offline audit entry into apps/api/src/routes/orders.ts. Make public.ts compile by passing nulls. All API tests green.
7. 7. Manually verify the race against a real Postgres: two concurrent POSTs with the same key must yield one order, one serial, and last_seq incremented exactly once.
8. 8. Web foundations: extract apps/web/src/lib/bill-math.ts from order-builder's local computeBill and prove parity with the API fixtures (tests first). Delete the duplicate.
9. 9. Extend the offline queue: exported newIdempotencyKey, caller-supplied enqueue id, the v1 printable snapshot, PermanentSendError, the richer FlushResult. Tests first in offline-queue.test.ts.
10. 10. Wire the key through the client: authedFetch gains idempotencyKey, handleSubmit mints it before the first POST and reuses it on enqueue, the sender passes item.id. Land order-builder.test.tsx with the timeout-after-accept regression test.
11. 11. Extract the slip components out of print-views.tsx into components/print/slip.tsx behind a SlipDoc view-model; keep the existing order-detail behaviour byte-identical (bill-printed call, DUPLICATE stamp, ?autoprint). Add slip.test.tsx including the 'never says TAX INVOICE when provisional' assertions.
12. 12. Add offline-slip.tsx and hook it into the enqueue path: auto-print KOT when the preference is on, persistent card with the total and a one-tap Print estimate.
13. 13. Flush policy + synced log + drift comparison in offline-queue.ts, then the pending-orders drawer, then the offline-ref line on the order detail page.
14. 14. Public/QR endpoint idempotency plus the diner-side submitKeyRef.
15. 15. End-to-end manual pass with DevTools offline: place three orders offline (KOT + estimate print), reload the page mid-outage and confirm the queue and its paper survive, reconnect, confirm exactly three orders with three consecutive serials, kill the response mid-flight on a fourth and confirm the replay produces no duplicate.

## Risks

- The auditor's literal fix is insufficient and a developer following it exactly will leave the worst duplicate in place. Sending the key only from the replay sender does not cover the case where the first POST reached the server and the response was lost — that path enqueues an order the server already has, under a key the server has never seen. The key MUST be minted in handleSubmit before the first fetch. Two pointer details also drifted: the sender is at order-builder.tsx:193-203 (not :180-190) and authedFetch is defined locally at order-builder.tsx:68-92, not in apps/web/src/lib/api.ts.
- Breaking change: OrdersRepository.create changes its return type from Promise<OrderWithItems> to Promise<CreateOrderResult> and NewOrder gains three required fields. Every call site (routes/orders.ts, routes/public.ts) and every mocked repo in the API test suite must be updated in the same commit. This is deliberate — making the fields required forces each call site to state its intent rather than silently inheriting a default.
- Breaking change: the Order domain type gains three fields, so every full-Order fixture literal across apps/api/src/**/*.test.ts fails typecheck until updated. Expect a wide, mechanical diff.
- Migration risk: CREATE UNIQUE INDEX on orders takes an ACCESS EXCLUSIVE lock, and drizzle's migrator runs inside a transaction so CONCURRENTLY cannot be used there. Fine at today's data volume; on a large production orders table, build the index CONCURRENTLY by hand before the deploy and make the migration's statement IF NOT EXISTS.
- Provisional estimate vs final invoice can legitimately disagree. The server rebuilds totals from the LIVE menu when the queued order replays, so a price edit or a gstMode change during the outage produces an invoice that differs from the paper the customer already took. The drift warning surfaces it; it does not prevent it. Cafes must be told to freeze menu prices during an outage, and the fix if it happens is a credit note, not an edited invoice.
- Legal/UX friction: an offline order cannot be given an invoice serial, so the customer gets a document headed PROVISIONAL — NOT A TAX INVOICE. Some owners will push back and ask for a 'proper bill'. The alternative — a client-minted serial — breaks Rule 46(b) gaplessness and is exactly the audit exposure the product positions against. Needs explicit owner-facing copy, not just code.
- The queue lives in one browser profile's localStorage. If that terminal dies, is cleared, or the cashier moves to a second device, the queued orders are unrecoverable and the printed estimate is the only artefact. There is no cross-device or server-side recovery in this theme.
- The app shell itself is not offline-capable: no service worker, no manifest, and the counter is an RSC page. A reload during an outage leaves the cashier with nothing until the network returns, even though the queue data survives. This is arguably the largest remaining offline gap and is explicitly NOT closed here — it is a separate PWA/service-worker piece of work.
- The 23505 recovery path depends on the postgres.js error shape (`code`, `constraint_name`) surviving drizzle's rethrow. A driver upgrade could break it silently. Covered by a repo test with a synthetic error, but that test asserts our assumption, not the driver's behaviour — re-verify after any drizzle-orm or postgres upgrade.
- Idempotency is added to order CREATION only. POST /cafes/:cafeId/orders/:orderId/settle is protected by its ALREADY_PAID 409 (a retry is safe but shows an error), while POST .../refund has NO dedupe at all — a retried refund after a timeout inserts a second refund tender and double-refunds. Out of scope for the confirmed gaps in this theme, but it is the same class of bug and should be scheduled next.
- The rate limiter keys authenticated requests by bearer token at 600/min. Flush is serial so a large queue drain will not trip it, but any future parallel flush would; keep flush sequential.
- Two counters offline simultaneously mint independent OFF- refs. The 3-char device code makes collisions unlikely rather than impossible, and the kitchen sees two unrelated numbering streams during an outage.
