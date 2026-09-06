# Day close, drawer & anti-fraud reporting

**Estimated effort: 10 engineer-days · 6 work items**

Today the cash-drawer close is theatre: the cashier types both "counted" and "expected" and the server just subtracts them, so a short till is hidden by typing the same number twice. This theme makes expected cash a server-derived figure (opening float + cash tenders + pay-ins − cash refunds − pay-outs), gives the cafe a place to record the cash it hands the vegetable vendor so the variance stops being noise, keeps every closed shift queryable so an owner can spot a till that is short every Saturday, blocks a close while offline orders are still queued (which otherwise books a false shortage the sync never corrects), and puts the dashboard and the Z-report on the same IST business day. After this, "variance" is a number the cashier cannot author, and a shortage has exactly one honest explanation.

---

<a id="drawer-schema-and-invariants"></a>

## 🔴 `drawer-schema-and-invariants` — Schema foundation: movements table, close-time breakdown snapshot, one-open-drawer index

### Approach

Everything downstream needs storage that does not exist yet, so land it as one additive migration (0013) before touching route logic.

(a) NEW TABLE cash_drawer_movements. I chose a dedicated table over the auditor's alternative of bolting a payment-mode column onto expenses, for three reasons an engineer should not re-litigate: expenses are P&L rows keyed to a business DATE (incurredOn) and many are not cash out of the till at all; expenses cannot express a pay-IN (owner tops up the float, staff repays an advance); and expenses are PATCH/DELETE-able (apps/api/src/routes/expenses.ts), so booking drawer cash there would let a cashier delete the row after close and silently rewrite a closed shift's variance. Movements are therefore soft-voided, never deleted, and can only be created against the currently-open session.

(b) NEW COLUMNS on cash_drawer_sessions to snapshot the derivation at close. This is the part that makes the variance unfalsifiable after the fact: once the shift is closed, the four components and the variance are frozen on the row, so an offline order that syncs at 11:20pm cannot retroactively change what the 11pm close said. It also means the history table renders from one row with no re-aggregation.

(c) PARTIAL UNIQUE INDEX enforcing at most one open session per cafe. The schema comment currently says 'enforced in application code', but apps/api/src/routes/cash-drawer.ts:65-75 is a check-then-insert with no transaction: two terminals tapping 'Open drawer' at 8am produce two open sessions, and from then on the expected-cash derivation is ambiguous (findOpen picks an arbitrary one, and close() updates by cafeId+status='open' with no session id, so .returning() can match either). Fix the invariant in the database, and make the repo map Postgres unique-violation 23505 onto the existing DRAWER_ALREADY_OPEN 409 rather than a 500.

(d) INDEX orders(cafe_id, paid_at). The expected-cash query filters single-tender cash sales on paid_at, and the only existing index is orders_cafe_created_at_idx.

(e) Change CashDrawerRepository.close to take an explicit sessionId (from the findOpen the route already does) instead of matching on status='open', so the close targets one known row and the audit entry names it.

BACKFILL / BREAKING: creating the partial unique index fails if any cafe already has two open sessions. The migration must close duplicates first (keep the newest openedAt per cafe, stamp the rest closed with a note) — hand-write that UPDATE above the CREATE INDEX in the generated file. Everything else is additive and backward-compatible.

All new money columns are integer paise. amount_paise on movements is a positive magnitude with a CHECK (> 0); direction lives in `kind`, never in the sign, so no query ever has to reason about negative sums.

### Schema

NEW FILE packages/db/src/schema/cash-drawer-movements.ts:
  export const cashDrawerMovementKindValues = ['pay_in','pay_out'] as const;
  export const cashDrawerMovementReasonValues = ['vendor_payment','staff_advance','owner_draw','bank_deposit','float_top_up','other'] as const;
  cashDrawerMovements = pgTable('cash_drawer_movements', {
    id            uuid PK default gen_random_uuid(),
    cafeId        uuid NOT NULL,
    sessionId     uuid NOT NULL,          -- FK -> cash_drawer_sessions(id), declared in SQL per house convention
    kind          text NOT NULL enum(pay_in|pay_out),
    reason        text NOT NULL enum(...) default 'other',
    amountPaise   integer NOT NULL,       -- positive magnitude only
    note          text,
    expenseId     uuid,                   -- optional link to the expenses row created alongside a pay_out
    createdByUserId text,                 -- request.user.id (Supabase sub); text to match audit_logs.actorId
    voidedAt      timestamptz,
    voidedByUserId text,
    voidReason    text,
    createdAt     timestamptz NOT NULL defaultNow(),
  }, (t) => [
    index('cash_drawer_movements_session_idx').on(t.sessionId),
    index('cash_drawer_movements_cafe_created_at_idx').on(t.cafeId, t.createdAt),
  ]);
Append by hand to the generated migration (drizzle-kit 0.30 will not emit these):
  ALTER TABLE cash_drawer_movements ADD CONSTRAINT cash_drawer_movements_amount_positive CHECK (amount_paise > 0);
  ALTER TABLE cash_drawer_movements ADD CONSTRAINT cash_drawer_movements_session_fk FOREIGN KEY (session_id) REFERENCES cash_drawer_sessions(id);
  ALTER TABLE cash_drawer_movements ADD CONSTRAINT cash_drawer_movements_cafe_fk FOREIGN KEY (cafe_id) REFERENCES cafes(id);

ALTER packages/db/src/schema/cash-drawer-sessions.ts — add nullable columns (all set at close, all integer paise except the last two):
  cashSalesPaise        integer   -- single-tender cash + split-tender cash rows in the window
  cashRefundsPaise      integer   -- positive magnitude
  payInsPaise           integer
  payOutsPaise          integer
  variancePaise         integer   -- counted - expected, frozen at close
  unsyncedOrdersAtClose integer   -- offline queue depth the cashier acknowledged (see offline-close-guard)
  openedByUserId        text
  closedByUserId        text
  closedByStaffId       uuid
and a new index entry:
  uniqueIndex('cash_drawer_sessions_one_open_per_cafe_idx').on(table.cafeId).where(sql`${table.status} = 'open'`)
  index('cash_drawer_sessions_cafe_opened_at_idx').on(table.cafeId, table.openedAt)   -- history listing

ALTER packages/db/src/schema/orders.ts index list — add:
  index('orders_cafe_paid_at_idx').on(table.cafeId, table.paidAt)

REGISTER the new schema file in packages/db/drizzle.config.ts `schema: [...]` (it is an explicit list, not a glob — a new file that is not added is silently invisible to drizzle-kit).

Migration 0013 hand-edit, ABOVE the CREATE UNIQUE INDEX (data backfill, required):
  UPDATE cash_drawer_sessions SET status='closed', closed_at=now(),
         notes = coalesce(notes,'') || ' [auto-closed: duplicate open session]'
  WHERE status='open' AND id NOT IN (
    SELECT DISTINCT ON (cafe_id) id FROM cash_drawer_sessions
    WHERE status='open' ORDER BY cafe_id, opened_at DESC);

### API

none (schema + repo signature only). CashDrawerRepository.close changes shape: close(cafeId, sessionId, data) where data drops expectedCashPaise and gains { closingCountedPaise, expectedCashPaise (server-derived), cashSalesPaise, cashRefundsPaise, payInsPaise, payOutsPaise, variancePaise, unsyncedOrdersAtClose, closedByUserId, closedAt, notes }. open() gains openedByUserId and must translate a 23505 unique violation into a null return so the route can answer 409.

### Tests

apps/api/src/routes/cash-drawer.test.ts:
  - 'POST open > returns 409 DRAWER_ALREADY_OPEN when the repo reports a unique-violation race' (mock open() resolving null, assert 409 not 500)
apps/api/src/repositories/cash-drawer.repo.test.ts (NEW, following the fake-Drizzle pattern in apps/api/src/repositories/table-sessions.repo.test.ts):
  - 'open() maps Postgres error 23505 to a null result instead of throwing'
  - 'close() targets the session id it was given, not any open session for the cafe'
  - 'close() persists all four breakdown components and the variance on the row'
Migration rehearsal (manual, documented in the PR body, not automated): restore a prod-shaped dump with two open sessions for one cafe, run pnpm --filter @sangam/db db:migrate, assert the duplicate is auto-closed and the unique index is created.

### Files

- `packages/db/src/schema/cash-drawer-movements.ts`
- `packages/db/src/schema/cash-drawer-sessions.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/drizzle/migrations/0013_*.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `apps/api/src/repositories/cash-drawer.ts`
- `apps/api/src/repositories/cash-drawer.repo.test.ts`

---

<a id="server-derived-expected-cash"></a>

## 🔴 `server-derived-expected-cash` — Derive expected cash server-side; refuse the client-supplied figure

### Approach

This is the fix for audit gaps 1 and 2 — one root cause, one work item. Auditor's pointers verified: apps/api/src/routes/cash-drawer.ts:22-26 is closeDrawerBodySchema with the optional expectedCashPaise, :92-111 is the handler that passes it straight through and subtracts, apps/api/src/repositories/cash-drawer.ts:17-23 is the interface, and cash-drawer-panel.tsx:246-259 is the 'Expected cash (₹)' input (the exact line span is 246-259 in the current file, not 247-256, but it is the block the auditor means).

Three pieces:

1. PURE MATH MODULE apps/api/src/reports/drawer-math.ts, mirroring the existing apps/api/src/reports/date-range.ts convention (pure, unit-tested, no DB):
     expectedCashPaise(c) = c.openingFloatPaise + c.cashSalesPaise + c.payInsPaise - c.cashRefundsPaise - c.payOutsPaise
     variancePaise(counted, expected) = counted - expected      // positive = over, negative = short
   Every input is a sum over integer paise columns. Nothing is divided or apportioned anywhere in this theme, so there is no remainder rule to state — and there must never be one: the UI divides by 100 only at render time (rupees() in the panel), the server never does.

2. REPO AGGREGATION CashDrawerRepository.cashSums(cafeId, { sessionId, fromIso, toIso }) -> { cashSalesPaise, cashRefundsPaise, payInsPaise, payOutsPaise }. Four aggregates in a Promise.all:
   (i) single-tender cash: SUM(orders.total_paise) WHERE cafe_id = $1 AND payment_method = 'cash' AND paid_at >= $from AND paid_at < $to.
       Deliberately uses paid_at, not created_at — the cash physically enters the drawer when the bill is settled, and a tab opened before the shift but settled during it belongs to this drawer. Both settlement paths set paid_at: ordersRepo.updateStatus (repositories/orders.ts:276-281) and tableSessionsRepo.settle (repositories/table-sessions.ts:354-372).
       Deliberately has NO status filter, unlike the Z-report's ne(status,'cancelled') in repositories/reports.ts:41. A cash-paid order that is later cancelled without a refund still has its notes in the till; excluding it would manufacture a shortage. Refunds are subtracted separately in (iii). Write this rationale into the code comment — it will otherwise be 'corrected' by the next reader.
   (ii) split-tender cash: SUM(order_payments.amount_paise) JOIN orders ON orders.id = order_payments.order_id WHERE order_payments.cafe_id = $1 AND kind='payment' AND method='cash' AND orders.payment_method IS NULL AND order_payments.created_at >= $from AND < $to.
       The `orders.payment_method IS NULL` guard is load-bearing and must mirror repositories/reports.ts:95 exactly: settleWithPayments (repositories/orders.ts:326-357) writes an order_payments row even for a SINGLE tender and also stamps orders.paymentMethod, so without the guard every single-tender split-flow settlement is counted twice.
   (iii) cash refunds: SUM(order_payments.amount_paise) WHERE cafe_id=$1 AND kind='refund' AND method='cash' AND created_at in window. NO payment_method guard here — refund rows are additional rows on orders that keep a non-null paymentMethod (repositories/orders.ts:359-385), so the (ii) guard would drop all of them. (Worth noting: the Z-report currently ignores refunds entirely for the same reason; out of scope here, flagged as a risk.)
   (iv) movements: SELECT kind, SUM(amount_paise) FROM cash_drawer_movements WHERE cafe_id=$1 AND session_id=$2 AND voided_at IS NULL GROUP BY kind. Session-scoped, so no time filter.
   cashSalesPaise = (i) + (ii). Postgres sum() returns numeric-as-string or null: wrap every read as Number(x ?? 0).

3. ROUTE CHANGES in apps/api/src/routes/cash-drawer.ts:
   - GET /current now also returns a live `position` so the panel can render expected read-only while the shift runs.
   - POST /close computes closedAt = new Date().toISOString() ONCE, uses that same instant as the aggregation upper bound AND as the stored closed_at, and does the aggregate + update inside a single db.transaction so nothing lands between reading and writing. Rows that arrive after that instant (the offline flush) are excluded by construction — which is exactly why the queue guard is a separate blocker.
   - closeDrawerBodySchema drops expectedCashPaise. Reject rather than ignore: a body carrying it gets 400 EXPECTED_CASH_NOT_ACCEPTED, so a stale client fails loudly instead of believing it set the figure.
   - Both open and close write to the immutable audit log via AuditLogsRepository (inject it as opts.auditRepository, same wiring as apps/api/src/routes/orders.ts:109). Close metadata carries the full breakdown, the counted figure and the variance.

BREAKING: CloseDrawerRequest loses expectedCashPaise. The only caller is the web panel, updated in the same PR; the TypeScript removal in packages/types is what surfaces it.

### Schema

none (uses the columns added by drawer-schema-and-invariants)

### API

GET /cafes/:cafeId/cash-drawer/current  (200, response EXTENDED — additive)
  { "session": CashDrawerSession | null,
    "position": null | { "asOf": ISO, "openingFloatPaise": int, "cashSalesPaise": int, "cashRefundsPaise": int, "payInsPaise": int, "payOutsPaise": int, "expectedCashPaise": int } }
  position is null exactly when session is null. 404 { error: { code: 'NOT_FOUND' } } for a cafe the caller does not own. 401 without a token.

POST /cafes/:cafeId/cash-drawer/close   (BREAKING request change)
  request:  { "closingCountedPaise": int >= 0, "notes"?: string<=500, "acknowledgedUnsyncedOrders"?: int >= 0 }
  200:      { "session": CashDrawerSession, "variancePaise": int, "position": { ...same shape, asOf = session.closedAt } }
            variancePaise is never null now — expected is always derivable.
  400 EXPECTED_CASH_NOT_ACCEPTED when the body carries expectedCashPaise.
  409 NO_OPEN_DRAWER unchanged.
  404 NOT_FOUND for another owner's cafe.

POST /cafes/:cafeId/cash-drawer/open — unchanged contract; now also records audit 'drawer.open' and stores openedByUserId.

Audit entries written: action 'drawer.open' (entityType 'cash_drawer_session'), action 'drawer.close' with metadata { openingFloatPaise, cashSalesPaise, cashRefundsPaise, payInsPaise, payOutsPaise, expectedCashPaise, closingCountedPaise, variancePaise, unsyncedOrdersAtClose }.

### Web

apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx — remove the 'Expected cash (₹)' Input and its `expected` state entirely (lines 246-259 and the state/preview at ~156-176). Replace with a read-only breakdown <dl> fed by position: Opening float / + Cash sales / + Pay-ins / − Cash refunds / − Pay-outs / = Expected in drawer, each right-aligned tabular-nums, the Expected row emphasised with a top border. Keep the live variance preview but compute it as countedPaise − position.expectedCashPaise, so the number moves only as the cashier counts. Poll GET /current every 20s while the drawer is open (or refetch after each movement) so expected stays current as sales land. ClosedSummary renders the same breakdown from the now-populated session columns rather than the single expectedCashPaise line at 327-331.
apps/web/src/app/cafes/[id]/cash-drawer/page.tsx — the RSC already fetches CashDrawerResponse; pass the new `position` through to the panel as initialPosition so first paint has the figure with no client waterfall.
packages/types/src/staff.ts — extend CashDrawerSession with the new nullable columns; add DrawerCashPosition; drop expectedCashPaise from CloseDrawerRequest; add acknowledgedUnsyncedOrders; add position to CashDrawerResponse and CloseDrawerResponse; CloseDrawerResponse.variancePaise becomes number (not number | null).

### Tests

apps/api/src/reports/drawer-math.test.ts (NEW, pure):
  - 'expected = float + sales + pay-ins − refunds − pay-outs'
  - 'returns the float alone for a shift with no activity'
  - 'goes negative when pay-outs exceed float plus sales'
  - 'variance is positive when counted exceeds expected (over)'
  - 'variance is negative when counted is short'
  - 'variance is exactly zero for a matching count (no floating-point drift)'
apps/api/src/routes/cash-drawer.test.ts:
  - 'GET current returns a position derived from the repo sums, not from any client input'
  - 'GET current returns position null when no drawer is open'
  - 'POST close rejects a body containing expectedCashPaise with 400 EXPECTED_CASH_NOT_ACCEPTED'
  - 'POST close ignores nothing: the stored expectedCashPaise comes from cashSums, and a cashier who counts 500 short gets variancePaise -50000'  <-- the regression test for the whole theme
  - 'POST close passes the same asOf instant as both the aggregation upper bound and closedAt'
  - 'POST close writes a drawer.close audit entry carrying the full breakdown'
  - 'POST open writes a drawer.open audit entry'
  - 'POST close still returns 409 NO_OPEN_DRAWER when nothing is open'
apps/api/src/repositories/cash-drawer.repo.test.ts:
  - 'cashSums counts a single-tender cash order once, via orders.paid_at'
  - 'cashSums does NOT double-count a single-tender settlement that also wrote an order_payments row' (orders.payment_method non-null → split query must skip it)
  - 'cashSums adds the cash leg of a true split tender (orders.payment_method IS NULL)'
  - 'cashSums subtracts a cash refund on an order whose payment_method is still cash'
  - 'cashSums ignores a UPI refund'
  - 'cashSums includes a cash order settled during the shift but created before it opened'
  - 'cashSums excludes a cash order paid after the asOf instant'
  - 'cashSums excludes voided movements'

### Files

- `apps/api/src/reports/drawer-math.ts`
- `apps/api/src/reports/drawer-math.test.ts`
- `apps/api/src/repositories/cash-drawer.ts`
- `apps/api/src/repositories/cash-drawer.repo.test.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.test.ts`
- `packages/types/src/staff.ts`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/page.tsx`

---

<a id="drawer-cash-movements"></a>

## 🟠 `drawer-cash-movements` — Record cash paid into and out of the drawer during the shift

### Approach

Audit gap 4. Without this the expected-cash derivation is technically correct and practically useless: an Indian cafe pays the sabzi vendor, the milk delivery and a staff advance out of the till several times a week, every one of those reads as a shortage, and the owner learns to ignore the variance — which is precisely how a real shortage hides.

Routes create movements ONLY against the currently-open session (findOpen, then insert with that sessionId). A movement whose session is already closed can never be created or edited, so a closed shift's variance is immutable. Correcting a mistake is a void plus a fresh entry, both audited — the same discipline as the order refund path.

Amounts are stored as positive magnitudes; direction is `kind`. Nothing sums signed values, so no query can be wrong about a sign.

Optional expense linkage (this is the sub-piece to cut first if effort is tight): a pay_out is usually a real expense too (vendor payment, staff salary advance). When the request carries `expense: { category, incurredOn? }`, create the expenses row and the movement in ONE db.transaction and store the expense id on the movement, so the cashier enters it once. Consequence that must be handled: apps/api/src/routes/expenses.ts DELETE would then orphan a movement and silently change a drawer's story — make ExpensesRepository.remove refuse (409 EXPENSE_LINKED_TO_DRAWER) when a non-voided cash_drawer_movements row references it.

Pay-outs are NOT expenses in every case (a bank deposit, an owner draw), which is the second reason this is its own table rather than a flag on expenses.

### Schema

none beyond drawer-schema-and-invariants (cash_drawer_movements). Add to apps/api/src/repositories/expenses.ts a guarded remove: SELECT 1 FROM cash_drawer_movements WHERE expense_id = $id AND voided_at IS NULL LIMIT 1 before the DELETE.

### API

POST /cafes/:cafeId/cash-drawer/movements
  request: { "kind": "pay_in" | "pay_out",
             "reason": "vendor_payment"|"staff_advance"|"owner_draw"|"bank_deposit"|"float_top_up"|"other",
             "amountPaise": int > 0,
             "note"?: string<=500,
             "expense"?: { "category": ExpenseCategory, "incurredOn"?: "YYYY-MM-DD" } }
  201: { "movement": CashDrawerMovement, "position": DrawerCashPosition }   // position recomputed so the panel updates without a refetch
  400 on amountPaise <= 0 or non-integer (zod .int().positive())
  400 EXPENSE_ON_PAY_IN when `expense` accompanies kind='pay_in'
  409 NO_OPEN_DRAWER when no session is open
  404 NOT_FOUND for another owner's cafe
  audit: action 'drawer.pay_in' / 'drawer.pay_out', entityType 'cash_drawer_movement', metadata { kind, reason, amountPaise, note, expenseId }

POST /cafes/:cafeId/cash-drawer/movements/:movementId/void
  request: { "reason": string 1..500 }
  200: { "movement": CashDrawerMovement, "position": DrawerCashPosition }
  409 DRAWER_CLOSED when the movement's session.status = 'closed' (history is frozen)
  409 ALREADY_VOIDED
  404 NOT_FOUND when the movement is not in this cafe
  audit: action 'drawer.movement.void'

GET /cafes/:cafeId/cash-drawer/movements?sessionId=<uuid>
  200: { "movements": CashDrawerMovement[] }   // oldest first; defaults to the open session when sessionId is omitted
  404 NOT_FOUND for a session outside this cafe

No DELETE endpoint exists, by design.

CashDrawerMovement shape: { id, cafeId, sessionId, kind, reason, amountPaise, note, expenseId, createdByUserId, voidedAt, voidReason, createdAt }.

### Web

apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx — new <MovementsCard> below the open-drawer card, visible only while a drawer is open: a compact list of the shift's movements (time · reason · note · ±amount, voided rows struck through) and two buttons, 'Cash in' and 'Cash out', opening a small inline form (amount ₹, reason <select>, note, and for pay-out a 'Also record as an expense' checkbox with a category select). On 201, merge the returned `position` into state so the expected figure and the breakdown move immediately. Void is a Radix AlertDialog (@radix-ui/react-alert-dialog is already a dependency) requiring a typed reason.
NEW apps/web/src/app/cafes/[id]/cash-drawer/movement-form.tsx to keep the panel readable.
packages/types/src/staff.ts — CashDrawerMovement, CashDrawerMovementKind, CashDrawerMovementReason, CreateDrawerMovementRequest, VoidDrawerMovementRequest, DrawerMovementResponse, DrawerMovementsResponse.

### Tests

apps/api/src/routes/cash-drawer.test.ts:
  - 'POST movements creates a pay_out against the open session and returns the recomputed position'
  - 'POST movements returns 409 NO_OPEN_DRAWER when no shift is open'
  - 'POST movements rejects amountPaise 0 and -100 with 400'
  - 'POST movements rejects an expense payload on a pay_in with 400 EXPENSE_ON_PAY_IN'
  - 'POST movements with an expense payload creates both rows and links them'
  - 'POST movements/:id/void returns 409 DRAWER_CLOSED for a movement on a closed session'
  - 'POST movements/:id/void returns 409 ALREADY_VOIDED on a second void'
  - 'POST movements/:id/void writes a drawer.movement.void audit entry'
  - 'GET movements returns 404 for a sessionId belonging to another cafe'
apps/api/src/routes/expenses.test.ts:
  - 'DELETE expense returns 409 EXPENSE_LINKED_TO_DRAWER when a live drawer movement references it'
  - 'DELETE expense succeeds when the referencing movement is voided'
apps/api/src/reports/drawer-math.test.ts:
  - 'a ₹600 vendor pay-out reduces expected cash by exactly 60000 paise, so a correctly counted till shows variance 0'  <-- the regression test for gap 4

### Files

- `apps/api/src/repositories/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.test.ts`
- `apps/api/src/repositories/expenses.ts`
- `apps/api/src/routes/expenses.ts`
- `apps/api/src/routes/expenses.test.ts`
- `packages/types/src/staff.ts`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/movement-form.tsx`

---

<a id="drawer-session-history"></a>

## 🟠 `drawer-session-history` — Drawer history: list and inspect closed shifts

### Approach

Audit gap 3, verified: CashDrawerRepository (apps/api/src/repositories/cash-drawer.ts:17-23) has only findOpen/open/close, there is no list route, and cash-drawer-panel.tsx:57-60 swaps the ClosedSummary back to OpenDrawerCard on 'Start a new shift', after which the closed session is unreachable from the UI. Two consequences worth fixing together: the owner cannot answer 'has the till been short every Saturday for a month', and no one can re-examine a variance after the fact.

Add list + findById to the repo and two GET routes. Dates are filtered as IST business days on openedAt using istRange() from apps/api/src/reports/date-range.ts — the same clock the Z-report uses, so 'last 30 days' means the same thing on both screens. Keyset pagination on (openedAt desc, id desc) rather than OFFSET, and it is served by the new cash_drawer_sessions_cafe_opened_at_idx.

The list response carries a period summary computed in the pure module (sum of stored variancePaise, count of short/over sessions, worst short) so the owner sees the pattern without reading rows. Because variance was frozen at close by server-derived-expected-cash, this summary is a genuine historical record, not a recomputation that drifts with late data.

Detail returns the session plus its movements so a suspicious variance can be traced to the pay-outs claimed against it.

### Schema

none (uses cash_drawer_sessions_cafe_opened_at_idx from drawer-schema-and-invariants)

### API

GET /cafes/:cafeId/cash-drawer/sessions?from=&to=&status=&limit=&cursor=
  query: from,to = IST YYYY-MM-DD inclusive (validated with isValidIsoDate from apps/api/src/reports/date-range.ts; default = last 30 days ending todayIstDate()); status = 'open'|'closed' (optional, default both); limit = 1..100 default 20; cursor = opaque base64 of "<openedAt>|<id>".
  200: { "sessions": CashDrawerSession[],            // newest openedAt first
         "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "limit": int,
         "nextCursor": string | null,
         "summary": { "sessionCount": int, "closedCount": int, "totalVariancePaise": int, "shortCount": int, "overCount": int, "worstShortPaise": int } }
         summary covers the requested window (computed over closed sessions only; open sessions have a null variance and are excluded from the money figures).
  400 INVALID_RANGE when from > to (same shape as apps/api/src/routes/expenses.ts:96-99)
  404 NOT_FOUND for another owner's cafe; 401 without a token.

GET /cafes/:cafeId/cash-drawer/sessions/:sessionId
  200: { "session": CashDrawerSession, "movements": CashDrawerMovement[] }
  404 NOT_FOUND when the session id is not in this cafe (never 403).

Repo additions:
  list(cafeId, { fromIso, toIso, status?, limit, cursor? }): Promise<{ sessions: CashDrawerSession[]; nextCursor: string | null }>
  findById(cafeId, sessionId): Promise<CashDrawerSession | null>

### Web

apps/web/src/app/cafes/[id]/cash-drawer/page.tsx — RSC-fetch the first page of sessions alongside the current one (Promise.all, no client waterfall, per the project's RSC-default rule) and render a new <DrawerHistory> under the panel.
NEW apps/web/src/app/cafes/[id]/cash-drawer/drawer-history.tsx — a summary strip (period total variance, N shifts short, worst short) over a table: Opened / Closed / Float / Expected / Counted / Variance, variance right-aligned tabular-nums and toned danger when short, success when over, muted at zero (never colour alone — keep the ' short' / ' over' word suffix already used by VarianceValue, which should be lifted out of cash-drawer-panel.tsx into a shared module so both files use one implementation). A row expands to the movements list from the detail endpoint. A date-range control mirroring the reports page pattern (apps/web/src/app/cafes/[id]/reports/reports-view.tsx:104-130), plus 'Load more' driving the cursor.
after close, keep the just-closed session in the history list rather than letting 'Start a new shift' erase it.
packages/types/src/staff.ts — CashDrawerSessionsResponse, CashDrawerSessionDetailResponse, DrawerVarianceSummary.

### Tests

apps/api/src/routes/cash-drawer.test.ts:
  - 'GET sessions returns closed shifts newest-first within the IST window'
  - 'GET sessions defaults to the last 30 days when from/to are omitted'
  - 'GET sessions returns 400 INVALID_RANGE when from is after to'
  - 'GET sessions clamps limit to 100'
  - 'GET sessions returns nextCursor and the following page excludes the last row of the previous one'
  - 'GET sessions summary counts short and over shifts and reports the worst short'
  - 'GET sessions summary ignores the still-open session'
  - 'GET sessions/:id returns the session with its movements'
  - 'GET sessions/:id returns 404 for a session belonging to another cafe'
apps/api/src/repositories/cash-drawer.repo.test.ts:
  - 'list filters on openedAt using the IST day boundary, not server-local midnight'
apps/web/src/app/cafes/[id]/cash-drawer/drawer-history.test.tsx (NEW, @testing-library/react):
  - 'renders a short shift with the danger tone and the word "short"'
  - 'renders variance 0 without a +/- sign'

### Files

- `apps/api/src/repositories/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/cash-drawer.test.ts`
- `apps/api/src/reports/drawer-math.ts`
- `packages/types/src/staff.ts`
- `apps/web/src/app/cafes/[id]/cash-drawer/page.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/drawer-history.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`

---

<a id="offline-close-guard"></a>

## 🟠 `offline-close-guard` — Block the day close while offline orders are still queued

### Approach

Audit gap 5, verified: apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:406 enqueues on network failure, use-offline-queue.ts flushes on reconnect and every 30s, and neither the drawer page nor the reports page reads the queue at all.

CRITICAL TRAP the auditor's one-line pointer does not mention: do NOT reuse useOfflineQueue(cafeId, sender) on these pages with a stub sender. offline-queue.ts flush() removes every item whose sender RESOLVES — a no-op sender resolves, so a dummy sender would silently delete the cashier's unsynced orders. That is a worse bug than the one being fixed.

So add a separate read-only hook in apps/web/src/lib/use-offline-queue.ts:
  export function useOfflineOrderCount(cafeId: string): number
It calls pendingCount(cafeId) only — never flush, no sender argument. It refreshes on mount, on a 5s interval, on the window 'storage' event (fires in OTHER tabs, which is the common case: the counter is a different tab from the drawer page) and on 'visibilitychange'. SSR-safe initial value 0, matching the existing hook's guards.

Drawer panel: while count > 0 the 'Close drawer' button is disabled and a danger banner states the count and links to /cafes/{id}/orders/new ('Open the counter to sync'). Hard block by default — closing on an incomplete Z-report records a false shortage that is never corrected once the orders sync, which is exactly the failure the drawer exists to prevent. But an owner sometimes must close anyway (the queued payload is junk from a dead device), so provide an escape behind a Radix AlertDialog that spells out the consequence; taking it sends acknowledgedUnsyncedOrders: <count> on the close body, which is persisted to cash_drawer_sessions.unsynced_orders_at_close and lands in the drawer.close audit metadata. The escape hatch is recorded, not hidden.

Reports page: warn, do not block — a report is a read. A banner above the controls when count > 0, and the CSV export gets a leading comment line so a downloaded-and-emailed report carries the caveat with it.

Honest limitation to document in the UI copy and the risk list: the queue is per-browser localStorage. A drawer closed on a different device cannot see another terminal's queue. The banner therefore says 'on this device'.

### Schema

none (unsynced_orders_at_close added in drawer-schema-and-invariants)

### API

POST /cafes/:cafeId/cash-drawer/close — request gains the optional field already specified in server-derived-expected-cash: "acknowledgedUnsyncedOrders"?: int >= 0. Stored on the session and echoed in the drawer.close audit metadata. No new endpoint.

### Web

apps/web/src/lib/use-offline-queue.ts — add useOfflineOrderCount(cafeId) (read-only; explicitly no sender parameter, with a comment saying why a stub sender would destroy the queue).
apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx — consume it in CloseDrawerCard; danger banner + disabled submit + 'Close anyway' AlertDialog; pass acknowledgedUnsyncedOrders on the acknowledged path.
apps/web/src/app/cafes/[id]/reports/reports-view.tsx — consume it; warning banner above the controls; prepend '# WARNING: N order(s) taken offline on this device had not synced when this report was generated' to the CSV in buildCsv (apps/web/src/app/cafes/[id]/reports/reports-view.tsx handleDownload path).
NEW apps/web/src/components/unsynced-orders-banner.tsx — one component, two tones ('blocking' for the drawer, 'warning' for reports), so the copy stays consistent.

### Tests

apps/web/src/lib/use-offline-queue.test.tsx (NEW):
  - 'useOfflineOrderCount reports the queue depth for the cafe'
  - 'useOfflineOrderCount never calls flush and never removes queued orders'  <-- guards the trap above
  - 'useOfflineOrderCount updates when another tab fires a storage event'
  - 'useOfflineOrderCount returns 0 for a cafe with an empty queue'
apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.test.tsx (NEW, @testing-library/react + user-event):
  - 'disables Close drawer and shows the blocking banner when 2 orders are unsynced'
  - 'enables Close drawer when the queue is empty'
  - 'sends acknowledgedUnsyncedOrders: 2 when the cashier confirms Close anyway'
  - 'does not send acknowledgedUnsyncedOrders when the queue is empty'
  - 'never renders an editable Expected cash input'  <-- permanent guard against the gap-1/2 regression
apps/web/src/app/cafes/[id]/reports/reports-view.test.tsx (NEW):
  - 'shows the unsynced warning banner but keeps the CSV download enabled'
  - 'prepends the unsynced warning line to the exported CSV'

### Files

- `apps/web/src/lib/use-offline-queue.ts`
- `apps/web/src/lib/use-offline-queue.test.tsx`
- `apps/web/src/components/unsynced-orders-banner.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.test.tsx`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`
- `apps/web/src/app/cafes/[id]/reports/reports-view.test.tsx`
- `apps/api/src/routes/cash-drawer.ts`

---

<a id="ist-business-day-stats"></a>

## 🟠 `ist-business-day-stats` — Put the dashboard on the same IST business day as the Z-report

### Approach

Audit gap 6, verified exactly: apps/api/src/repositories/orders.ts:396-397 (todayStats), :463-464 (topItemsToday) and :490-491 (itemSalesToday) each build `const todayStart = new Date(); todayStart.setHours(0,0,0,0)`, while apps/api/src/repositories/reports.ts:35 uses istDayRange(). On a UTC-hosted server the dashboard day starts at 05:30 IST, so a cafe's midnight-to-5:30am trade lands on the previous day's tiles and the correct day's Z-report.

Fix: replace all three with
  const { fromIso, toIso } = istDayRange(todayIstDate());
and change the predicates from a bare gte(createdAt, todayIso) to gte(createdAt, fromIso) AND lt(createdAt, toIso). Note the upper bound is itself a fix: today the filter is open-ended, so an order with a future createdAt (clock skew on a device that queued offline) is counted in 'today' forever.

Two further disagreements found while reading, same function, same owner complaint ('two different revenue numbers for the same night') — fix the first, label the second:

(a) UNDERCOUNT, fix it. todayStats' paymentAgg (repositories/orders.ts:418-427) groups by orders.paymentMethod only. settleWithPayments leaves paymentMethod NULL for a true split tender (repositories/orders.ts:351), so every split-tender rupee is missing from the dashboard's cash/UPI/card tiles while the Z-report folds them in (repositories/reports.ts:82-101, 111-118). Add the same splitAgg query with the identical isNull(orders.paymentMethod) guard and fold it in. Without this, the cash tile the owner reconciles against the drawer is wrong in exactly the cafes that use split tender.

(b) DELIBERATE, label it. todayRevenuePaise counts status='completed' (money actually settled) while the Z-report's gross counts ne(status,'cancelled') (everything billed). These answer different questions and both are defensible; the bug is that neither screen says which. Keep the semantics, add a hint to the dashboard tile ('settled today') and a note on the reports page ('includes unsettled bills'), and pin the difference with a named test so nobody 'fixes' one to match the other by accident.

Also: statsKey in apps/api/src/routes/orders.ts:112-114 is cacheKey('orders', cafeId, 'stats', 'today') — a literal 'today' with a 15s TTL. Make it cacheKey('orders', cafeId, 'stats', todayIstDate()) so the IST rollover is instant; both the get and every cache.del go through the same helper, so a stale pre-midnight entry simply becomes unreachable and expires.

No money arithmetic changes here — only the WHERE clause and one extra aggregate; all figures remain integer paise read through Number(x ?? 0).

### API

No contract change to GET /cafes/:cafeId/orders/stats. Its response values change meaning (correctly): the window becomes the IST business day, and paymentBreakdownPaise now includes split-tender amounts. Callers: apps/api/src/routes/orders.ts:228 (dashboard) and the AI ops agent tool at apps/api/src/routes/ai-console.ts:151/155/161 — both benefit, neither needs a code change.

### Web

apps/web/src/app/cafes/[id]/page.tsx — add the 'settled today' hint to the revenue tile (line ~111) and keep the Cash/UPI/Card reconciliation rows (lines ~144-155) as-is; they become correct once the split-tender fold-in lands.
apps/web/src/app/cafes/[id]/reports/reports-view.tsx — one line of copy under the Gross sales metric clarifying it includes unsettled bills.

### Tests

apps/api/src/repositories/orders.repo.test.ts (NEW, fake-Drizzle pattern from table-sessions.repo.test.ts) — run with vi.setSystemTime to pin the clock:
  - 'todayStats uses the IST business day, not server-local midnight' (system time 2026-09-07T00:30:00Z on a UTC host; an order at 2026-09-06T20:00:00Z = 01:30 IST on the 7th must be IN today)
  - 'todayStats excludes an order created after the IST day ends (future clock skew)'
  - 'todayStats and reportsRepo.dayEnd select the same order set for the same IST date' (the cross-check for the owner-facing symptom)
  - 'todayStats payment breakdown includes the cash leg of a split tender'
  - 'todayStats payment breakdown does not double-count a single-tender settlement that also wrote an order_payments row'
  - 'topItemsToday uses the IST business day'
  - 'itemSalesToday uses the IST business day'
  - 'todayRevenuePaise counts only completed orders while dayEnd gross counts all non-cancelled orders (documented divergence)'
apps/api/src/routes/orders.test.ts:
  - 'GET orders/stats caches under an IST-date-scoped key'

### Files

- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.repo.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/web/src/app/cafes/[id]/page.tsx`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`

---

## Order of work

1. 1. ist-business-day-stats FIRST — it is fully independent of the drawer work, touches only orders.ts/reports paths, and gives an early merge that removes the dashboard/Z-report disagreement. Landing it first also means the drawer's cash figures are being reconciled against a dashboard that is already correct.
2. 2. drawer-schema-and-invariants — migration 0013 (movements table, session breakdown columns, partial unique index, orders paid_at index) plus the duplicate-open-session backfill. Run the migration rehearsal against a prod-shaped dump before merging; the CREATE UNIQUE INDEX is the only step that can fail on real data. Change CashDrawerRepository.close to take a sessionId in the same PR.
3. 3. server-derived-expected-cash — TDD order within the item: drawer-math.test.ts (pure, fails first) -> drawer-math.ts -> cash-drawer.repo.test.ts for cashSums -> repo implementation -> cash-drawer.test.ts route cases (including the 400 EXPECTED_CASH_NOT_ACCEPTED and the 'cashier 500 short still shows -50000' regression) -> route implementation -> packages/types edit (this is what breaks the web build) -> panel rework removing the Expected cash input. Ship the API and the panel in ONE PR; the request-shape change is breaking.
4. 4. drawer-cash-movements — depends on step 2's table and step 3's cashSums (movements are one of its four aggregates, so write cashSums with the movements query from the start and let this item fill in the write path). Cut the optional expense-linkage sub-piece here first if the schedule slips.
5. 5. drawer-session-history — depends on step 3 having frozen variancePaise on the row; the summary is meaningless otherwise. Lift VarianceValue out of cash-drawer-panel.tsx into a shared module as part of this item so the panel and the history table render variance identically.
6. 6. offline-close-guard — last on the web side because it edits the same CloseDrawerCard that step 3 rewrites, and merging them in the other order guarantees a conflict. The API half (acknowledgedUnsyncedOrders on the close body + the column write) can ride along in step 3's PR to avoid a second contract change.
7. 7. Full-stack pass: pnpm turbo typecheck test across the monorepo, then a manual end-to-end on staging — open a drawer, take a cash order, take a split-tender order, refund one in cash, record a ₹600 vendor pay-out, kill the network and queue an order, attempt a close (expect the block), sync, close, and confirm the closed shift appears in history with a zero variance.

## Risks

- Cash taken while NO drawer is open belongs to no session and is invisible to every variance figure. A cashier who simply never opens a shift defeats the whole control. This plan does not close that hole — it needs a follow-on 'no open drawer' warning on the counter (and eventually a block on settling cash without one). Call it out to the owner rather than implying the drawer is now airtight.
- The offline-queue guard is per-browser localStorage. Close the drawer on the manager's phone while the counter tablet holds three unsynced orders and nothing warns anyone. The UI copy must say 'on this device'. A real fix needs a server-visible queue signal (device heartbeat or a server-side pending-order table) and is out of scope.
- The partial unique index on cash_drawer_sessions can fail to create if production already holds two open sessions for one cafe. The backfill UPDATE in migration 0013 handles the known case, but the migration must be rehearsed against a restored dump before it runs for real — a failed CREATE INDEX aborts the whole migration.
- Deliberate divergence from the Z-report: the drawer's cash-sales query has no ne(status,'cancelled') filter, because cash from an order that was paid and later cancelled without a refund is physically still in the till. Someone comparing the drawer's cashSalesPaise with the Z-report's cash line will find them differing for cancelled-after-payment orders. Document it in code and in the history UI, or it will be re-reported as a bug every quarter.
- The Z-report itself still ignores refunds entirely (repositories/reports.ts:82-101 filters kind='payment'), so a day with cash refunds shows a Z-report gross that does not match the drawer's expected cash. Out of scope for this theme but it will be the first question the owner asks once the drawer numbers start being trusted.
- orders.paid_at is the drawer's clock for single-tender cash. updateStatus sets it whenever an order reaches 'completed', with or without a payment method — so paid_at is not strictly 'when money arrived' for orders completed without a method. The cash query also filters payment_method='cash', so those rows are excluded and the derivation holds; but any future change that back-dates or re-stamps paid_at will silently move money between shifts.
- Freezing the breakdown at close is what makes history unfalsifiable, and it is also what makes a late-syncing offline order permanently absent from that shift's figures. That is the correct trade, but it means the offline guard is doing real work — if it is cut or weakened, this item's value goes with it.
- cash_drawer_movements gives a dishonest cashier a new instrument: invent a ₹500 vendor pay-out to explain a ₹500 theft. Soft-void plus the audit trail records the invention but does not prevent it. Mitigation beyond this theme: require a note on pay-outs above a threshold, and surface pay-out totals per cashier in the history summary.
- Six new/changed endpoints and a substantially rewritten drawer panel land in a short window on a screen cashiers use daily under time pressure. Budget the manual staging pass in step 7 properly; a drawer screen that confuses the cashier at 11pm will be worked around, and a worked-around control is no control.
