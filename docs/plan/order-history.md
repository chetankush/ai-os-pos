# Order search, history & live refresh

**Estimated effort: 7.5 engineer-days · 4 work items**

Today `GET /cafes/:cafeId/orders` is a hardcoded `listByCafe(cafeId, 50)` with no query params at all, so a cafe doing 100+ covers loses this morning's bill before service ends — there is no way to find it for a duplicate copy, a card refund or a dispute. This theme turns that route into a filtered, keyset-paginated search (bill number / phone / name, IST date range, status, source, payment status) with a summary strip, rebuilds the web orders page as a live-polling browser over it, and finally wires `CustomersRepository.upsertFromOrder` into both order-creation paths so the phone number the diner types actually becomes a customer record. It also backfills the missing route tests for `POST /public/cafes/:slug/orders` and `GET /public/cafes/:slug`, which ship untested today against the repo's TDD rule.

---

<a id="orders-list-query"></a>

## 🔴 `orders-list-query` — Filterable, keyset-paginated order list API

### Approach

CORRECTION TO THE AUDIT: the pointer "the existing source filter at apps/api/src/routes/orders.ts:31" is wrong. Line 31 is `source: z.enum(['counter','qr','phone']).optional()` inside `createOrderBodySchema` — the POST body field. There is NO list filter of any kind on the GET route; the query object is never even parsed. The two correct pointers are confirmed: the route is at apps/api/src/routes/orders.ts:181-190 with the hardcoded `listByCafe(cafeId, 50)` at :188, and the Drizzle impl is at apps/api/src/repositories/orders.ts:177-184 (the interface declaration that also has to change is at :47).

ALSO NOT IN THE AUDIT: `listByCafe` has a SECOND production caller — apps/api/src/routes/ai-console.ts:178, in the `list_recent_orders` tool. It does `listByCafe(cafeId, limit)` then `.filter(o => o.status === statusFilter)` IN MEMORY, i.e. it filters after the limit, so asking the console "show me recent cancelled orders" silently returns fewer rows than exist (often zero). Pushing status into the query fixes that latent bug for free.

1) Pure module `apps/api/src/orders/list-query.ts` (mirrors the existing pure-module pattern of orders/build.ts and reports/date-range.ts):
```ts
export interface OrderListQuery {
  search?: string;            // bill no / phone / name, 1..40 chars
  from?: string; to?: string; // IST YYYY-MM-DD, inclusive both ends
  status?: OrderStatus;
  source?: OrderSource;
  paymentStatus?: PaymentStatus;
  limit: number;              // 1..100, route default 50
  cursor?: { createdAt: string; id: string };
}
export interface OrderListPage {
  orders: Order[];
  nextCursor: string | null;
  summary: { count: number; grossPaise: number };
}
export function encodeOrderCursor(o: { createdAt: string; id: string }): string;
export function decodeOrderCursor(raw: string): { createdAt: string; id: string } | null;
export function escapeLike(term: string): string; // escapes \\ % _
```
Cursor = `Buffer.from(`${createdAt}|${id}`).toString('base64url')`. `decodeOrderCursor` returns null (never throws) unless the payload splits on exactly one `|`, the left side parses as a finite `Date.parse`, and the right side matches the uuid regex.

2) Repository — replace `listByCafe(cafeId: string, limit?: number): Promise<Order[]>` with `listByCafe(cafeId: string, query?: OrderListQuery): Promise<OrderListPage>`, defaulting to `{ limit: 50 }`. Build a `conditions: SQL[]` array exactly as customers.listByCafe already does:
- always `eq(orders.cafeId, cafeId)`
- dates: reuse `istRange(from, to)` from apps/api/src/reports/date-range.ts → `gte(orders.createdAt, fromIso)`, `lt(orders.createdAt, toIso)`. Do NOT invent a second timezone story; IST is a fixed +5:30 there and day-end/sales already reckon this way.
- `status` / `source` / `paymentStatus`: `eq(...)` when present
- `search`: `or(ilike(orders.orderNumber, `%${esc}%`), ilike(orders.customerPhone, `%${esc}%`), ilike(orders.customerName, `%${esc}%`))` with `esc = escapeLike(term)`. Bill numbers look like `INV/2026-27/000123`, so a cashier typing `123` must substring-match, not prefix-match.
- `cursor`: raw tuple compare, which is what makes the keyset exact across rows sharing a timestamp:
```ts
sql`(${schema.orders.createdAt}, ${schema.orders.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
```
Order by `desc(orders.createdAt), desc(orders.id)`. Select `limit + 1` rows; if `rows.length > limit`, drop the extra and set `nextCursor = encodeOrderCursor(lastKeptRow)`, else null.

Run the page query and the summary query in one `Promise.all`. The summary uses the SAME conditions MINUS the cursor (it describes the whole filtered set, not the page):
```ts
db.select({
  count: count(),
  gross: sql<string>`coalesce(sum(case when ${schema.orders.status} <> 'cancelled' then ${schema.orders.totalPaise} else 0 end), 0)`,
}).from(schema.orders).where(and(...conditions))
```
MONEY: `count` counts every matching order including cancelled; `grossPaise` sums `total_paise` for non-cancelled only — the same exclusion `reports.dayEnd` already applies (`ne(status,'cancelled')`), so the search strip and the Z-report agree to the paise. There is NO apportionment and NO division anywhere in this work item: `total_paise` is already an exact integer written by buildOrder, and SQL `sum()` over integers is exact. The one trap is that Drizzle types `sum()` as `string | null`, so it MUST be coerced with `Number(row?.gross ?? 0)` (the repo already does this in `itemSalesToday`); forgetting the coercion produces string concatenation, not addition.

3) Route — parse `request.query`, validate, decode the cursor, delegate.

4) ai-console.ts:174-190 — `const { orders } = await ordersRepo.listByCafe(cafeId, { limit, status: statusFilter })` and DELETE the trailing `.filter(...)`.

### Schema

No column changes, no data backfill. Indexes only, in a new migration 0013 generated by drizzle-kit from packages/db/src/schema/orders.ts.

ADD to the orders table index list:
- `orders_cafe_created_at_id_idx` on (cafe_id, created_at DESC, id DESC) — serves the keyset page order and the tuple comparison.
- `orders_cafe_customer_phone_idx` on (cafe_id, customer_phone) — also earns its keep for `customers.recentOrdersByPhone`, which today does an unindexed `cafe_id = ? AND customer_phone = ?`.
- `orders_cafe_payment_status_idx` on (cafe_id, payment_status) — the "unpaid QR orders" filter.

DROP `orders_cafe_created_at_idx` (cafe_id, created_at): it is a strict prefix of the new composite, so no query loses an index; leaving both costs a write on every order insert for nothing. Keep `orders_cafe_status_idx` and the unique `orders_cafe_order_number_idx` untouched.

Generated SQL to expect in packages/db/drizzle/migrations/0013_*.sql:
```sql
CREATE INDEX "orders_cafe_created_at_id_idx" ON "orders" ("cafe_id","created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "orders_cafe_customer_phone_idx" ON "orders" ("cafe_id","customer_phone");--> statement-breakpoint
CREATE INDEX "orders_cafe_payment_status_idx" ON "orders" ("cafe_id","payment_status");--> statement-breakpoint
DROP INDEX IF EXISTS "orders_cafe_created_at_idx";
```
OPERATIONAL WARNING: drizzle-kit runs a migration inside one transaction, and a plain `CREATE INDEX` takes a SHARE lock that blocks INSERTs on `orders` for its duration. On an empty/small dev database that is milliseconds; against a live cafe mid-service it stalls order creation. If any production orders table exceeds ~100k rows, hand-edit this migration into three `CREATE INDEX CONCURRENTLY` statements run outside the transaction (or deploy it in the closed-hours window) — CONCURRENTLY cannot run inside a transaction block.

### API

GET /cafes/:cafeId/orders  (authenticated; cafe resolved via cafesRepo.findByIdAndOwner, 404 never 403)

Query params, all optional:
  search         string, trimmed, 1..40
  from           YYYY-MM-DD (IST business date, inclusive)
  to             YYYY-MM-DD (IST business date, inclusive)
  status         pending | preparing | ready | completed | cancelled
  source         counter | qr | phone
  paymentStatus  unpaid | pending | paid | failed | refunded
  limit          integer 1..100, default 50 (z.coerce.number())
  cursor         opaque base64url string from a previous nextCursor, max 200 chars

One-sided date ranges expand exactly as reports.sales already does: `fromDate = from ?? to`, `toDate = to ?? from`; when neither is given there is no date predicate at all (unlike reports, the order list must not silently default to today — the whole point is finding old bills).

200 →
{
  "orders": Order[],                       // newest first
  "nextCursor": string | null,             // null on the last page
  "summary": { "count": number, "grossPaise": number }
}

400 { error: { code: "VALIDATION_ERROR", ... } }  bad enum / limit out of 1..100 / malformed date (ZodError, handled by plugins/error-handler.ts)
400 { error: { code: "INVALID_RANGE",  message: "`from` must not be after `to`" } }
400 { error: { code: "INVALID_CURSOR", message: "Cursor is not valid" } }
404 { error: { code: "NOT_FOUND", message: "Cafe not found" } }  unknown cafe OR another owner's cafe
401 when unauthenticated (app.authenticate preHandler)

No other route changes. This is additive on the wire — `{ orders }` is still present and still first — but `OrdersListResponse` in packages/types gains two REQUIRED fields, which is a compile-time break for any TS consumer constructing that type (only the web orders page does).

### Web

none in this work item (see orders-browser). Only packages/types/src/api.ts changes so the web app can compile against the new shape:

export interface OrdersListResponse {
  orders: Order[];
  nextCursor: string | null;
  summary: { count: number; grossPaise: number };
}

### Tests

NEW apps/api/src/orders/list-query.test.ts (write first, all failing):
- 'encodeOrderCursor then decodeOrderCursor round-trips createdAt and id'
- 'decodeOrderCursor returns null for a string that is not base64url'
- 'decodeOrderCursor returns null when the payload has no | separator'
- 'decodeOrderCursor returns null when the id is not a uuid'
- 'decodeOrderCursor returns null when createdAt is not a parseable instant'
- 'decodeOrderCursor returns null for an empty string'
- 'escapeLike escapes % _ and backslash so a search term cannot become a wildcard'

EXTEND apps/api/src/routes/orders.test.ts, replacing the single existing 'returns a list of orders' case at :359-372 with describe('GET /cafes/:cafeId/orders'):
- 'calls listByCafe with limit 50 and no filters when no query params are given'
- 'passes search, from, to, status, source and paymentStatus through to listByCafe unchanged'
- 'coerces limit from the query string'
- 'returns 400 VALIDATION_ERROR for limit=0'
- 'returns 400 VALIDATION_ERROR for limit=101'
- 'returns 400 VALIDATION_ERROR for from=2026-13-01'
- 'returns 400 INVALID_RANGE when from is after to, without calling the repo'
- 'expands a one-sided range: to alone is used for both bounds'
- 'returns 400 INVALID_CURSOR when the cursor does not decode, without calling the repo'
- 'decodes a valid cursor into { createdAt, id } before calling listByCafe'
- 'returns orders, nextCursor and summary in the response body'
- 'returns nextCursor null on the last page'
- 'returns 404 for a cafe the user does not own and never calls listByCafe'
- 'requires authentication'

EXTEND apps/api/src/routes/ai-console.test.ts:
- 'list_recent_orders pushes the status filter into listByCafe rather than filtering after the limit'
- 'list_recent_orders defaults to limit 10 with no status filter'

MECHANICAL: `createMockOrdersRepo` must be retyped in all four files that declare one — apps/api/src/routes/orders.test.ts:133, public.test.ts:104, ai-console.test.ts:98, payments.test.ts:91 — and ai-console.test.ts's `.mockResolvedValue([] as Order[])` becomes `.mockResolvedValue({ orders: [], nextCursor: null, summary: { count: 0, grossPaise: 0 } })`.

### Files

- `apps/api/src/orders/list-query.ts`
- `apps/api/src/orders/list-query.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/ai-console.ts`
- `apps/api/src/routes/ai-console.test.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/payments.test.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0013_orders_search_indexes.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/api.ts`

---

<a id="orders-browser"></a>

## 🔴 `orders-browser` — Orders page: search, date range, source/unpaid filters, pagination, live poll

### Approach

Both remaining pointers verified. apps/web/src/app/cafes/[id]/orders/page.tsx is a 168-line pure RSC that renders `ordersRes.orders` with no controls at all; the header block is at :49-76 and `OrderRow` at :81-123 (audit's line numbers are right). apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:109-116 is the poll loop to mirror — `REFRESH_MS = 10_000`, an `inFlight` useRef guard, and a `manual` flag so only user-triggered failures raise a toast.

Split the page the way kitchen/ already is: page.tsx stays an RSC that server-renders the FIRST page (so first paint never waits on the client) and hands it to a new client component.

1) NEW pure module apps/web/src/lib/order-filters.ts — all the query/URL logic lives here because web tests in this repo are lib-only (apps/web/vitest.config.ts includes `src/**/*.test.{ts,tsx}` but the only existing tests are src/lib/*.test.ts):
```ts
export interface OrderFilters {
  search: string; from: string; to: string;   // '' means unset
  source: '' | OrderSource;
  paymentStatus: '' | PaymentStatus;
  status: '' | OrderStatus;
}
export const EMPTY_FILTERS: OrderFilters;
export function parseOrderFilters(sp: Record<string, string | string[] | undefined>): OrderFilters;
export function buildOrdersQuery(f: OrderFilters, o?: { cursor?: string; limit?: number }): string; // '' or '?a=b&c=d'
export function todayIstDate(now?: Date): string;   // +330min then slice(0,10)
export function isLiveView(f: OrderFilters, todayIst: string): boolean;
```
`parseOrderFilters` whitelists enum values and drops anything else to '' — a hand-edited URL must never reach the API as a 400. `buildOrdersQuery` emits keys in a fixed order so the same filter set always yields byte-identical URLs (stops `router.replace` from looping).
`isLiveView` is the poll gate: true only when `search === ''` AND `(from === '' || from === todayIst)` AND `(to === '' || to === todayIst)` — i.e. the view is showing now, so refreshing it cannot yank rows out from under the user.

2) NEW client component apps/web/src/app/cafes/[id]/orders/orders-browser.tsx ('use client'):
- state: `filters`, `pages: Order[][]` (page 0 is the server-rendered first page), `nextCursor`, `summary`, `loading`.
- search input debounced 250ms with a `reqId` useRef staleness guard, copied verbatim from apps/web/src/app/cafes/[id]/customers/customers-list.tsx:52-68 (already proven in this codebase).
- From/To are native `<input type="date">` styled exactly like apps/web/src/app/cafes/[id]/expenses/expenses-view.tsx:238-258.
- quick chips above the search row: Today · Unpaid · QR · Cancelled. Each toggles one field of `filters` and resets pagination.
- summary strip: `{summary.count} orders · ₹{grossPaise/100}` formatted with the existing `formatRupees` helper already in page.tsx (move it to the client component).
- 'Load more' appends the next page via `buildOrdersQuery(filters, { cursor: nextCursor })` and pushes onto `pages`.
- POLL: `setInterval(REFRESH_MS = 10_000)`, and inside it, refetch ONLY when `isLiveView(filters, todayIstDate()) && pages.length === 1 && document.visibilityState === 'visible'`. Reuse the kitchen board's `inFlight` ref. On a paginated or filtered/historical view the timer does nothing and a manual `RefreshCw` button is shown instead — polling a paginated keyset would either duplicate or drop rows, and re-running a historical query every 10s is pointless load.
- URL sync: `router.replace(`${pathname}${buildOrdersQuery(filters)}`, { scroll: false })` on every filter change, so a filtered view is shareable and the back button works. Do NOT call `router.refresh()` in the poll — the list is client-fetched after first paint, and a full RSC round-trip on a 10s timer is far heavier than one JSON GET.
- fetch helper: the existing `authedHeaders()` shape from kitchen-board.tsx:53-61 (Supabase browser session → Bearer).

3) NEW apps/web/src/app/cafes/[id]/orders/_components/source-badge.tsx — sits alongside the existing status-pill.tsx and payment-badge.tsx. Renders nothing for `counter` (the default, ~90% of rows) and a small `QR` / `Phone` chip otherwise, so the row stays calm while a QR order is instantly identifiable.

4) page.tsx becomes a thin RSC: `searchParams` → `parseOrderFilters` → `serverFetch<OrdersListResponse>(`/cafes/${id}/orders${buildOrdersQuery(filters, { limit: 50 })}`)`, then renders `<OrdersBrowser cafeId initialFilters initialPage initialCursor initialSummary />`. Note Next 15 types `searchParams` as a Promise, same as `params`.

On the audit's "a cashier can walk to a bill someone else already settled": the poll shrinks the window, but the real guard already exists and should not be rebuilt — POST /cafes/:cafeId/orders/:orderId/settle returns 409 ALREADY_PAID (apps/api/src/routes/orders.ts:368-372). Surface that 409's message as a toast rather than a generic failure.

### API

none — consumes GET /cafes/:cafeId/orders exactly as specified in orders-list-query.

### Web

ADD    apps/web/src/lib/order-filters.ts
ADD    apps/web/src/lib/order-filters.test.ts
ADD    apps/web/src/app/cafes/[id]/orders/orders-browser.tsx  ('use client')
ADD    apps/web/src/app/cafes/[id]/orders/_components/source-badge.tsx
REWRITE apps/web/src/app/cafes/[id]/orders/page.tsx — RSC shell only: reads searchParams, fetches page 1, renders <OrdersBrowser>. OrderRow / EmptyState / formatRupees / formatTime (currently :81-168) move into orders-browser.tsx; OrderRow gains <SourceBadge source={order.source} />.
UNCHANGED: _components/status-pill.tsx, _components/payment-badge.tsx (reused as-is).

### Tests

NEW apps/web/src/lib/order-filters.test.ts (write first, all failing):
- 'buildOrdersQuery returns an empty string for EMPTY_FILTERS'
- 'buildOrdersQuery omits blank fields'
- 'buildOrdersQuery url-encodes a search term containing & and spaces'
- 'buildOrdersQuery appends cursor and limit when given'
- 'buildOrdersQuery emits keys in a stable order for the same filters'
- 'parseOrderFilters reads search, from, to, status, source and paymentStatus'
- 'parseOrderFilters falls back to empty string for an unknown source value'
- 'parseOrderFilters falls back to empty string for an unknown paymentStatus value'
- 'parseOrderFilters takes the first value when a param is repeated'
- 'parseOrderFilters returns EMPTY_FILTERS for an empty searchParams object'
- 'todayIstDate returns the next calendar day for 2026-09-06T18:31:00Z'
- 'todayIstDate returns the same calendar day for 2026-09-06T18:29:00Z'
- 'isLiveView is true for EMPTY_FILTERS'
- 'isLiveView is true when from and to both equal today'
- 'isLiveView is false when a search term is set'
- 'isLiveView is false for a from date in the past'
- 'isLiveView is true when only source or paymentStatus is set' (a QR/unpaid view of today must keep polling)

### Files

- `apps/web/src/lib/order-filters.ts`
- `apps/web/src/lib/order-filters.test.ts`
- `apps/web/src/app/cafes/[id]/orders/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/orders-browser.tsx`
- `apps/web/src/app/cafes/[id]/orders/_components/source-badge.tsx`

---

<a id="public-route-tests"></a>

## 🟠 `public-route-tests` — Backfill the missing tests for the two untested public routes

### Approach

Verified: apps/api/src/routes/public.test.ts is 201 lines and contains exactly one describe block — 'GET /public/cafes/:slug/orders/:orderId'. `POST /public/cafes/:slug/orders` (the entire QR ordering path — money, GST, bill number) and `GET /public/cafes/:slug` (the public menu) have ZERO route tests, against the repo's TDD rule. This is the highest-value untested surface in the app: every diner order flows through it.

This lands BEFORE customer-capture because those same two routes are what customer-capture edits — the new tests are the failing-first harness for that change, and writing them first also pins the current behaviour so the edit cannot silently regress it.

The existing file already has everything needed: `makeCafe`, `makeOrder`, `makeOrderItem`, `makeOrderWithItems`, `createMockCafesRepo`, `createMockOrdersRepo`, and `buildPublicApp`. Extend `buildPublicApp` to accept `menuRepo` and `config` overrides — `onlinePaymentEnabled` in the response depends on `app.config.RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET` (public.ts:85-87), and `buildTestApp` already takes a config object.

Add a `createMockMenuRepo(categories)` local helper mirroring the one in orders.test.ts.

The POST tests assert the two security invariants the route enforces silently today: `source` is hardcoded to `'qr'` and `customerGstin` to `null` regardless of what the body contains (public.ts:121, :127), and the 201 body contains ONLY the six PublicOrder fields — no customerPhone, no providerPaymentId.

### API

none — tests only, no contract change.

### Tests

EXTEND apps/api/src/routes/public.test.ts:

describe('GET /public/cafes/:slug'):
- 'returns the public-safe cafe fields and the menu'
- 'filters unavailable items out of every category'
- 'returns onlinePaymentEnabled false when the cafe opted in but RAZORPAY_KEY_ID is unset'
- 'returns onlinePaymentEnabled false when RAZORPAY_KEY_SECRET is unset'
- 'returns onlinePaymentEnabled true when the cafe opted in and both Razorpay keys are set'
- 'returns onlinePaymentEnabled false when the cafe opted out even with keys set'
- 'returns gstRateBp 500 for gstMode regular_5'
- 'returns gstRateBp 0 for gstMode composition'
- 'never exposes ownerId, gstin, fssai or addressLine1'
- 'returns 404 for an unknown slug'

describe('POST /public/cafes/:slug/orders'):
- 'creates a qr-source order and returns only the diner-safe PublicOrder fields'
- 'forces source to qr even when the body supplies source counter'
- 'forces customerGstin to null even when the body supplies one'
- 'passes the buildOrder totals through to create unchanged (subtotal, tax, total in paise)'
- 'returns 400 with the OrderBuildError code when an item id is not on this cafe menu'
- 'returns 400 VALIDATION_ERROR for an empty items array'
- 'returns 400 VALIDATION_ERROR for a malformed customerPhone'
- 'returns 400 VALIDATION_ERROR for quantity 0'
- 'returns 404 for an unknown slug and never calls create'
- 'never returns customerPhone or providerPaymentId in the 201 body'

### Files

- `apps/api/src/routes/public.test.ts`

---

<a id="customer-capture"></a>

## 🟠 `customer-capture` — Wire upsertFromOrder into order creation; make the phone-number promise honest

### Approach

Verified in full. apps/api/src/repositories/customers.ts:16-19 carries the explicit note 'DEFERRED INTEGRATION: not yet wired into order creation… should call this after a successful order insert when customerPhone is present', and `upsertFromOrder` is called from nowhere in apps/api/src. apps/web/src/app/m/[slug]/diner-order.tsx:571 reads `<Field label="Phone (for order updates)">`. I grepped the whole repo for sms/twilio/msg91/gupshup/whatsapp: the ONLY hits are apps/api/src/settle/analyzer.ts's `whatsappSummary`, which is a plain-text string the OWNER copies into a wa.me link from apps/web/src/app/settle/settle-tool.tsx:171-175. There is no messaging provider, no outbound send, no queue. Promising a diner an update is a lie the codebase cannot currently make true.

So do three things, in order of honesty:

1) WIRE THE CAPTURE. Add `customersRepository?: CustomersRepository` to both `PublicRoutesOptions` (public.ts:15-19) and `OrdersRoutesOptions` (orders.ts:17-22), defaulting to `createDrizzleCustomersRepo(app.db)`. After the successful `ordersRepo.create(newOrder)` in BOTH POST handlers (public.ts:148 and orders.ts:174), when a phone is present:
```ts
if (order.customerPhone) {
  try {
    await customersRepo.upsertFromOrder(
      cafeId, order.customerPhone, order.customerName, order.totalPaise,
    );
  } catch (err) {
    app.log.error({ err, orderId: order.id }, 'customer upsert failed');
  }
}
```
The try/catch is load-bearing: a customers-table problem must never turn a successfully-inserted, bill-numbered order into a 500 the diner sees as a failed order. The order is already committed at that point.
MONEY: `order.totalPaise` is the integer already computed by buildOrder and written by create() — pass it through untouched. No re-derivation, no apportionment, no division. `upsertFromOrder` accumulates with `sql\`total_spent_paise + ${amountPaise}\`` in SQL, so lifetime spend stays exact integer paise.
Delete the DEFERRED INTEGRATION paragraph from customers.ts:16-19 once wired.

No backfill: existing orders with a phone will not appear in the customers table. That is acceptable — lifetime totals start from the wiring date — but say so in the release note rather than letting an owner think the numbers are historical. A backfill would be `INSERT … SELECT … GROUP BY cafe_id, customer_phone ON CONFLICT DO UPDATE`, deliberately deferred as a separate one-off script.

2) TELL THE TRUTH ON THE FORM. diner-order.tsx:571 → `<Field label="Phone (optional)">` with helper text 'So we can reach you if there's a question about your order.' Keep the field — it now genuinely powers the customers ledger and the order-list phone search from orders-list-query.

3) DELIVER THE UPDATE WHERE IT ACTUALLY CAN BE DELIVERED. The diner's confirmation screen (diner-order.tsx `Confirmation`, ~:860-960) is static today — it renders once and never learns the order became ready. But `GET /public/cafes/:slug/orders/:orderId` already returns a diner-safe `PublicOrderDetail` including `status`, and apps/web/src/app/m/[slug]/ai-widget.tsx:82 already polls it. Add the same poll to the confirmation screen: every 10s while `status` is pending or preparing, stopping on ready/completed/cancelled, with `document.visibilityState` gating. When it flips to ready the screen shows 'Ready — we're bringing it to Table 4' / 'Ready — collect at the counter'. The diner keeps the tab open, which is exactly what happens at a table. That is a real order update, built on infrastructure that already exists, instead of a fake SMS promise.

Extract the copy decision into a pure lib module so it is testable under the repo's lib-only web test setup.

EXPLICITLY OUT OF SCOPE: an actual SMS/WhatsApp send. That needs a BSP account, a template approval, a DLT registration, an outbound queue and a per-message cost model — a theme of its own, and the AI-agent architecture note already flags moving off the current provider before financial data. Do not stub a fake one.

### Schema

none. The `customers` table and its `customers_cafe_phone_idx` unique index on (cafe_id, phone) already exist and are what makes `upsertFromOrder` idempotent per customer.

NO BACKFILL in this work item — called out deliberately above.

### API

No new routes and no changed contracts. Two existing handlers gain a side effect:

POST /public/cafes/:slug/orders — unchanged 201 body `{ order: PublicOrder }`; now also upserts customers(cafe_id, phone). A failure of that upsert is logged and swallowed; the response is still 201.
POST /cafes/:cafeId/orders — unchanged 201 body `{ order }`; same side effect, same swallow.

GET /public/cafes/:slug/orders/:orderId — unchanged, now polled by the diner confirmation screen.

### Web

EDIT apps/web/src/app/m/[slug]/diner-order.tsx
  :571  label 'Phone (for order updates)' → 'Phone (optional)' + helper line
  Confirmation component (~:860-960): add a 10s status poll against GET /public/cafes/:slug/orders/:orderId (mirror apps/web/src/app/m/[slug]/ai-widget.tsx:82), driven by the new pure helpers; render the live heading/body from dinerStatusCopy and stop the interval when shouldPollDinerStatus is false.
ADD  apps/web/src/lib/diner-status.ts
  export function dinerStatusCopy(status, paymentStatus, tableLabel): { heading: string; body: string; tone: 'info' | 'success' | 'warn' }
  export function shouldPollDinerStatus(status): boolean
ADD  apps/web/src/lib/diner-status.test.ts

### Tests

EXTEND apps/api/src/routes/public.test.ts (on top of the public-route-tests harness), describe('POST /public/cafes/:slug/orders — customer capture'):
- 'upserts the customer with the cafe id, phone, name and order totalPaise when a phone is supplied'
- 'does not call the customers repo when no phone is supplied'
- 'still returns 201 with the order when upsertFromOrder rejects'
- 'passes null as the name when the diner supplied only a phone'

EXTEND apps/api/src/routes/orders.test.ts, describe('POST /cafes/:cafeId/orders — customer capture'):
- 'upserts the customer with the order totalPaise when customerPhone is supplied'
- 'does not call the customers repo when customerPhone is absent'
- 'still returns 201 when upsertFromOrder rejects'
- 'passes the discounted totalPaise, not the subtotal, to upsertFromOrder' (guards against someone wiring subtotal in and inflating lifetime spend)

NEW apps/web/src/lib/diner-status.test.ts:
- 'dinerStatusCopy says Preparing for a preparing order'
- 'dinerStatusCopy says ready and names the table when tableLabel is set'
- 'dinerStatusCopy says ready for counter collection when tableLabel is null'
- 'dinerStatusCopy says cancelled for a cancelled order'
- 'dinerStatusCopy shows a payment-needed body for a pending paymentStatus'
- 'shouldPollDinerStatus is true for pending and preparing'
- 'shouldPollDinerStatus is false for ready, completed and cancelled'

### Files

- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/repositories/customers.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/lib/diner-status.ts`
- `apps/web/src/lib/diner-status.test.ts`

---

## Order of work

1. 1. public-route-tests FIRST. It touches nothing but apps/api/src/routes/public.test.ts, it is pure TDD debt repayment, and it pins the current behaviour of the two routes that customer-capture is about to edit. Merges independently of everything else.
2. 2. orders-list-query, in this internal order: (a) write apps/api/src/orders/list-query.test.ts and the failing route tests in orders.test.ts; (b) add the three indexes to packages/db/src/schema/orders.ts, drop orders_cafe_created_at_idx, run drizzle-kit generate, eyeball the 0013 SQL and decide plain vs CONCURRENTLY; (c) implement list-query.ts; (d) change the OrdersRepository interface + Drizzle impl; (e) fix the two production callers (routes/orders.ts:188, routes/ai-console.ts:178 — drop its in-memory .filter); (f) retype createMockOrdersRepo in all four test files; (g) update OrdersListResponse in packages/types/src/api.ts. The web app will not typecheck between (g) and step 3 — land 2 and 3 in one PR, or ship (g) with a temporary `orders` read in the page.
3. 3. orders-browser. Write apps/web/src/lib/order-filters.test.ts first, then order-filters.ts, then the source-badge, then orders-browser.tsx, then reduce page.tsx to the RSC shell. Verify the poll gate by hand: load the page, click Load more, confirm the timer stops and the manual Refresh button appears; type a search term, confirm the same.
4. 4. customer-capture. API first (both POST handlers + delete the DEFERRED note in customers.ts), then the two web pieces (relabel the field, add diner-status.ts + the confirmation poll). Depends on step 1 for the public.test.ts harness; independent of steps 2 and 3.
5. 5. Deploy order: migration 0013 must be applied BEFORE the API build that queries with the new predicates ships — the queries are correct without the indexes, just slow, so this is a performance ordering, not a correctness one. The API must ship before the web build, because the web page reads summary and nextCursor.

## Risks

- BREAKING (compile-time, internal): `OrdersRepository.listByCafe` changes from `(cafeId, limit?) => Promise<Order[]>` to `(cafeId, query?) => Promise<OrderListPage>`. Two production callers (apps/api/src/routes/orders.ts:188, apps/api/src/routes/ai-console.ts:178) and four `createMockOrdersRepo` factories (orders.test.ts:133, public.test.ts:104, ai-console.test.ts:98, payments.test.ts:91) must all change in the same commit or the API will not build.
- BREAKING (compile-time, cross-package): `OrdersListResponse` gains two required fields. The web build fails until orders-browser lands. Land the type change and the web change together.
- MIGRATION LOCK: drizzle-kit wraps 0013 in a transaction, and a plain CREATE INDEX takes a SHARE lock that blocks INSERTs into `orders` for its duration. Against a live cafe that stalls order creation mid-service. If any deployed orders table is over ~100k rows, hand-edit into CREATE INDEX CONCURRENTLY statements outside the transaction, or deploy in the closed-hours window.
- SEARCH SCALE: `ILIKE '%term%'` on order_number / customer_phone / customer_name cannot use a btree, so the search degrades to a cafe-scoped scan (the cafe_id predicate still uses an index). At 100 covers/day that is ~36k rows/year and a sub-20ms scan, which is fine. Past roughly 200k orders per cafe this needs a pg_trgm GIN index — a follow-up, not this theme. Do not silently "fix" it by switching to prefix-match: a cashier types the last digits of INV/2026-27/000123, not the prefix.
- POLLING vs PAGINATION: refreshing a keyset-paginated list duplicates or drops rows. The `isLiveView(filters) && pages.length === 1` gate is the whole defence — if a later change loosens it, the list will start showing phantom or missing bills. Keep the isLiveView unit tests as the guard.
- LIFETIME SPEND OVERSTATES: `upsertFromOrder` fires once at order creation and nothing ever decrements it. A cancelled or fully-refunded order still counts toward totalOrders and totalSpentPaise. Accepted for now; the fix (decrement on cancel/refund, or recompute nightly) is a separate work item. Do not let the customers page describe the figure as 'net spend'.
- NO HISTORICAL BACKFILL for the customers table: totals start from the wiring date, so an owner with six months of phone-bearing orders sees an empty-ish customers list. Say this in the release note.
- DRIZZLE sum() TYPING: `sum()` returns `string | null`, not a number. The summary aggregate must be coerced with `Number(x ?? 0)` (the pattern already used in itemSalesToday). Omitting it silently produces string concatenation and a nonsense grossPaise.
- PII SURFACE WIDENS: the list response and the search index now make customer_phone routinely queryable by the owner. It is already owner-scoped through cafesRepo.findByIdAndOwner and already present on the Order type, so nothing new leaks — but do not let the phone filter creep into any public or AI-waiter route.
- HONESTY RISK: 'Phone (optional)' plus an in-page live status is a smaller promise than an SMS ping. If product pushes back and asks to keep the 'for order updates' wording without building a sender, that is the same defect the audit flagged — the field must not promise a channel that does not exist.
