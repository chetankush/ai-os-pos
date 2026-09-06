# Kitchen display robustness & routing

**Estimated effort: 18 engineer-days · 10 work items**

The KDS is currently a 10-second silent repaint with no failure signal, no sound, no station split and no way to act on what it shows; the counter pad next to it can neither 86 an item nor attach a note to a line, and when the line drops the kitchen gets nothing at all. This theme makes the board tell the truth about its own connection, shout when a ticket arrives or is cancelled, route lines to the hot kitchen vs the beverage counter with per-item bumping, put an inline 86 on both the pad and the board (backed by real stock decrement), let both the cashier and the diner attach per-line instructions, and print a kitchen slip even when the internet is gone. It also closes the dashboard reconciliation hole where split-tender money vanishes from the Cash/UPI/Card rows, so the owner's closing count actually ties out to revenue.

---

<a id="split-tender-recon"></a>

## 🟠 `split-tender-recon` — Split-tender money lands in the dashboard Cash/UPI/Card rows (and the rows are made to sum by construction)

### Approach

Verified: apps/api/src/repositories/orders.ts todayStats() is at :395-465 (auditor said 420-451 — close, the paymentAgg query is :421-428 and the fold is :445-451). It groups completed-today orders by orders.paymentMethod and skips nulls, and settleWithPayments (:344-380) deliberately writes null for a true split, so a 1000+1000 split shows in todayRevenuePaise and in no method row. apps/api/src/repositories/reports.ts:86-105 already does the correct union — verified.

Do NOT copy-paste that fold a third time. Extract the merge into a new pure module apps/api/src/orders/payment-breakdown.ts:
  export interface MethodRow { method: string | null; total: unknown; count?: unknown }
  export function foldPaymentBreakdown(single: MethodRow[], split: MethodRow[]): Record<PaymentMethod, number>
It Number()s drizzle's sum() strings (sum returns string|null), skips null-method rows in `single`, and adds split rows on top with integer +. No division, no rounding, no floats anywhere — every value is already integer paise.

In todayStats add a 4th query to the Promise.all, mirroring reports.ts:86-105 but scoped to today+completed:
  select({ method: schema.orderPayments.method, total: sum(schema.orderPayments.amountPaise) })
  .from(orderPayments).innerJoin(orders, eq(orderPayments.orderId, orders.id))
  .where(and(eq(orderPayments.cafeId, cafeId), eq(orderPayments.kind,'payment'), isNull(orders.paymentMethod), eq(orders.cafeId,cafeId), gte(orders.createdAt, todayIso), eq(orders.status,'completed')))
  .groupBy(orderPayments.method)
Import isNull into orders.ts (current imports at :11 lack it). Refactor reports.ts to call foldPaymentBreakdown too and delete its inline loop at :108-125.

Second, harder problem the auditor did not name: an order completed via PATCH .../status with NO paymentMethod (orders.ts route :288) still adds to todayRevenuePaise and to no method row, so the rows STILL will not sum. Make it impossible to hide: compute unrecordedPaise as an exact residual, todayRevenuePaise - (cash+upi+card+online), in the repo. By construction Cash+UPI+Card+Online+Unrecorded === Total collected, to the paise, always. The dashboard renders the Unrecorded row only when > 0, in danger colour, so the gap is visible instead of silently short.

Refunds are deliberately out of scope here: refund() marks paymentStatus='refunded' but leaves status='completed', so refunded orders still count in revenue. That is pre-existing and must not be silently changed inside this work item — record it as a risk.

### API

No route or path change. GET /cafes/:cafeId/orders/stats response gains ONE additive field:
  200 { todayCount, todayRevenuePaise, todayGstPaise, byStatus, paymentBreakdownPaise: { cash, upi, card, online }, unrecordedPaise: number }
Add `unrecordedPaise: number` to OrderStatsResponse in packages/types/src/api.ts:221. Additive and non-breaking for existing consumers. The 15s cache in routes/orders.ts:224-231 needs no change.

### Web

apps/web/src/app/cafes/[id]/page.tsx:141-170 — inside the reconciliation <dl>, after the Online row and before the divider, add:
  {stats.unrecordedPaise > 0 ? <ReconRow label="Unrecorded" paise={stats.unrecordedPaise} /> : null}
with a one-line CardDescription note: "Completed orders with no tender recorded." No other web change — the split money now simply appears in the existing Cash/UPI rows.

### Tests

apps/api/src/orders/payment-breakdown.test.ts (new, pure):
- 'single-tender rows map straight through'
- 'skips a null-method row (unsettled counter order)'
- 'adds a split-tender row on top of an existing single-tender total for the same method'
- 'creates a method entry that only split tender produced'
- 'coerces drizzle sum() string totals to integer paise'
- 'treats a null sum as 0'
- '2000-paise bill split 1000 cash + 1000 upi contributes 1000 to each, never 2000 to one'
apps/api/src/routes/orders.test.ts (GET /orders/stats):
- 'returns unrecordedPaise so cash+upi+card+online+unrecorded equals todayRevenuePaise'
- 'unrecordedPaise is 0 when every completed order has a tender'
apps/api/src/routes/reports.test.ts:
- 'day report payment breakdown is unchanged after the shared-fold refactor (regression)'

### Files

- `apps/api/src/orders/payment-breakdown.ts`
- `apps/api/src/orders/payment-breakdown.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/reports.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/page.tsx`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/reports.test.ts`

---

<a id="kds-connection-truth"></a>

## 🔴 `kds-connection-truth` — The Live badge reflects real refresh state; expired sessions and dead polls are surfaced instead of swallowed

### Approach

Verified all three pointers. kitchen-board.tsx:96-102 catches everything and only toasts on manual refresh; :53-62 authedHeaders silently omits the Authorization header when getSession() returns null, so every poll 401s forever; :166-172 hard-codes an animate-ping green dot.

Put the state machine in a pure, unit-testable module apps/web/src/lib/kds-connection.ts (the board itself is untestable without heavy mocking, so the logic must not live in the component):
  export type ConnLevel = 'live' | 'retrying' | 'stale' | 'auth-expired';
  export interface ConnState { lastOkAt: number | null; failures: number; authExpired: boolean }
  export const initialConnState = (bootAt: number): ConnState
  export function onRefreshOk(s: ConnState, at: number): ConnState        // { lastOkAt: at, failures: 0, authExpired: false }
  export function onRefreshFail(s: ConnState, kind: 'network' | 'auth'): ConnState  // failures+1; auth sets authExpired
  export function connectionLevel(s: ConnState, now: number, refreshMs: number): ConnLevel
Rules: authExpired always wins → 'auth-expired'. failures === 0 → 'live'. failures 1-2 AND now-lastOkAt < 3*refreshMs → 'retrying'. Otherwise 'stale'. lastOkAt === null (server-rendered boot, no client poll yet) counts as fresh until the first tick.

In kitchen-board.tsx:
- Replace authedHeaders (:53-62) with `async function authedHeaders(): Promise<Record<string,string>>` that throws a new `SessionExpiredError` when getSession() returns no session or session.expires_at*1000 <= Date.now()+5000. Before throwing, attempt `supabase.auth.refreshSession()` exactly once and use the refreshed token if it comes back — a token expiring mid-service must not evict the kitchen.
- refresh() (:83-105): catch SessionExpiredError → setConn(onRefreshFail(c,'auth')); catch res.status===401/403 → same; any other throw → onRefreshFail(c,'network'); success → onRefreshOk(c, Date.now()). Keep the existing inFlight guard. Keep the manual-refresh toast but make it say why.
- Header (:165-184): render <ConnectionBadge level={...} lastOkAt={...} /> — green pulsing dot + "Live" only at level 'live'; amber static dot + "Reconnecting…" at 'retrying'; red at 'stale'. In every non-live state also render the timestamp "Last updated 14:12" (toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})) — the number a cook can act on. Render the stamp at 'live' too, dimmed; it costs nothing and it is the fastest way to notice a frozen tab.
- Above the columns, at 'stale' render a full-width red banner: "This board is not updating. Last updated 14:12 · N failed attempts" with the Refresh button inside it. At 'auth-expired' render a red banner "Signed out — the kitchen board has stopped receiving orders" with a Sign in link to /login?next=/cafes/{cafeId}/kitchen. Both banners must be readable across a room: text-base, not text-xs.
- Pause polling while document.hidden and force one refresh on visibilitychange → visible, so a tablet waking from sleep does not sit on a 40-minute-old snapshot showing a green dot.

### Web

apps/web/src/lib/kds-connection.ts (new, pure logic). apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx: authedHeaders :53-62 rewritten + SessionExpiredError; refresh() :83-105; poll effect :109-116 gains visibility handling; header :165-184 replaced with <ConnectionBadge>; new <DeadBoardBanner> and <SessionExpiredBanner> rendered above the column grid at :187.

### Tests

apps/web/src/lib/kds-connection.test.ts (new):
- 'a fresh success is live'
- 'one failure after a recent success is retrying, not live'
- 'three consecutive failures are stale'
- 'two failures older than three refresh intervals are stale even below the failure threshold'
- 'an auth failure is auth-expired regardless of failure count'
- 'a success clears failures and the auth-expired flag'
- 'never reports live when the last success is older than three refresh intervals'
- 'boot state with no client refresh yet is live'

### Files

- `apps/web/src/lib/kds-connection.ts`
- `apps/web/src/lib/kds-connection.test.ts`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`

---

<a id="kds-new-ticket-alert"></a>

## 🟠 `kds-new-ticket-alert` — A new ticket makes a noise, buzzes, badges the tab title, and shows a count in the shell nav from any screen

### Approach

Verified: kitchen-board.tsx:94-95 blindly setTickets(data.tickets) with no diff; there is no audio, no vibration, no title badge anywhere in the file; cafe-shell.tsx:56 has a plain Kitchen link with no badge.

Pure diff module apps/web/src/lib/kds-alerts.ts:
  export interface TicketDiff { newIds: string[]; cancelledIds: string[]; goneIds: string[] }
  export function diffTickets(prevIds: readonly string[], next: readonly { id: string; status: string }[]): TicketDiff
newIds = ids in next not in prev. cancelledIds = ids in next whose status === 'cancelled' (feeds the cancelled-ticket work item). goneIds = ids in prev absent from next (completed at the counter — no alert). First poll after a server-rendered boot must seed prevIds from initialTickets, otherwise every ticket on screen chimes on mount.

Sound without shipping an asset (an <audio src> would need a file in public/ and would be blocked by autoplay policy anyway): apps/web/src/lib/kds-chime.ts wraps a lazily-created AudioContext and plays two 880Hz/1320Hz sine blips of 120ms via OscillatorNode+GainNode. Browsers require a user gesture to unlock it, so the board renders a "Enable sound" button (Volume2 icon) in the header until ctx.state === 'running'; the preference persists in localStorage 'sangam:kds-sound:{cafeId}' and the button flips to a mute toggle after unlock. Fall back silently when AudioContext is unavailable — never throw into the poll loop.

On newIds.length > 0: chime, navigator.vibrate?.([200,100,200]) (guarded — desktop Chrome has no vibrate), and set document.title = `(${unseen}) Kitchen · Sangam`. Track unseenIds in a ref+state; clear on window focus AND on any click inside the board, then restore document.title to 'Kitchen · Sangam'. Render a "3 new" accent pill next to the ticket count at :159-163, and give brand-new ticket cards a 4-second accent ring (a `justArrived` set that self-clears via setTimeout) so a cook can see which of eleven cards is the new one.

Shell badge (the "visible from any screen" half). New cheap endpoint rather than making the shell fetch every ticket with items. New client component apps/web/src/app/cafes/[id]/components/kitchen-nav-badge.tsx polls it every 20s, pauses on document.hidden, fails silent (a nav badge must never surface an error), and renders a red count pill when pending+ready > 0 with a separate accent dot when qrUnpaid > 0. Mount it inside the Kitchen NavItem in cafe-shell.tsx:56 — change NavItem to accept an optional `trailing?: React.ReactNode` rendered right-aligned in the Link at :96-98.

### API

NEW GET /cafes/:cafeId/kitchen/counts (apps/api/src/routes/orders.ts, next to the existing tickets route at :196-209, same app.authenticate + findByIdAndOwner-or-404 rule).
  Request: no body, no query.
  200 { counts: { pending: number; preparing: number; ready: number; qrUnpaid: number } }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } } for another owner's cafe.
  401 unauthenticated.
Backed by a new repo method on OrdersRepository: kitchenCounts(cafeId: string): Promise<{ pending: number; preparing: number; ready: number; qrUnpaid: number }> — one query grouping by status over orders where status in (pending,preparing,ready), plus a count of source='qr' AND paymentStatus <> 'paid' AND status in (pending,preparing,ready). Add KitchenCountsResponse to packages/types/src/api.ts next to KitchenTicketsResponse:217. Cache 10s under cacheKey('orders', cafeId, 'kitchen', 'counts') and del it in the same places statsKey is deleted (order create, status patch, settle, refund).

### Web

apps/web/src/lib/kds-alerts.ts (new). apps/web/src/lib/kds-chime.ts (new). apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx: seed seenIds from initialTickets, diff at :94-95, sound toggle in the header at :165-184, "N new" pill at :159-163, justArrived ring on TicketCard :240-251. apps/web/src/app/cafes/[id]/components/kitchen-nav-badge.tsx (new client component). apps/web/src/app/cafes/[id]/components/cafe-shell.tsx: NavItem gains `trailing`, Kitchen item at :56 renders the badge, Link markup at :81-99.

### Tests

apps/web/src/lib/kds-alerts.test.ts (new):
- 'reports a ticket id present in next but not in prev as new'
- 'reports nothing new when the poll returns the same ids'
- 'a status change on an existing ticket is not a new ticket'
- 'a ticket that disappeared is goneIds, never newIds'
- 'a cancelled ticket appears in cancelledIds and not in newIds on the poll after it was already known'
- 'seeding from the initial server-rendered tickets means the first poll fires no alert'
- 'handles an empty previous set (first ever poll) without alerting on every ticket'
apps/api/src/routes/orders.test.ts (GET /cafes/:cafeId/kitchen/counts):
- 'returns pending/preparing/ready/qrUnpaid counts'
- 'returns 404 for a cafe the user does not own and never calls the repo'
- 'requires authentication'

### Files

- `apps/web/src/lib/kds-alerts.ts`
- `apps/web/src/lib/kds-alerts.test.ts`
- `apps/web/src/lib/kds-chime.ts`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/app/cafes/[id]/components/kitchen-nav-badge.tsx`
- `apps/web/src/app/cafes/[id]/components/cafe-shell.tsx`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/repositories/orders.ts`
- `packages/types/src/api.ts`
- `apps/api/src/routes/orders.test.ts`

---

<a id="cancelled-ticket-card"></a>

## 🟠 `cancelled-ticket-card` — A cancelled order stays on the board as a loud CANCELLED card the cook must acknowledge

### Approach

Verified: repositories/orders.ts:210-222 filters status in (pending,preparing,ready) so a cancel makes the ticket vanish inside 10s; there is no cancelledAt column (schema/orders.ts:40-103 confirmed) and updateStatus (:269-292) only stamps paidAt.

Add orders.cancelled_at and set it in updateStatus when the next status is 'cancelled'. Widen listKitchenTickets to also return cancelled orders whose cancelledAt is within a 15-minute window (long enough to survive a cook's tea break; short enough that the board is not a graveyard):
  where(and(eq(orders.cafeId, cafeId), or(
    inArray(orders.status, ['pending','preparing','ready']),
    and(eq(orders.status,'cancelled'), gte(orders.cancelledAt, new Date(Date.now() - 15*60_000).toISOString()))
  )))
Import `or` and `isNotNull` into repositories/orders.ts.

On the board, cancelled tickets are NOT placed in a column (they are not work). Render them above the grid, full-width, in a red block: "CANCELLED — INV/2026-27/000412 · Table 4", the item lines struck through, and a large "Got it" button. Acknowledgement is per-device and local (there is no server-side ack and inventing one is out of scope): dismissed ids go to localStorage 'sangam:kds-ack-cancelled:{cafeId}' as {id, at} entries, pruned on read to entries younger than 24h so the key cannot grow forever. A ticket cancelled while the tab was closed still shows on next load if within the 15-minute window — deliberate.

Also fix a latent bug this exposes: COLUMNS at :31-51 filters by status, so without the above a cancelled ticket in the feed would silently vanish from the grid; with the change it must be explicitly excluded from `active` at :146-149 (tickets.filter(t => t.status === col.status) already does this correctly for 'cancelled' — verify, do not assume) and it must never render a bump button.

### Schema

packages/db/src/schema/orders.ts, orders table (after paidAt at :96):
  cancelledAt: timestamp({ withTimezone: true, mode: 'string' })
→ SQL: ALTER TABLE orders ADD COLUMN cancelled_at timestamptz;
Index for the window scan:
  CREATE INDEX orders_cafe_cancelled_at_idx ON orders (cafe_id, cancelled_at);
(declare as index('orders_cafe_cancelled_at_idx').on(table.cafeId, table.cancelledAt) at :98-102).
Nullable and additive — no backfill required, but existing cancelled orders have cancelled_at NULL and therefore never appear on the board. That is correct (they are historical) and must be stated in the migration comment. Add `cancelledAt: string | null` to the Order interface in packages/types/src/domain.ts:130.

### API

No new route. GET /cafes/:cafeId/kitchen/tickets response is unchanged in shape but the ticket list may now include entries with status 'cancelled' and a non-null cancelledAt. Consumers that assumed only pending/preparing/ready must be checked — the only consumer is the KDS (grepped: repositories/orders.ts:210, routes/orders.ts:206, kitchen page + board). PATCH /cafes/:cafeId/orders/:orderId/status is unchanged externally; internally updateStatus now sets cancelled_at = now() when status === 'cancelled'.

### Web

apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx: split tickets into `cancelled` and `active` at :146-149; new <CancelledStrip> rendered above the grid at :187; ack list helpers. apps/web/src/lib/kds-cancel-ack.ts (new, pure + localStorage-guarded): readAcked(cafeId, now), ack(cafeId, id, now), pruneAcked(entries, now).

### Tests

apps/web/src/lib/kds-cancel-ack.test.ts (new):
- 'acknowledging an id hides it from the next read'
- 'prunes acknowledgements older than 24 hours'
- 'returns an empty list when localStorage is unavailable'
- 'ignores corrupt stored JSON'
apps/api/src/routes/orders.test.ts:
- 'PATCH status to cancelled asks the repo to record the cancellation' (assert updateStatus called with 'cancelled')
- 'kitchen tickets response passes through a cancelled ticket with cancelledAt'
apps/api/src/routes/orders.test.ts mock repo + apps/api/src/routes/public.test.ts:106 + apps/api/src/routes/payments.test.ts:93 makeOrder factories must gain cancelledAt: null (type-level breakage otherwise).

### Files

- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations`
- `packages/types/src/domain.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/lib/kds-cancel-ack.ts`
- `apps/web/src/lib/kds-cancel-ack.test.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/payments.test.ts`

---

<a id="inline-86"></a>

## 🟠 `inline-86` — 86 an item in two taps from the order pad and from the kitchen board, with an audit trail

### Approach

Verified: the PATCH endpoint already exists and does exactly what is needed — apps/api/src/routes/menu.ts:246-281, body updateItemBodySchema is .partial() so { isAvailable: false } alone is valid, it 404s for another owner's cafe and busts the menu cache at :278. menu-editor.tsx:272-286 is the existing caller and is the right template (optimistic flip, toast, revert on failure). ai-console.ts:212 already 86s via the same repo call — so the API side is done; this is a UI + audit item.

Shared client helper apps/web/src/lib/menu-availability.ts:
  export async function setItemAvailability(cafeId, itemId, isAvailable): Promise<void>
doing the authed PATCH so the pad, the board and the editor cannot drift apart.

Counter pad (apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx). Auditor said :558-568; the real tile grid is :570-583 and ItemTile is defined at :722-804. Give ItemTile an `on86` prop and a long-press/context affordance: onContextMenu (right click / long-press on iOS Safari fires contextmenu) plus a pointerdown timer of 500ms, both opening a small confirm popover "86 Paneer Tikka? It disappears from the counter and the QR menu." with 86 / Cancel. Do not use a bare icon button — the tile is the fast tap target and must not grow a mis-tap zone. On success: call the existing onChange path to flip the local categories prop (lift `categories` into component state, seeded from props, since liveCategories at :312-318 filters on isAvailable and is currently derived straight from an immutable prop — this is a real refactor, not a one-liner), drop the item from the cart if present, toast "Paneer Tikka 86'd". On failure revert and toast.

Kitchen board (kitchen-board.tsx:304-322). Under the bump button add a compact secondary row of the ticket's distinct item names as 86 chips ("86 Paneer"), each opening the same confirm. Cooks wear gloves — 44px minimum touch targets, and the confirm must be a modal-style popover, not a hover menu. After a successful 86 the board is not the source of menu truth, so just toast; the next poll needs no change.

Audit: 86'ing directly removes revenue and is exactly the kind of action the house rule covers, and menu.ts currently writes no audit at all. Add auditRepository to MenuRoutesOptions and record ONLY when the patch contains isAvailable and the value actually changed:
  action 'menu.item_availability', entityType 'menu_item', entityId itemId,
  summary `86'd "Paneer Tikka"` / `Restored "Paneer Tikka"`, metadata { isAvailable }.
Record it after updateItem returns (so we know the item existed and belonged to the cafe) and never let an audit failure fail the PATCH.

### API

No new route, no contract change. PATCH /cafes/:cafeId/menu/items/:itemId — unchanged request { isAvailable: boolean }, unchanged 200 { item: MenuItem }, 404 for a foreign cafe, 400 INVALID_CATEGORY unchanged. Only side effect added: an audit row on availability changes. MenuRoutesOptions in apps/api/src/routes/menu.ts:12-15 gains `auditRepository?: AuditLogsRepository`.

### Web

apps/web/src/lib/menu-availability.ts (new). apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx: categories lifted to state at :169-180, liveCategories :312-318, ItemTile :722-804 gains long-press + confirm, tile grid :570-583 passes on86. apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx: 86 chips under the bump at :304-322, cafeId already in scope. apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:272-286 switched to the shared helper.

### Tests

apps/api/src/routes/menu.test.ts:
- 'PATCH isAvailable:false writes a menu.item_availability audit entry naming the item'
- 'PATCH isAvailable:true writes a restore audit entry'
- 'PATCH that does not touch isAvailable writes no audit entry'
- 'an audit failure does not fail the PATCH' (audit mock rejects, expect 200)
- 'PATCH for a cafe the user does not own is 404 and writes no audit entry'
apps/web/src/lib/menu-availability.test.ts (new, fetch mocked):
- 'PATCHes isAvailable to the menu item endpoint with the bearer token'
- 'throws with the server error message on a 4xx'

### Files

- `apps/web/src/lib/menu-availability.ts`
- `apps/web/src/lib/menu-availability.test.ts`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`

---

<a id="reject-only-bad-lines"></a>

## 🟠 `reject-only-bad-lines` — An unavailable item rejects its own line instead of 400-ing the whole cart

### Approach

Verified: apps/api/src/orders/build.ts:155-171 throws inside lines.map, so the FIRST bad line aborts the build and routes/orders.ts:142-149 returns a bare 400 with a message and no ids; public.ts:117-122 has the identical shape. The cashier is told "Paneer Tikka is currently unavailable" with an eight-line cart and no idea which row to fix.

build.ts changes:
- OrderBuildError gains a third readonly field: `menuItemIds: string[]`. Constructor (code, message, menuItemIds).
- Replace the throwing map with a two-pass collect: walk every line, accumulate `missing: string[]` and `unavailable: {id,name}[]`, and only then throw once. If missing.length > 0 throw INVALID_ITEM with all missing ids (an unknown id is a client bug, not a service event, so it stays first). Else if unavailable.length > 0 throw ITEM_UNAVAILABLE with all their ids and a message listing every name: `Paneer Tikka, Masala Chai are no longer available`. Singular/plural handled.
- Every downstream money calculation is untouched: the built items array is only produced when the build succeeds, so no partial totals are ever computed server-side. The server never silently drops a line and charges for the rest — dropping is an explicit client decision followed by a fresh POST.

Both routes pass err.menuItemIds through as `details.menuItemIds` (ApiError.details is already typed Record<string, unknown> in packages/types/src/api.ts:30-34, so this needs no type change).

Counter web (order-builder.tsx handleSubmit :402-416): in the non-network catch, parse the error body. authedFetch at :84-90 currently throws away the body and keeps only the message — change it to throw an `ApiRequestError extends Error { code: string; details?: Record<string, unknown> }` so details survive. On code ITEM_UNAVAILABLE|INVALID_ITEM with details.menuItemIds: remove exactly those ids from the cart map, mark them unavailable in the lifted categories state (so the tiles grey out immediately), and set the inline error to "Removed 2 unavailable items: Paneer Tikka, Masala Chai. Check the order and place it again." Never auto-resubmit — the total changed and the customer is standing there.

Diner web (diner-order.tsx placeOrder :308-317): same treatment, message worded for a guest ("Sorry, Paneer Tikka just ran out — we've removed it. Please review your order.").

### API

POST /cafes/:cafeId/orders and POST /public/cafes/:slug/orders — success responses unchanged. Error body gains details:
  400 { error: { code: 'ITEM_UNAVAILABLE', message: 'Paneer Tikka, Masala Chai are no longer available', details: { menuItemIds: ['<uuid>','<uuid>'] } } }
  400 { error: { code: 'INVALID_ITEM', message: 'Some items are not on this menu', details: { menuItemIds: ['<uuid>'] } } }
Both codes and both statuses are unchanged, so existing clients keep working; details is additive.

### Web

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx: authedFetch :68-93 (carry code+details), handleSubmit catch :402-416, cart/categories pruning. apps/web/src/app/m/[slug]/diner-order.tsx: placeOrder :308-317 error branch, cart pruning. Both surface the removal in their existing inline error slot (order-builder CartPanel :887-894; diner cart :532-539).

### Tests

apps/api/src/orders/build.test.ts:
- 'collects every unavailable item, not just the first'
- 'ITEM_UNAVAILABLE carries the menuItemIds of all unavailable lines'
- 'INVALID_ITEM carries the unknown menuItemIds'
- 'reports unknown items before unavailable ones when both are present'
- 'a cart with one bad line among seven good ones names only the bad line'
- 'still throws nothing and computes identical totals for an all-valid cart (regression)'
apps/api/src/routes/orders.test.ts:
- 'POST /orders returns 400 with details.menuItemIds when an item is 86'd'
apps/api/src/routes/public.test.ts:
- 'public POST returns 400 with details.menuItemIds when an item is 86'd'

### Files

- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/m/[slug]/diner-order.tsx`

---

<a id="per-line-notes"></a>

## 🟠 `per-line-notes` — Per-item instructions can actually be entered — at the counter and by the diner

### Approach

Verified end to end: order_items.notes exists (schema/orders.ts:124), NewOrderItem.notes exists (repositories/orders.ts:21), buildOrder passes line.notes through (:169), both zod schemas already accept items[].notes max 200 (routes/orders.ts:53, routes/public.ts:42), the KOT prints it (print-views.tsx:173) and the KDS renders it (kitchen-board.tsx:290-292). Nothing on either entry screen ever sets it. This is purely a web work item — zero API or schema change.

Because both builders are large client components, extract the payload assembly into a pure module so it is testable without rendering: apps/web/src/lib/order-payload.ts
  export interface CounterLine { menuItemId: string; quantity: number; notes?: string }
  export function buildCounterOrderPayload(input): CreateOrderRequest
  export function buildDinerOrderPayload(input): PublicCreateOrderRequest
Rules the tests pin down: notes are trimmed; an empty or whitespace-only note is omitted entirely (never sent as ""); notes are truncated to 200 chars client-side so a paste can never 400 the whole order; the order-level note is truncated to 500. Money is untouched — a note has no price, and this must stay true (no modifier pricing is being added here).

Counter (order-builder.tsx). CartLine at :45-48 gains `notes?: string`. New mutation `setLineNotes(itemId, notes)` next to setQuantity :248-257, preserving the Map identity pattern. Cart row markup :910-946: add a StickyNote icon button after the Trash2 button that toggles an inline Input under the row (id `o-line-note-{itemId}`, maxLength 200, placeholder "No sugar, less spicy…", aria-label `Note for {name}`); the button carries a filled state and the note renders as a one-line italic caption under the item name when collapsed, so an existing note is never hidden behind a click. Payload at :348-368 switches to buildCounterOrderPayload. resetForm at :419-433 clears notes with the cart (it already does via setCart(new Map())).

Diner (diner-order.tsx). The cart is `Map<string, number>` at :67 — widen to `Map<string, { quantity: number; notes?: string }>`; this touches inc/dec/cartLines/itemCount/subtotal, so budget for it rather than treating it as an add-a-field. Cart rows :544-567 get an "Add note" text button per line expanding to an Input (maxLength 200). Below the name/phone fields at :570-593 add a Field "Anything the kitchen should know?" → Input maxLength 500 feeding body.notes. Payload :297-305 switches to buildDinerOrderPayload.

### API

none — POST /cafes/:cafeId/orders and POST /public/cafes/:slug/orders already accept items[].notes (≤200 chars) and notes (≤500). The only change is that the web clients now populate them.

### Web

apps/web/src/lib/order-payload.ts (new). apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx: CartLine :45-48, setLineNotes near :248, cart rows :899-950, payload :348-368. apps/web/src/app/m/[slug]/diner-order.tsx: cart state :67 and every derived use, cart rows :544-567, order-note field after :592, payload :297-305.

### Tests

apps/web/src/lib/order-payload.test.ts (new):
- 'includes a trimmed per-line note'
- 'omits the notes key entirely for an empty or whitespace-only note'
- 'truncates a per-line note to 200 characters'
- 'truncates the order-level note to 500 characters'
- 'keeps one line's note off another line'
- 'a note never appears in any money field and the item quantity is untouched'
- 'diner payload omits counter-only fields (discount, serviceChargeBp, tableSessionId)'
- 'counter payload preserves the existing discount/charges/roundOff shape (regression)'

### Files

- `apps/web/src/lib/order-payload.ts`
- `apps/web/src/lib/order-payload.test.ts`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/m/[slug]/diner-order.tsx`

---

<a id="station-routing"></a>

## 🟠 `station-routing` — Per-station routing: a station on every item, a station view on the board, and per-item bumping

### Approach

Verified: `station` appears nowhere in the repo (grepped apps + packages). Every pointer is correct — menu_items at packages/db/src/schema/menu.ts:37-71, order_items at packages/db/src/schema/orders.ts:105-127, the ticket query at repositories/orders.ts:210-222, the route at routes/orders.ts:196-209.

Station as a free-text key, not an enum and not a new table: cafes name their stations differently ("chai counter", "tandoor", "shakes") and a lookup table plus CRUD screens is a week of work this theme does not need. menu_items.station holds a normalised key (trimmed, lowercased, ≤24 chars). NULL means the default station and the API coalesces it to 'kitchen', so a cafe that never touches the feature keeps exactly one board and needs no migration of its data.

Per-item bumping needs item-level state, so order_items gains status + readyAt. The parent order status becomes derived, computed in one pure function so both the item PATCH and the tests agree:
  apps/api/src/orders/ticket-status.ts
  export function deriveOrderStatus(items: {status: OrderItemStatus}[]): 'pending'|'preparing'|'ready'
  all ready → 'ready'; any preparing or ready → 'preparing'; else 'pending'.
The existing order-level PATCH .../status keeps working and, when it sets ready/preparing, cascades the same value onto all of that order's items inside the transaction — otherwise a counter-side bump and a station bump disagree and the derived status flaps.

Repo changes (apps/api/src/repositories/orders.ts):
- listKitchenTickets(cafeId, opts?: { station?: string }) — BREAKING signature change; when station is given, restrict to orders having at least one matching item via an EXISTS subquery on order_items with coalesce(station_snapshot,'kitchen') = station, AND filter the returned items to that station. Document loudly that the returned OrderWithItems is a station VIEW: `items` is not the whole order. Totals on the ticket are still the whole order's totals — the KDS prints no prices, so no money is ever apportioned per station. That rule is absolute for this work item: nothing splits a bill by station.
- listStations(cafeId): Promise<{ key: string; itemCount: number }[]> — select distinct coalesce(station,'kitchen') with counts over menu_items.
- updateItemStatus(orderId, cafeId, itemId, status): in one transaction, verify the item belongs to that order and cafe, set status (+ readyAt when 'ready'), re-read the order's items, apply deriveOrderStatus to the parent order, return { item, order }.

Web: station chips in the KDS header persisted to localStorage 'sangam:kds-station:{cafeId}' and appended to the poll URL. With a station selected, each item line gets its own bump button and the order-level bump is replaced by a disabled "Waiting on other stations" hint once this station's lines are all ready. With 'All' selected the board behaves exactly as today. Menu editor gains a station text input with a datalist of existing station keys.

### Schema

Migration 0013 (drizzle-kit generate; additive except for the backfill).
packages/db/src/schema/menu.ts, menuItems (after isAvailable :58):
  station: text()                            → ALTER TABLE menu_items ADD COLUMN station text;
  index('menu_items_cafe_station_idx').on(table.cafeId, table.station)
packages/db/src/schema/orders.ts, add above the orders table:
  export const orderItemStatusValues = ['pending','preparing','ready'] as const;
orderItems (after notes :124):
  stationSnapshot: text()                    → ALTER TABLE order_items ADD COLUMN station_snapshot text;
  status: text({ enum: orderItemStatusValues }).notNull().default('pending')
                                             → ALTER TABLE order_items ADD COLUMN status text NOT NULL DEFAULT 'pending';
  readyAt: timestamp({ withTimezone: true, mode: 'string' })
                                             → ALTER TABLE order_items ADD COLUMN ready_at timestamptz;
  index('order_items_station_idx').on(table.stationSnapshot)
  index('order_items_order_status_idx').on(table.orderId, table.status)
REQUIRED BACKFILL, in the same migration file after the ALTERs:
  UPDATE order_items SET status = 'ready'
   WHERE order_id IN (SELECT id FROM orders WHERE status IN ('ready','completed','cancelled'));
Without it every historical order reads as fully un-started and any future "all items ready" logic misfires. The DEFAULT keeps the column safe for an older API instance still running mid-deploy.
packages/types/src/domain.ts: MenuItem gains `station: string | null`; OrderItem gains `stationSnapshot: string | null`, `status: OrderItemStatus`, `readyAt: string | null`; export type OrderItemStatus = 'pending'|'preparing'|'ready'.

### API

1) GET /cafes/:cafeId/kitchen/tickets?station=<key>  (routes/orders.ts:196-209)
   query: z.object({ station: z.string().trim().toLowerCase().max(24).optional() })
   200 { tickets: OrderWithItems[], station: string | null }  — `station` echoes the applied filter (null for all). Adding a key to the object is additive; KitchenTicketsResponse in packages/types/src/api.ts:217 gains `station: string | null`.
   404 { error: { code:'NOT_FOUND', message:'Cafe not found' } } · 401 unauthenticated · 400 VALIDATION_ERROR for a >24-char station.
2) GET /cafes/:cafeId/kitchen/stations  (new)
   200 { stations: Array<{ key: string; itemCount: number }> } — always includes 'kitchen'.
   404 foreign cafe · 401 unauthenticated.
3) PATCH /cafes/:cafeId/orders/:orderId/items/:itemId/status  (new)
   body { status: 'preparing' | 'ready' }
   200 { item: OrderItem, order: Order }   — order.status is the newly derived value.
   400 { error: { code:'INVALID_TRANSITION', message:'Cannot move a ready item back to preparing' } }
   404 for a foreign cafe, an unknown order, or an item not on that order (never 403).
   Busts cacheKey('orders', cafeId, 'stats','today') and the kitchen counts key.
4) POST/PATCH menu items (routes/menu.ts:31-44 and :50-66) gain `station: z.string().trim().toLowerCase().max(24)` (nullable on the PATCH schema). Response shape unchanged.

### Web

apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx — station chips in the header (:152-185), station appended to the poll URL (:89), station persisted via a new apps/web/src/lib/kds-station.ts, per-item bump buttons in TicketCard's item list (:282-296) and the bump block at :304-322. apps/web/src/app/cafes/[id]/kitchen/page.tsx — fetch stations alongside tickets for the first paint (:20-23) and pass to the board. apps/web/src/app/cafes/[id]/menu/menu-editor.tsx — station input with a <datalist> of known keys in the item edit form. apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx — group the KOT item list by station with a station sub-heading when the order spans more than one (:167-176), still with no prices.

### Tests

apps/api/src/orders/ticket-status.test.ts (new, pure):
- 'all items ready derives ready'
- 'one item ready and one pending derives preparing'
- 'every item pending derives pending'
- 'a single-item order tracks that item exactly'
- 'an empty item list derives pending'
apps/api/src/routes/orders.test.ts:
- 'GET kitchen tickets passes the station filter through to the repository'
- 'GET kitchen tickets with no station passes undefined and echoes station:null'
- 'GET kitchen tickets rejects a station longer than 24 characters with 400'
- 'GET kitchen stations returns the cafe station list'
- 'GET kitchen stations 404s for a cafe the user does not own'
- 'PATCH item status to ready returns the item and the re-derived order'
- 'PATCH item status to preparing on a ready item is 400 INVALID_TRANSITION'
- 'PATCH item status 404s for an item belonging to another order'
- 'PATCH item status 404s (not 403) for another owner's cafe and never calls the repo'
apps/api/src/routes/menu.test.ts:
- 'POST menu item accepts and lowercases a station'
- 'PATCH menu item can clear the station to null'
apps/api/src/orders/build.test.ts:
- 'snapshots the item station onto the order line'
- 'a menu item with no station snapshots null (defaults to kitchen at read time)'
apps/web/src/lib/kds-station.test.ts (new):
- 'remembers the last selected station per cafe'
- 'falls back to all when the stored station no longer exists'

### Files

- `packages/db/src/schema/menu.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/api/src/orders/ticket-status.ts`
- `apps/api/src/orders/ticket-status.test.ts`
- `apps/api/src/orders/build.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/menu.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/menu.ts`
- `apps/web/src/lib/kds-station.ts`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/app/cafes/[id]/kitchen/page.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`

---

<a id="offline-kot"></a>

## 🟠 `offline-kot` — An offline order still prints a kitchen slip and a clearly-provisional bill

### Approach

Verified: order-builder.tsx:383-393 opens /cafes/{id}/orders/{orderId}?autoprint=kot in a new tab — that route is server-rendered and needs the network AND a server-allocated order id, so it cannot work on the offline path at :405-411, which today only enqueues and toasts.

Extract the slip from the order-detail page so one renderer serves both paths:
- apps/web/src/lib/kot-data.ts (new, pure): interface KotData { orderNumber: string|null; provisional: boolean; queueRef: string|null; createdAt: string; tableLabel: string|null; source: OrderSource; items: {quantity:number; name:string; notes:string|null; station:string|null}[]; notes: string|null } plus kotFromOrder(order: OrderWithItems) and kotFromQueued(payload: CreateOrderRequest, categories: MenuCategoryWithItems[], queueId: string, at: Date).
- apps/web/src/components/print/kot-slip.tsx (new): the 80mm markup lifted verbatim from print-views.tsx:150-187, driven by KotData. When provisional, it prints a bold centred banner *** NOT SYNCED *** and `Ref: OFF-{first 6 of queueRef}` in place of the bill number, so the kitchen slip can be matched to the real order after sync. print-views.tsx's Kot() becomes <KotSlip data={kotFromOrder(order)} />.

Offline branch (:402-416): build the KotData from the queued payload BEFORE the toast, set it in state, and window.print() from a hidden print container rendered inside the builder itself (a new tab cannot be used — there is no server to render it). Reuse the same @page 80mm auto / margin 0 block and the print-only container pattern from print-views.tsx:123-143. Respect the existing autoPrintKot preference (:208-229) and also add a manual "Reprint last offline KOT" button on the offline badge (:667-693) for the printer that was warming up.

Provisional bill. Do NOT print a numbered bill offline: the invoice serial is allocated inside the create() transaction (repositories/orders.ts:112-125) and is legally required to be gapless under CGST Rule 46(b). Client-side numbering would either duplicate or hole the series. Instead print a slip headed "PROVISIONAL BILL — NOT A TAX INVOICE", with the same integer-paise money the cart already computed. Money rule: the provisional total MUST come from the existing computeBill() result (order-builder.tsx:283-309) — the exact same pure function and the same integer paise inputs the server will use — and never be re-derived from a formatted rupee string. discountPaise / serviceChargePaise / packagingChargePaise / taxPaise / roundOffPaise are printed as-is, so subtotal − discount + service + packaging + tax + roundOff === total holds to the paise and the later real invoice is byte-identical. A new apps/web/src/components/print/provisional-bill.tsx renders it; the slip carries the same OFF-ref so the numbered invoice can be handed over on sync. After a queued order syncs, the sender callback (:193-203) toasts with an action that opens the real order for a proper bill print.

Queue depth on the kitchen page (the second half of gap 9): the queue is localStorage and therefore per-device, so this is only meaningful when the counter and the board share a tablet. Read pendingCount(cafeId) from apps/web/src/lib/offline-queue.ts on each KDS poll tick and, when > 0, show an amber banner "3 orders taken on this device have not reached the kitchen yet". State the per-device limitation in the banner copy and in the code comment — do not imply cross-device visibility that does not exist.

### API

none. No offline order is ever numbered client-side; the invoice serial stays server-allocated and gapless.

### Web

apps/web/src/lib/kot-data.ts (new). apps/web/src/components/print/kot-slip.tsx (new). apps/web/src/components/print/provisional-bill.tsx (new). apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx: Kot() at :150-187 reduced to a KotSlip call. apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx: autoprint hoisted from :383-393, offline branch :402-416, print container + @page block added near :481, OfflineBadge :667-693 gains the reprint action. apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx: unsynced-queue banner near the header.

### Tests

apps/web/src/lib/kot-data.test.ts (new):
- 'kotFromOrder maps quantity, snapshot name and per-line notes'
- 'kotFromOrder is not provisional and carries the real order number'
- 'kotFromQueued resolves item names from the menu categories'
- 'kotFromQueued marks the slip provisional with a null order number'
- 'kotFromQueued exposes a queueRef so the slip can be matched after sync'
- 'kotFromQueued carries per-line notes from the queued payload'
- 'kotFromQueued keeps a line whose menu item has since been deleted, labelled Unknown item' (a slip that silently drops a dish is worse than one that flags it)
apps/web/src/lib/offline-queue.test.ts:
- 'a queued payload round-trips per-line notes through localStorage' (guards the note work against the queue)
Manual QA, not automatable here: print an offline KOT and a provisional bill on a real 80mm thermal printer and confirm the NOT SYNCED banner and OFF-ref are legible.

### Files

- `apps/web/src/lib/kot-data.ts`
- `apps/web/src/lib/kot-data.test.ts`
- `apps/web/src/components/print/kot-slip.tsx`
- `apps/web/src/components/print/provisional-bill.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/lib/offline-queue.test.ts`

---

<a id="stock-decrement-auto-86"></a>

## 🟠 `stock-decrement-auto-86` — Stock actually moves when an order is placed, and an item that hits zero 86s itself

### Approach

Verified: apps/api/src/repositories/inventory.ts:98-116 decrementForOrder is fully written and its own doc comment at :23-28 points at "the integration note in routes/orders.ts" — which does not exist. Grepped: nothing calls it. routes/orders.ts:174 is the create call; the QR path at routes/public.ts:148 has the same hole and the auditor did not mention it.

Change the repo method to report what it emptied so 86ing is automatic rather than a second manual step:
  decrementForOrder(cafeId, lines): Promise<{ depleted: string[] }>
Implement with a single UPDATE ... WHERE menu_item_id = ANY(...) AND stock_qty IS NOT NULL, using a values-join or a per-line loop kept inside one db.transaction, and `.returning({ menuItemId, stockQty })`; depleted = rows whose new stockQty <= 0. This is a BREAKING signature change for the InventoryRepository interface — the mock in apps/api/src/routes/inventory.test.ts must be updated.

Wire it into BOTH creation paths, after the order is committed:
  const stockLines = built.items.filter(i => i.menuItemId).map(i => ({ menuItemId: i.menuItemId!, quantity: i.quantity }));
  try { const { depleted } = await inventoryRepo.decrementForOrder(cafeId, stockLines);
        for (const id of depleted) { await menuRepo.updateItem(id, cafeId, { isAvailable: false }); }
        if (depleted.length) { await cache.del(cacheKey('menu', cafeId, 'full')); await auditRepo.record({ ..., action: 'menu.auto_86', summary: `Auto-86'd N items — stock reached zero`, metadata: { menuItemIds: depleted } }); } }
  catch (err) { request.log.error({ err }, 'stock decrement failed'); }
The try/catch is load-bearing, not defensive noise: the order row is already committed and the customer has already been told it was placed. A stock bookkeeping failure must never turn a successful order into a 500 that makes the cashier punch it twice.

OrdersRoutesOptions (routes/orders.ts:17-22) and PublicRoutesOptions (routes/public.ts:15-19) each gain `inventoryRepository?: InventoryRepository`, defaulting to createDrizzleInventoryRepo(app.db) exactly like the existing auditRepository default at :109. publicRoutes also needs an auditRepository option, which it currently lacks.

The menu cache key must match menu.ts:81-83 (cacheKey('menu', cafeId, 'full')) or the QR menu keeps selling the depleted item for up to 60s — extract that key builder into apps/api/src/lib/cache-keys.ts and use it from both files rather than duplicating the string.

Once an item is auto-86'd, the existing buildOrder availability check (build.ts:160-162) blocks further sales, and with the reject-only-bad-lines item shipped, the cashier gets a precise line-level rejection instead of a dead cart. That is why these two land in this order.

### Schema

none — menu_item_stock already exists (packages/db/src/schema/inventory.ts) with a unique index on menu_item_id.

### API

No route or contract change. POST /cafes/:cafeId/orders and POST /public/cafes/:slug/orders keep their 201 { order } / 201 { order: PublicOrder } responses and all existing error codes. Two new side effects: tracked stock decrements, and an item reaching zero flips isAvailable to false with a `menu.auto_86` audit row. Untracked items (stock_qty IS NULL) are untouched, so a cafe that has not opted into stock tracking sees no behaviour change at all.

### Web

none. The inventory screen and the QR menu already read isAvailable and stockQty, so they reflect the change with no edit.

### Tests

apps/api/src/routes/orders.test.ts:
- 'decrements tracked stock for every line after a successful order'
- 'auto-86s a menu item whose stock reached zero'
- 'writes a menu.auto_86 audit entry naming the depleted item ids'
- 'does not 86 anything when no item was depleted, and writes no audit entry'
- 'still returns 201 when the stock decrement throws' (inventory mock rejects — the order must not fail)
- 'skips lines with a null menuItemId'
apps/api/src/routes/public.test.ts:
- 'a QR order decrements stock and auto-86s a depleted item'
- 'still returns 201 when the stock decrement throws'
apps/api/src/routes/inventory.test.ts:
- 'decrementForOrder mock updated to the { depleted } return shape (regression)'

### Files

- `apps/api/src/repositories/inventory.ts`
- `apps/api/src/lib/cache-keys.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/inventory.test.ts`

---

## Order of work

1. 1. split-tender-recon — self-contained, touches no file another item needs, and lands the shared foldPaymentBreakdown helper. Ship it first so the dashboard stops lying while the rest is in flight.
2. 2. kds-connection-truth — must precede every other KDS change. Until the board reports its own state honestly, you cannot tell whether a new feature is broken or the poll is dead, and you will chase ghosts through items 3-5.
3. 3. cancelled-ticket-card — adds orders.cancelled_at and widens the ticket feed. Do it before station routing so the migration ordering is simple (0013 = cancelled_at, 0014 = station + item status) and the board's ticket-partitioning refactor happens once, not twice.
4. 4. kds-new-ticket-alert — depends on the diff loop landing in a board that already partitions cancelled from active (item 3 supplies cancelledIds from the same diff function).
5. 5. reject-only-bad-lines — pure API + error-handling change, no KDS dependency, but it MUST precede both 86 items: the moment 86ing becomes a two-tap action, mid-service rejections go from rare to routine and a whole-cart 400 becomes the daily failure.
6. 6. inline-86 — needs item 5's line-level rejection to be safe, and needs the categories-lifted-to-state refactor in the order builder that item 7 also relies on.
7. 7. stock-decrement-auto-86 — reuses item 6's audit wiring and item 5's rejection path; auto-86 is the same code path as manual 86 with a different actor.
8. 8. per-line-notes — independent of the API work, but scheduled here so the order-builder cart-row surgery happens after item 6 has already restructured that component; doing both at once guarantees conflicts.
9. 9. station-routing — the largest item and the one with the real backfill. It rewrites listKitchenTickets' signature (breaking three test files) and the ticket card's bump block, so it must land after the board is stable and observable. Its KOT station grouping also depends on item 10's extracted KotSlip if both are in flight — if you reverse 9 and 10, do the extraction first.
10. 10. offline-kot — last. It extracts the KOT renderer, which item 9 wants to group by station, and it is the only item that needs real thermal-printer QA, so it should not block anything behind it.

## Risks

- BREAKING: listKitchenTickets(cafeId) becomes listKitchenTickets(cafeId, opts?). Three test files build mock OrdersRepository objects that will fail to typecheck — apps/api/src/routes/orders.test.ts:135, apps/api/src/routes/public.test.ts:106, apps/api/src/routes/payments.test.ts:93. Same for InventoryRepository.decrementForOrder's new { depleted } return shape in apps/api/src/routes/inventory.test.ts.
- BREAKING: adding cancelledAt to Order and station/status/readyAt to OrderItem in packages/types/src/domain.ts breaks every makeOrder/makeOrderItem factory in the API test suite and any web code constructing these objects literally. Cheap but noisy — budget a typecheck-driven sweep, not a targeted edit.
- REQUIRED BACKFILL: order_items.status defaults to 'pending', so without the UPDATE that sets 'ready' for items of ready/completed/cancelled orders, every historical order reads as un-started and deriveOrderStatus misbehaves on any order that is later touched. The backfill is a full-table UPDATE on the largest table in the schema — run it in batches on a live cafe and expect lock contention during service hours; schedule the migration for a closed-hours window.
- The station filter returns a partial item list on a full OrderWithItems shape. Any future consumer that assumes ticket.items is the whole order (a report, the AI console, a KOT reprint) will silently under-count. Mitigate by naming the response field `station` and documenting the view semantics on the repo method — but this is a real footgun that a reviewer must watch for.
- Stock decrement happens after the order transaction commits, not inside it, because the inventory repo is a separate boundary. A crash in the window between commit and decrement leaks stock with no compensating entry. Accepted deliberately (the alternative is threading a transaction handle across repositories, which is a larger architectural change); it is logged, and the inventory screen already supports a manual correction.
- Audio on the KDS requires a user gesture to unlock the AudioContext. If nobody ever presses 'Enable sound' after a tablet reboot, the board is silent again and looks exactly like the bug we are fixing. The Enable-sound button must be visually loud while sound is locked, and the ui-audit skill should review that state before ship.
- todayStats now cross-joins order_payments on every dashboard load (15s cache). On a busy cafe this is small, but the query has no index on order_payments filtered by parent-order date; it relies on order_payments_cafe_created_at_idx and the orders join. Watch it at the 10k-user target and add a covering index if EXPLAIN shows a seq scan.
- Refunded orders still count in todayRevenuePaise (refund() leaves status='completed'), so the new unrecordedPaise residual will be exact but the revenue figure it reconciles against is itself arguably wrong. Deliberately out of scope for this theme — do not quietly change it here, but it should be a work item in the money/reconciliation theme.
- The offline queue depth surfaced on the kitchen page is per-device localStorage. On the common two-device setup (counter phone + kitchen tablet) the kitchen still cannot see the counter's unsynced orders. Genuinely unsolvable without a server or a local sync channel — the UI copy must say 'on this device' so it does not create false confidence.
- Long-press to 86 on the order pad sits on the fast tap target. If the timing or the confirm is wrong, a cashier 86s a dish mid-rush by accident, which is worse than the problem being solved. Prototype the interaction on a real tablet before writing the confirm UI, and keep the menu editor as the undo path.
- Station is free text with no per-cafe registry, so 'chai' and 'chai counter' become two boards through a typo. Mitigated by the datalist of existing keys and lowercase normalisation, but a cafe with many items will eventually need a proper station admin screen — a follow-on, not this theme.
