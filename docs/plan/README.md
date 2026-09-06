# Sangam POS — remediation plan

Three documents, produced from an end-to-end audit of the running product:

| Document | What it is |
|---|---|
| [user-stories.md](user-stories.md) | 8 core flows as user stories, decomposed into 98 acceptance criteria, each marked against the real code |
| [gap-register.md](gap-register.md) | All 95 confirmed defects, with why each one hurts a cafe and where to fix it |
| This file | The build order — 12 shippable milestones |

## How this was produced

For each flow, one agent derived the user story and acceptance criteria, then traced
every criterion through db schema → repository → API route → web page → UI control.
A second agent was then given the resulting gap list and told to **refute** it — to
assume the auditor was lazy and go find the code they missed. Claims that turned out
to already exist were dropped, and several severities were corrected downward. What
remains is deliberately conservative.

A criterion counts as built only if a cafe owner can complete it in the running app.
An API with no UI reaching it does not count.

## Where the product stands

**31 of 98 acceptance criteria are fully implemented. 22 blockers, 54 major and 19 minor gaps remain.**

The shape of the problem is not missing features — most screens exist and look finished.
It is that several of them are wired to nothing, and a few compute money incorrectly
while looking right. The three that cost real money today:

- **Per-item GST override is collected, validated and displayed — and never applied.** A cafe
  selling packaged goods at 18% charges 5% on every bill and under-reports GST.
- **No Razorpay webhook.** If the diner's browser does not return from their UPI app, the
  money is captured at Razorpay and the order stays unpaid forever.
- **Expected cash at drawer close is typed by the cashier**, so the variance that exists to
  catch theft is entered by the person it would catch.

**Total estimated effort: 187.5 engineer-days** (~8.9 months for one experienced developer).
That is the honest number for all 95 gaps. The milestones are ordered so the product is
sellable well before the end.

---

## Milestones

### How the order was chosen

All 85 work items across the 11 themes are assigned exactly once, to 12 independently shippable milestones totalling 187.5 effort-days. Themes are deliberately broken apart and re-clustered by *when the money breaks*, not by which plan document an item came from — five of the twelve milestones draw from four or more themes.

**Band 1 — money that is currently WRONG or LOST (M1–M4, 79d).** M1 first because it is the only defect that is wrong on every single bill: `computeBillAdjustments` in apps/api/src/orders/build.ts applies one cafe-level `gstRateBp` to the whole cart while `menu_items.gstRateBpOverride` is written by the menu editor and never read, so any cafe selling 5% service alongside 18% packaged goods short-pays GST silently until return time, and the forked dine-in bill prints a Subtotal/CGST/SGST block that visibly fails to add up. Nothing else can be trusted until the number on the paper is right, and four later milestones render bills through the renderer M1 consolidates. M2 next because QR money currently goes to the platform's single `RAZORPAY_KEY_ID` and a captured payment vanishes if the browser never returns — money lost, not merely mis-stated. M3 third partly for its own value and partly as a hard dependency (below). M4 fourth: `cash_drawer_sessions.expectedCashPaise` is a client-supplied column, so the cashier authors their own variance — that is fraud that cannot be detected, and it is also the day-close a cafe cannot operate without.

**Band 2 — blocks a normal day of service (M5–M9, 68.5d).** M5 (outage), M6 (amend without burning a gapless serial), M7 (find this morning's bill), M8 (dine-in orders bound to the right tab), M9 (a kitchen board that admits when it is stale). M7 is pulled forward out of order because it is the cheapest item in this band (7.5d) and the failure — losing today's bills before service ends — starts at roughly 50 covers.

**Band 3–4 — second cafe, real staff, everything else (M10–M12, 40d).** Floor operations, menu operability, and multi-tenant/onboarding hygiene. M3 is the exception that sits in Band 1 rather than here, for the dependency reason below.

### Hard dependencies

1. Identity precedes attribution. Audit rows cannot name a person until staff PIN sessions exist, so M3 (staff-session-tokens, role-authz-guard) must precede every audited-action item: M4's drawer movements, M6's void-reason-and-audit, M8's force-close audit, M9's inline-86 audit, M11's menu-write audit. This is why M3 sits ahead of the day-close milestone even though "real staff" is nominally a Band-3 concern — sequencing it later would mean shipping the anti-fraud work stamped 'owner' and then rewriting it.

2. per-item-gst-engine precedes mixed-rate-bill-print, rate-wise-day-report (M4), order-reprice-engine (M6, which must re-derive tax through the same engine) and item-modifiers (M11, which prices into it).

3. one-thermal-bill precedes diner-receipt (M2), offline-provisional-slip (M5) and billed-state-and-reprint (M8) — build the renderer once, then three surfaces consume it.

4. table-integrity-schema (migration 0013) precedes every other dine-in item: order-session-binding, qr-orders-join-tab, session-lifecycle-guards, billed-state-and-reprint (M8) and all of M10.

5. server-idempotent-order-create precedes client-idempotency-key-header, public-qr-idempotency, queue-drawer-and-reconcile (M5) and offline-table-actions (M10).

6. drawer-schema-and-invariants precedes server-derived-expected-cash, drawer-cash-movements, offline-close-guard (M5) and drawer-session-history (M12).

7. order-reprice-engine → order-amend-api → order-edit-panel-web, in that order inside M6.

8. stock-enforcement precedes stock-decrement-auto-86, inline-86 and reject-only-bad-lines (M9).

9. category-lifecycle precedes menu-ordering (M11).

10. razorpay-webhook-idempotent-settlement precedes prepaid-kitchen-hold (the hold releases on the webhook) and refunds-that-actually-move-money (both write the same order_payments ledger).

### Deliberate merges

three themes describe the same artefact from different angles, and building it three times is the main avoidable waste in this programme. (a) z-report-print (Theme C), z-report-settled-open-refunds (Theme E) and reports-range-and-z-print (Theme D) are ONE 80mm Z-report, built once in M4. (b) session-bill-reconciles (Theme B) and the "session totals that carry adjustments" half of one-thermal-bill (Theme K) are the same fix, done once in M1. (c) staff-actor-attribution (Theme C) overlaps staff-session-tokens (Theme A); both land in M3 so the PIN login is written once. Estimated saving from these merges is roughly 4–5 days, already reflected in the milestone totals.

### The pilot gate

A counter/takeaway cafe with the owner at the till can go live at the end of M5 (~88.5d): correct bill, working payments, named actors, an honest close, and an outage that costs nothing. A dine-in cafe with waiters needs through M8 (~135d) — orders bound to the right tab is not optional once there are tables. M6 (amend) is the one item I would consider pulling forward if the pilot cafe's counter is high-volume, since without it the only remedy for a mis-punch is Cancel + re-punch, which burns a gapless GST serial. M9–M12 are safe to run while the first cafe is already paying.

### House conventions

Assumed throughout and reflected in the exit criteria: failing test first (route tests via buildTestApp + mocked repositories, web logic in vitest), money as integer paise everywhere, repositories as interfaces injected into routes, additive drizzle-kit migrations, foreign-cafe access returning 404 and never 403, and every sensitive action writing to the immutable audit log.

---

### M1 — One legally correct bill, on every path

*20.5 engineer-days*

**Goal.** A cafe selling both 5% restaurant service and 18% packaged/bakery goods hands the guest ONE correct document on every path (counter, table tab, diner phone) that foots to the paise and is filable — it stops silently short-paying GST, stops printing a dine-in 'TAX INVOICE' that doesn't add up, and stops handing composition guests an illegal document.

| | Work item | |
|---|---|---|
| 🔴 | [`per-item-gst-engine`](tax-correctness.md#per-item-gst-engine) | Apply per-item GST rates and persist a rate-wise breakdown on the order |
| 🔴 | [`session-bill-reconciles`](tax-correctness.md#session-bill-reconciles) | Table-session totals carry discount, charges and round-off so the tab invoice adds up |
| 🔴 | [`one-thermal-bill`](onboarding.md#one-thermal-bill) | Kill the forked dine-in bill: one <ThermalBill> renderer, and session totals that carry adjustments |
| 🔴 | [`mixed-rate-bill-print`](tax-correctness.md#mixed-rate-bill-print) | Rate-wise CGST/SGST block plus a labelled taxable value on the single-order bill and in both cart previews |
| 🟠 | [`one-serial-per-document`](tax-correctness.md#one-serial-per-document) | Issue one invoice serial per bill handed over, with a separate KOT number per kitchen round |
| 🟡 | [`ist-financial-year-and-day`](tax-correctness.md#ist-financial-year-and-day) | Reckon the invoice financial year and the "today" window in IST, not server-local time |
| 🟡 | [`kot-reprint-stamp`](tax-correctness.md#kot-reprint-stamp) | Stamp REPRINT on a re-fired kitchen ticket |
| 🟠 | [`customer-gstin-capture`](onboarding.md#customer-gstin-capture) | Add the customer GSTIN input the cashier is missing (gaps 8 and 12 are one gap) |
| 🟠 | [`tax-id-validation`](onboarding.md#tax-id-validation) | Real GSTIN/FSSAI validation, and no GST-charging cafe without a GSTIN |
| 🟠 | [`print-deadline`](onboarding.md#print-deadline) | Never let a bookkeeping call stall the printer |

**Done when:**

- buildOrder reads menu_items.gstRateBpOverride per line and persists a rate-wise breakdown on the order; a mixed 5%/18% cart's rate buckets sum exactly to orders.taxPaise in integer paise, proven by a failing-test-first vitest suite in apps/api/src/orders/build.test.ts.
- A single <ThermalBill> renderer serves the counter bill, the table-tab bill and the diner phone bill; the forked dine-in bill component is deleted, and billDocumentTitle(gstMode) / compositionDeclaration(gstMode) drive the header on all three.
- A table-tab invoice carrying a discount, a service charge and a round-off foots: subtotal − discount + charges + tax + roundOff = total, asserted for the session totals as well as the single order.
- Exactly one gapless invoice serial is issued per document the guest actually receives; a kitchen round gets a cheap KOT number instead, and a re-fired KOT prints REPRINT while a reprinted bill still increments orders.bill_print_count.
- The FY label and the 'today' window are computed in IST: an order created at 23:50 IST on 31 March lands in the correct financial-year sequence, not the server-local one.
- A cafe on regular_5 / regular_18 cannot be saved without a structurally valid GSTIN; FSSAI is validated; the cashier can type a customer GSTIN and it prints on the invoice.
- The bill/KOT render path never awaits a bookkeeping call (audit insert, customer upsert) — the printer is not stalled by a slow write.

---

### M2 — Online money reaches the cafe and can be given back

*18 engineer-days*

**Goal.** QR money lands in the cafe's own Razorpay account instead of the platform's, a captured payment can no longer vanish because the diner closed the browser, the kitchen stops cooking unpaid 'prepaid-required' orders, and a refund actually moves money — once, capped at the bill total.

| | Work item | |
|---|---|---|
| 🔴 | [`per-cafe-payment-credentials`](payments.md#per-cafe-payment-credentials) | Per-cafe Razorpay credentials, encrypted at rest, resolved per request |
| 🔴 | [`razorpay-webhook-idempotent-settlement`](payments.md#razorpay-webhook-idempotent-settlement) | Razorpay webhook + idempotent markPaid that writes the tender-ledger row |
| 🔴 | [`prepaid-kitchen-hold`](payments.md#prepaid-kitchen-hold) | Prepaid orders actually held from the kitchen, payment state on the ticket, stale holds expired |
| 🔴 | [`refunds-that-actually-move-money`](payments.md#refunds-that-actually-move-money) | Refund a cancelled paid order, call the provider, and cap cumulative refunds transactionally |
| 🟠 | [`diner-resume-payment`](payments.md#diner-resume-payment) | Diner can resume an interrupted payment from Your orders and after a reload |
| 🟠 | [`diner-receipt`](onboarding.md#diner-receipt) | Give the QR diner a real bill on their phone after paying |

**Done when:**

- Razorpay key id/secret are stored per cafe, encrypted at rest, and resolved per request; the server-wide RAZORPAY_KEY_ID/SECRET path is removed for cafe money, and a cafe with no credentials shows a 'connect payments' state instead of silently charging to the platform account.
- A diner who closes the tab immediately after paying still has a settled order: the webhook verifies the signature, writes the order_payments row and flips paymentStatus; replaying the same webhook body produces no second ledger row and no second settlement (idempotency proven by a route test).
- A prepaid-required order does not appear on the kitchen board until paid, the ticket shows its payment state, and a stale unpaid hold expires instead of blocking the board forever.
- Refunding a cancelled paid order calls the provider, writes a kind='refund' order_payments row and an audit entry, and cumulative refunds are capped at the bill total inside one transaction — a concurrent double-refund test fails to over-refund.
- The diner can resume an interrupted payment from 'Your orders' and after a page reload, and once paid receives a real bill on their phone rendered by the M1 <ThermalBill>.
- A Razorpay test-mode pass is scripted and written up in docs/testing-guide.md; no item in this milestone ships without it.

---

### M3 — Every action has a real name on it

*18 engineer-days*

**Goal.** Staff work under their own identity instead of the owner's login: the kitchen tablet holds no owner password, a cashier can settle but not refund, a waiter can 86 but not reprice, 'who refunded this' finally has an answer, a forgotten password no longer stops billing for the day, and a WiFi blip no longer signs the counter out mid-service.

| | Work item | |
|---|---|---|
| 🔴 | [`owner-account-recovery`](staff-identity.md#owner-account-recovery) | Password reset, password change, email change (owner account) |
| 🔴 | [`auth-session-resilience`](onboarding.md#auth-session-resilience) | Stop signing the counter out on a network blip; drop the per-navigation Supabase round-trip |
| 🔴 | [`staff-session-tokens`](staff-identity.md#staff-session-tokens) | Device pairing + staff PIN sign-in minting a scoped staff token |
| 🔴 | [`role-authz-guard`](staff-identity.md#role-authz-guard) | Role-capability matrix + a cafe-membership guard replacing findByIdAndOwner on every route |
| 🔴 | [`staff-actor-audit`](staff-identity.md#staff-actor-audit) | Real actor on the audit trail, the cash drawer and table sessions |
| 🟠 | [`staff-actor-attribution`](order-amend.md#staff-actor-attribution) | Who did it: staff PIN login and createdBy/voidedBy on the order |
| 🔴 | [`staff-web-shell`](staff-identity.md#staff-web-shell) | Device handover, PIN lock screen, role-filtered nav, chrome-free KDS |
| 🟡 | [`auth-return-to-page`](dine-in.md#auth-return-to-page) | Bounced sessions return to the page they were on, and a 401 asks you to sign in |

**Done when:**

- The owner can reset a forgotten password, change their password and change their email without founder intervention; a locked-out owner is no longer a day of lost billing.
- A device is paired once, then a staff PIN mints a short-lived scoped staff token; the kitchen/waiter device never stores the owner's Supabase password. staff.pinHash is finally read, never the raw PIN.
- A role-capability matrix plus a cafe-membership guard replaces cafesRepo.findByIdAndOwner on EVERY cafe route; a foreign cafe still returns 404 and never 403; per-role route tests prove cashier-can-settle / cashier-cannot-refund and waiter-can-86 / waiter-cannot-reprice.
- audit_logs rows, cash_drawer_sessions.openedByStaffId and table_sessions carry the real actorType/actorId/actorName; orders carry createdBy/voidedBy. No sensitive action is stamped 'owner' by default any more.
- A dropped connection no longer signs the counter out and no longer discards the offline order queue; the per-navigation Supabase round-trip is gone; a genuinely expired session returns the user to the page they were on with a sign-in prompt.
- The web shell shows role-filtered navigation, a PIN lock screen and a chrome-free KDS view.

---

### M4 — A day that closes honestly

*22.5 engineer-days*

**Goal.** The cafe can close its day on a variance figure the cashier cannot author: expected cash is derived server-side, split-tender money stops disappearing from the Cash/UPI/Card rows, refunds and still-open orders are handled, and an 80mm Z-report ties the physical drawer to revenue and to a rate-wise GST split that can actually be filed.

| | Work item | |
|---|---|---|
| 🔴 | [`drawer-schema-and-invariants`](day-close.md#drawer-schema-and-invariants) | Schema foundation: movements table, close-time breakdown snapshot, one-open-drawer index |
| 🔴 | [`server-derived-expected-cash`](day-close.md#server-derived-expected-cash) | Derive expected cash server-side; refuse the client-supplied figure |
| 🟠 | [`drawer-shift-reconciliation`](dine-in.md#drawer-shift-reconciliation) | Link orders and tenders to the cash-drawer session so a shift can be reconciled |
| 🟠 | [`drawer-cash-movements`](day-close.md#drawer-cash-movements) | Record cash paid into and out of the drawer during the shift |
| 🔴 | [`day-end-money-model`](order-amend.md#day-end-money-model) | Day-end figures that foot: real net sales, discount/charge lines, bill-number range |
| 🟠 | [`split-tender-recon`](kitchen.md#split-tender-recon) | Split-tender money lands in the dashboard Cash/UPI/Card rows (and the rows are made to sum by construction) |
| 🔴 | [`z-report-settled-open-refunds`](payments.md#z-report-settled-open-refunds) | Z-report splits settled vs open sales and deducts refunds so the day ties to the drawer |
| 🔴 | [`z-report-print`](order-amend.md#z-report-print) | Printable 80mm Z-report with drawer reconciliation |
| 🟡 | [`reports-range-and-z-print`](dine-in.md#reports-range-and-z-print) | Date-range reports and a printable Z-report slip |
| 🟠 | [`rate-wise-day-report`](tax-correctness.md#rate-wise-day-report) | Split the day-end report's GST into rate buckets so a mixed-rate cafe can still file |
| 🟠 | [`ist-business-day-stats`](day-close.md#ist-business-day-stats) | Put the dashboard on the same IST business day as the Z-report |

**Done when:**

- Migration adds the drawer movements table, a close-time breakdown snapshot and a one-open-drawer-per-cafe partial unique index; orders and order_payments rows link to the drawer session so a shift reconciles independently of the calendar day.
- expectedCashPaise is computed by the server (opening float + cash tenders + pay-ins − cash refunds − pay-outs) and a client-supplied figure is REJECTED; typing the same number twice can no longer hide a short till.
- Cash handed to the vegetable vendor or added mid-shift is recorded as an audited drawer movement with an actor (depends on M3), so variance stops being noise.
- The day-end figures foot: gross = net + tax + round-off, with explicit discount and charge lines, a bill-number range, settled vs open sales split, and refunds deducted.
- Split-tender payments appear in the dashboard Cash/UPI/Card rows and those rows sum to revenue by construction, not by coincidence.
- A Z-report prints on the 80mm counter printer with drawer reconciliation and a rate-wise GST breakdown; date-range reports and the dashboard use the same IST business day as the Z-report and agree to the paise on a fixture day containing a refund, a split tender and an open order.

---

### M5 — An outage costs a slower bill, nothing else

*12 engineer-days*

**Goal.** When the line drops the counter keeps working end to end: the kitchen still gets paper, the guest still gets a clearly PROVISIONAL estimate, and the replay can never create a second order with a second gapless invoice serial or double-counted revenue.

| | Work item | |
|---|---|---|
| 🔴 | [`server-idempotent-order-create`](offline.md#server-idempotent-order-create) | Server-side idempotent order creation (unique key per cafe, replay returns the same order) |
| 🔴 | [`client-idempotency-key-header`](offline.md#client-idempotency-key-header) | Send the idempotency key on the FIRST attempt, not only on replay |
| 🟡 | [`public-qr-idempotency`](offline.md#public-qr-idempotency) | Honour Idempotency-Key on the public QR order endpoint |
| 🔴 | [`offline-provisional-slip`](offline.md#offline-provisional-slip) | Print a real KOT and a PROVISIONAL estimate for an offline order |
| 🟠 | [`offline-kot`](kitchen.md#offline-kot) | An offline order still prints a kitchen slip and a clearly-provisional bill |
| 🟠 | [`queue-drawer-and-reconcile`](offline.md#queue-drawer-and-reconcile) | Pending-order drawer, poison-item handling, and estimate-vs-invoice reconciliation |
| 🟠 | [`offline-close-guard`](day-close.md#offline-close-guard) | Block the day close while offline orders are still queued |

**Done when:**

- POST /cafes/:cafeId/orders collapses duplicates on a unique (cafe_id, idempotency_key) index; a replay returns the SAME order and the SAME invoice serial — no second gapless number is burned (route test with a repeated key).
- The client sends the idempotency key on the FIRST attempt, not only on replay; the public QR order endpoint honours Idempotency-Key too.
- An offline order prints a real OFF- kitchen ticket and a clearly-marked PROVISIONAL estimate, rendered from a printable snapshot frozen into the queue item at punch time.
- A pending/blocked/synced queue drawer shows the real invoice number after sync, handles a poison item without wedging the queue, and shouts when the synced total differs from the estimate already handed to the customer.
- The day close is refused while offline orders are still queued, so a false shortage is never booked.
- A scripted manual pass — pull the network mid-service, punch three orders, restore — produces: three KOTs, three orders, three serials, zero duplicates.

---

### M6 — Fix a mistake without destroying the invoice series

*18 engineer-days*

**Goal.** The counter can handle 'make that two' or a mis-punched line without cancelling and re-punching — no burnt GST serial, no re-fired KOT the kitchen is already cooking — and every void, discount and amendment carries a reason and the name of the person who did it.

| | Work item | |
|---|---|---|
| 🔴 | [`order-reprice-engine`](order-amend.md#order-reprice-engine) | Re-pricing engine: adjustment intent persistence, soft line voids, orders.amend() transaction |
| 🔴 | [`order-amend-api`](order-amend.md#order-amend-api) | PATCH .../items, PATCH .../adjustments, DELETE .../items/:itemId |
| 🔴 | [`void-reason-and-audit`](order-amend.md#void-reason-and-audit) | Required cancel reason + the full void/discount/amend audit taxonomy |
| 🔴 | [`order-edit-panel-web`](order-amend.md#order-edit-panel-web) | Edit-order panel on the order detail page + supplementary KOT |
| 🟠 | [`order-lifecycle-timestamps`](order-amend.md#order-lifecycle-timestamps) | Lifecycle timestamps, recall transitions and punch-and-pay in the state machine |
| 🟠 | [`punch-and-pay-ui`](order-amend.md#punch-and-pay-ui) | Tender picker on the order builder + one-tap settle on the orders list row |
| 🟠 | [`diner-self-cancel`](order-amend.md#diner-self-cancel) | Diner grace-window cancel on the QR order |

**Done when:**

- A re-pricing engine persists adjustment intent, supports soft line voids, and applies the whole amendment in one locked orders.amend() transaction that re-derives per-line and rate-wise tax through the M1 engine.
- PATCH .../items, PATCH .../adjustments and DELETE .../items/:itemId exist with failing-test-first route tests; amending an order NEVER issues a second invoice serial for the same document.
- The kitchen receives a supplementary KOT covering only the added lines — an amended order does not re-fire the whole ticket.
- Cancelling requires a reason; the void / discount / amend audit taxonomy is complete and every row names the staff member (depends on M3), so genuine voids are separable from honest ones.
- Lifecycle timestamps and recall transitions exist in the state machine; punch-and-pay works via a tender picker on the order builder and one-tap settle on the orders list row.
- A QR diner can cancel inside a grace window and the kitchen board reflects it immediately.

---

### M7 — Find any bill, keep any customer

*7.5 engineer-days*

**Goal.** This morning's bill is findable during evening service — by bill number, phone or name over an IST date range — so a duplicate copy, a card refund or a dispute stops being impossible after 50 orders; and the phone number a diner types finally becomes a customer record.

| | Work item | |
|---|---|---|
| 🔴 | [`orders-list-query`](order-history.md#orders-list-query) | Filterable, keyset-paginated order list API |
| 🔴 | [`orders-browser`](order-history.md#orders-browser) | Orders page: search, date range, source/unpaid filters, pagination, live poll |
| 🟠 | [`customer-capture`](order-history.md#customer-capture) | Wire upsertFromOrder into order creation; make the phone-number promise honest |
| 🟠 | [`public-route-tests`](order-history.md#public-route-tests) | Backfill the missing tests for the two untested public routes |

**Done when:**

- GET /cafes/:cafeId/orders accepts bill number, phone, name, IST date range, status, source and payment-status filters with keyset pagination and a summary strip; the hardcoded listByCafe(cafeId, 50) is gone.
- The orders page is a live-polling browser over that API: on a 120-cover fixture day, an operator finds a named 11:00 bill during evening service in under five seconds.
- CustomersRepository.upsertFromOrder is wired into BOTH order-creation paths (counter and public QR) so the captured phone number becomes a real customer row.
- POST /public/cafes/:slug/orders and GET /public/cafes/:slug have route tests, closing the repo's two untested public routes and restoring the TDD rule.

---

### M8 — Dine-in that can be trusted

*13.5 engineer-days*

**Goal.** Food arrives at the right table and QR money lands on the right tab: table sessions get real constraints and a state machine, orders are bound to them server-side, and a ₹2,400 tab can no longer be abandoned by one unconfirmed tap with nobody's name on it.

| | Work item | |
|---|---|---|
| 🔴 | [`table-integrity-schema`](dine-in.md#table-integrity-schema) | Constraints, indexes and archival for the table layer (migration 0013) |
| 🔴 | [`order-session-binding`](dine-in.md#order-session-binding) | Validate tableSessionId and derive tableLabel server-side on order create |
| 🔴 | [`qr-orders-join-tab`](dine-in.md#qr-orders-join-tab) | QR orders resolve their table and join (or open) that table's tab |
| 🔴 | [`session-lifecycle-guards`](dine-in.md#session-lifecycle-guards) | State guards, force-close confirmation + audit, and table archival |
| 🟠 | [`billed-state-and-reprint`](dine-in.md#billed-state-and-reprint) | Make the Billed floor state real, and reach the bill again after settling |

**Done when:**

- Migration 0013 (additive) adds the missing FKs on orders.table_session_id and table_sessions.table_id, a partial unique index enforcing one live tab per table, the hot-path index on orders.table_session_id, and table archival.
- tableSessionId is validated and tableLabel is DERIVED server-side on every order-creation path; a round can no longer reach the kitchen labelled 'Walk-in' while charging a table's tab.
- A QR order scanned at a table resolves that table and joins (or opens) its tab, so diner-paid money appears on the same bill the waiter settles.
- Illegal session transitions are refused; a force-close requires explicit confirmation and writes an audit row naming the staff member (depends on M3).
- 'Billed' is a real floor state, and a settled tab's bill can be reached and reprinted afterwards — bill_print_count increments and the reprint is stamped DUPLICATE via the M1 renderer.

---

### M9 — A kitchen board that tells the truth

*17.5 engineer-days*

**Goal.** The kitchen stops silently lying: the board says when it is stale, shouts when a ticket lands or is cancelled, lets a cook bump and recall, carries per-line instructions, and an item that runs out 86s itself on both menus instead of selling for another three hours.

| | Work item | |
|---|---|---|
| 🔴 | [`kds-connection-truth`](kitchen.md#kds-connection-truth) | The Live badge reflects real refresh state; expired sessions and dead polls are surfaced instead of swallowed |
| 🟠 | [`kds-new-ticket-alert`](kitchen.md#kds-new-ticket-alert) | A new ticket makes a noise, buzzes, badges the tab title, and shows a count in the shell nav from any screen |
| 🟠 | [`cancelled-ticket-card`](kitchen.md#cancelled-ticket-card) | A cancelled order stays on the board as a loud CANCELLED card the cook must acknowledge |
| 🟠 | [`kitchen-close-and-recall-ui`](order-amend.md#kitchen-close-and-recall-ui) | Kitchen board: Served bump, recall control, per-state age badge, ticket links to the order |
| 🟠 | [`per-line-notes`](kitchen.md#per-line-notes) | Per-item instructions can actually be entered — at the counter and by the diner |
| 🔴 | [`stock-enforcement`](menu.md#stock-enforcement) | Atomic stock reservation inside the order transaction, sold-out on both menus, per-line rejection |
| 🟠 | [`stock-decrement-auto-86`](kitchen.md#stock-decrement-auto-86) | Stock actually moves when an order is placed, and an item that hits zero 86s itself |
| 🟠 | [`inline-86`](kitchen.md#inline-86) | 86 an item in two taps from the order pad and from the kitchen board, with an audit trail |
| 🟠 | [`reject-only-bad-lines`](kitchen.md#reject-only-bad-lines) | An unavailable item rejects its own line instead of 400-ing the whole cart |

**Done when:**

- The Live badge reflects real refresh state; an expired session or a dead poll is surfaced on the board instead of being swallowed by a silent 10-second repaint.
- A new ticket makes a noise, buzzes, badges the tab title and shows a count in the shell nav from any screen; a cancelled order stays on the board as a loud CANCELLED card the cook must acknowledge.
- The board supports a Served bump, a recall control, a per-state age badge, and a link from ticket to order; the counter and the diner can both attach per-line instructions that print on the KOT.
- Stock is reserved and decremented ATOMICALLY inside the order-creation transaction (decrementForOrder is finally called); an item that hits zero 86s itself and disappears from both the diner and counter menus.
- An unavailable item rejects only its own line with per-line feedback instead of 400-ing the whole cart.
- An item can be 86'd in two taps from the order pad and from the kitchen board, with an audit row naming the staff member.

---

### M10 — A room a waiter can actually run

*12.5 engineer-days*

**Goal.** Floor operations become real: a tab can be moved, merged or split, settled with split tender and a bill-level discount against a true tender ledger, kept live so nobody settles a stale total, and a table can be seated, settled and closed while the internet is down.

| | Work item | |
|---|---|---|
| 🟠 | [`session-move-merge-split`](dine-in.md#session-move-merge-split) | Move, merge and split a tab; edit guest details after seating |
| 🟠 | [`table-session-split-settle`](order-amend.md#table-session-split-settle) | Split-tender + bill-level discount on a table tab, with a real tender ledger |
| 🟠 | [`tab-sheet-live-refresh`](dine-in.md#tab-sheet-live-refresh) | Keep the open tab sheet live so nobody settles a stale total |
| 🟠 | [`offline-table-actions`](dine-in.md#offline-table-actions) | Seat, settle and close a table while the internet is down |

**Done when:**

- A tab can be moved to another table, merged with another tab, or split into two, and guest name/phone/party size can be edited after seating — every destructive action audited with an actor.
- Split-tender settle plus a bill-level discount on a tab writes real order_payments rows that reconcile with the M4 drawer and the M4 dashboard tender rows.
- The open tab sheet refreshes live; two devices viewing the same tab cannot settle different totals.
- Seat, settle and close work offline on the M5 queue, and the resulting orders reconcile on sync without duplicating a tab or a serial.

---

### M11 — A menu the owner can run a service from

*16.5 engineer-days*

**Goal.** The menu stops being write-mostly: a typo'd category can be renamed or removed instead of living forever on every table's QR code, half/full plate and priced add-ons are one item instead of duplicates, a corrected CSV re-upload no longer doubles the menu, and every price change has a name on it.

| | Work item | |
|---|---|---|
| 🔴 | [`category-lifecycle`](menu.md#category-lifecycle) | Category rename / hide / delete / reassign, and moving an item between categories |
| 🟠 | [`menu-ordering`](menu.md#menu-ordering) | Explicit category and item ordering: bulk reorder endpoints, up/down controls, importer sort order |
| 🟠 | [`item-modifiers`](menu.md#item-modifiers) | Half/full plate and priced add-ons: modifier CRUD, order-line pricing, snapshot on the bill |
| 🟠 | [`csv-import-idempotency`](menu.md#csv-import-idempotency) | Transactional, deduplicating, batched CSV import plus bulk-select delete recovery |
| 🟠 | [`menu-write-audit-and-cache`](menu.md#menu-write-audit-and-cache) | Audit trail for menu price/name/86/delete, and the AI console's missing cache bust |
| 🟡 | [`menu-stale-write-409`](onboarding.md#menu-stale-write-409) | Dirty-field patches plus an If-Match precondition on menu item edits |
| 🟡 | [`menu-editor-ux`](menu.md#menu-editor-ux) | Add-item form parity, menu search/filter/collapse, and visible 86 / sold-out treatment |

**Done when:**

- Categories can be renamed, hidden, deleted with reassignment, and items moved between categories; a typo'd category no longer survives on the live QR menu forever.
- Explicit category and item ordering ships with bulk reorder endpoints, up/down controls, and an importer that honours sort order.
- Half/full plate and priced add-ons (the menu_item_modifiers / menu_modifier_options tables unused since migration 0001) price correctly into the bill through the M1 engine and are snapshotted onto the order line so history cannot drift.
- Re-uploading a corrected CSV is transactional, deduplicating and batched — it updates rather than doubling — and bulk-select delete gives a recovery path from a bad import.
- Menu price / name / 86 / delete writes land in the audit log, the AI console busts the menu cache it currently leaves stale, and a concurrent edit gets a 409 via an If-Match precondition with dirty-field patches.
- Add-item form parity with edit, plus menu search / filter / collapse and a visible 86 / sold-out treatment in the editor.

---

### M12 — Cafe number two, without the founder on site

*11 engineer-days*

**Goal.** A second cafe can be onboarded and supervised remotely: install day takes an hour instead of a day, a new owner self-serves to a first bill, one busy cafe's diners cannot throttle another's, an owner can spot a till that is short every Saturday, and a bigger kitchen can split the hot line from the beverage counter.

| | Work item | |
|---|---|---|
| 🟠 | [`env-config-preflight`](onboarding.md#env-config-preflight) | Document the real Supabase env surface and fail loudly instead of silently degrading |
| 🟡 | [`first-run-checklist`](onboarding.md#first-run-checklist) | First-run setup checklist on the dashboard, and stop the empty menu dead-ending |
| 🟡 | [`email-verification`](onboarding.md#email-verification) | Prove the signup email address; surface an unverified banner |
| 🟠 | [`public-rate-limit-keying`](onboarding.md#public-rate-limit-keying) | Stop every cafe's diners sharing one 100/min anonymous bucket |
| 🟡 | [`audit-log-filters`](onboarding.md#audit-log-filters) | Make the audit log filterable by something that exists, with dates and paging |
| 🟠 | [`drawer-session-history`](day-close.md#drawer-session-history) | Drawer history: list and inspect closed shifts |
| 🟠 | [`station-routing`](kitchen.md#station-routing) | Per-station routing: a station on every item, a station view on the board, and per-item bumping |

**Done when:**

- A fresh deploy with missing or wrong Supabase config fails loudly at boot with an actionable message instead of silently degrading in two misleading ways; the real env surface is documented and a preflight check passes on a clean machine.
- A brand-new owner reaches a first correct bill unaided: a first-run setup checklist on the dashboard, an empty menu that offers a next step instead of dead-ending, a verified signup email and an unverified-account banner.
- The public rate limiter is keyed per cafe (and per client), so one cafe's dinner rush cannot exhaust another cafe's diners' 100/min bucket.
- The audit log is filterable on fields that actually exist, with date ranges and paging; drawer history lists and inspects closed shifts so a recurring Saturday shortage is visible without a database query.
- Every menu item carries a station, the kitchen board has a per-station view with per-item bumping, and a two-station kitchen runs one board per station off the same tickets.

---

## Effort by theme

| Theme | Days | Items | Plan |
|---|---|---|---|
| Order amendment, void discipline & lifecycle | 29 | 12 | [order-amend.md](order-amend.md) |
| Dine-in table integrity | 29 | 11 | [dine-in.md](dine-in.md) |
| Menu completeness: categories, modifiers, stock, CSV | 19 | 7 | [menu.md](menu.md) |
| Onboarding, validation & config hygiene | 19 | 12 | [onboarding.md](onboarding.md) |
| Payment reliability & per-cafe settlement | 18 | 6 | [payments.md](payments.md) |
| Kitchen display robustness & routing | 18 | 10 | [kitchen.md](kitchen.md) |
| Tax correctness: per-item GST, rate-wise summary, session totals | 15 | 7 | [tax-correctness.md](tax-correctness.md) |
| Staff identity, roles & account recovery | 14 | 5 | [staff-identity.md](staff-identity.md) |
| Day close, drawer & anti-fraud reporting | 10 | 6 | [day-close.md](day-close.md) |
| Offline resilience & idempotency | 9 | 5 | [offline.md](offline.md) |
| Order search, history & live refresh | 7.5 | 4 | [order-history.md](order-history.md) |

**187.5 days total across themes.**
(Milestone totals differ slightly — they re-cut the same work by shipping order.)

