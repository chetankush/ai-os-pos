# Core POS flows — user stories & build status

Eight end-to-end flows, each derived as a user story, decomposed into acceptance
criteria, then audited against the actual code. Every status below was checked by
reading the implementation chain — db schema → repository → API route → web page →
UI control — and then independently re-checked by a second pass whose job was to
*refute* each claimed gap.

A criterion is only ✅ if a real cafe owner can complete it in the running app.
An API with no UI reaching it, or a UI with no API behind it, is 🟡 at best.

**Overall: 31/98 criteria fully implemented (30 partial, 37 missing).**

| | meaning |
|---|---|
| ✅ | implemented end to end |
| 🟡 | partial — works only for some cases, or one layer is missing |
| ❌ | missing |

---

## 1. Owner onboarding & auth

> As the owner of a small Indian cafe, I want to sign up, create my outlet with its GST identity, and get myself and my counter staff onto a working POS the same morning, so that I can start punching and billing orders that day without a vendor visit and without anyone touching the database.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | A brand-new owner can create an account with email + password from the public site and be signed in immediately, with no confirmation-email round-trip | ✅ | `apps/api/src/routes/auth.ts:69-82 (admin create with email_confirm:true) + apps/web/src/app/(auth)/signup/signup-form.tsx:63-88 (signup then signInWit…` |
| 2 | A returning owner can sign in each morning, the session survives reloads and reopening the browser, and any anonymous hit on a POS URL is bounced to /login | ✅ | `apps/web/src/lib/supabase/middleware.ts:28-49 (cookie refresh + redirect) and apps/web/src/app/cafes/layout.tsx:14-19 (server-side getUser re-check)` |
| 3 | An owner who forgets or wants to change their password (or mistyped their email at signup) can recover access without engineering help | ❌ | `grep for resetPasswordForEmail\|updateUser\|signInWithOtp across apps/web/src and apps/api/src returns zero hits; apps/web/src/app/(auth)/login/page.t…` |
| 4 | The owner can create a cafe with name, address, pincode, GSTIN, FSSAI and GST mode entirely through the UI and it persists | ✅ | `apps/web/src/app/cafes/new/new-cafe-form.tsx:110-141 -> apps/api/src/routes/cafes.ts:88-137 -> packages/db/src/schema/cafes.ts:17-54` |
| 5 | Onboarding details entered wrong (GSTIN typo, wrong GST mode, wrong address) can be corrected later and the correction reaches the printed bill | ✅ | `apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx:162-204 -> apps/api/src/routes/cafes.ts:157-169 -> rate via apps/api/src/orders/build.ts:117-125,1…` |
| 6 | GSTIN/FSSAI are validated well enough that a mistyped number is caught before it goes onto months of tax invoices, and a cafe charging GST actually has a GSTIN on the bill | 🟡 | `apps/api/src/routes/cafes.ts:24-25 accepts any 15 characters as GSTIN and any 7-14 characters as FSSAI (no digit/checksum/state-code check); nothing t…` |
| 7 | After creating the cafe the owner is led to a POS they can actually punch an order on (menu items, tables) without SQL | 🟡 | `menu and tables ARE creatable from the UI (apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:122-143, apps/web/src/app/cafes/[id]/tables/floor-view.tsx…` |
| 8 | One owner's cafe data is invisible to every other Sangam customer, with no existence leak on a guessed id | ✅ | `apps/api/src/repositories/cafes.ts:64-71 (findByIdAndOwner) used by apps/api/src/routes/cafes.ts:144-169; covered by apps/api/src/routes/cafes.test.ts…` |
| 9 | A cashier or waiter can get onto the POS under their own identity so two staff can work the floor at once and the audit log shows who voided/discounted what | ❌ | `packages/db/src/schema/staff.ts:11-24 stores pinHash but the comment states 'PIN login enforcement comes later'; apps/api/src/lib/pin.ts:20 verifyPin …` |
| 10 | An owner with more than one outlet can see all of them and switch between them | ✅ | `apps/web/src/app/cafes/page.tsx:26,46-73 lists cafes from GET /cafes scoped by owner (apps/api/src/routes/cafes.ts:139-142)` |
| 11 | The owner can sign out of a shared counter terminal and the session is actually cleared | ✅ | `apps/web/src/app/cafes/layout.tsx:43-47 (sign-out form) -> apps/web/src/app/cafes/actions.ts:6-10 (supabase.auth.signOut + redirect '/login')` |
| 12 | A wobbly internet link during service does not throw signed-in staff back to the login screen | ❌ | `apps/web/src/lib/supabase/middleware.ts:28-30 calls supabase.auth.getUser() (a live call to Supabase) on every navigation and discards the error, so a…` |

## 2. Menu management

> As a cafe owner, I want to set up and continuously correct my menu — categories, prices, veg/HSN details, portion variants and photos — and let anyone on shift instantly mark an item out of stock, so that the QR menu and the counter POS always sell exactly what my kitchen can deliver today, at the right price and the right GST.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Owner can create a menu category from the UI and it appears immediately in the editor and on the public QR menu | ✅ | `packages/db/src/schema/menu.ts:17-35 -> apps/api/src/repositories/menu.ts:93-97 -> apps/api/src/routes/menu.ts:104-126 -> apps/web/src/app/cafes/[id]/…` |
| 2 | Owner can add an item with name, price in rupees, veg flag, HSN code, description, diet flags (vegan/egg), spice level and a photo, all in one pass | 🟡 | `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:789-796 — AddItemForm state carries only name/price/description/hsn/gst/isVeg; the POST body at :824-…` |
| 3 | Any staff member on shift can 86 an item in one tap and it stops being sellable on both the QR menu and the counter POS | 🟡 | `The toggle itself works: apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:378-400 -> PATCH apps/api/src/routes/menu.ts:246-282 -> apps/api/src/routes/…` |
| 4 | Correcting a wrong price or name mid-service takes effect on the next bill without rewriting bills already printed | ✅ | `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:464-707 (EditItemForm) -> apps/api/src/routes/menu.ts:246-282 with cache bust at :279; apps/api/src/o…` |
| 5 | A per-item GST rate (e.g. 18% on packaged goods inside a 5% restaurant) is actually charged on the bill | ❌ | `apps/api/src/orders/build.ts:173 — `const gstRateBp = gstRateBpFor(cafe.gstMode);` is the ONLY tax source. gstRateBpOverride is stored (packages/db/sr…` |
| 6 | HSN/SAC codes captured on items reach the printed GST invoice and can be bulk-loaded for a whole menu | 🟡 | `Invoice side works: apps/api/src/orders/build.ts:166 -> packages/db/src/schema/orders.ts:119 -> apps/web/src/app/cafes/[id]/orders/[orderId]/print-vie…` |
| 7 | Owner can delete an item punched in by mistake without corrupting past bills | ✅ | `apps/api/src/repositories/menu.ts:114-120 -> apps/api/src/routes/menu.ts:284-306 -> apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:416-424 (trash bu…` |
| 8 | Owner can fix menu structure after setup — rename a category, delete or hide an empty/seasonal one, and move an item into a different category | ❌ | `apps/api/src/repositories/menu.ts:43-51 — the MenuRepository interface has no updateCategory or deleteCategory; apps/api/src/routes/menu.ts:104 is the…` |
| 9 | Owner can control the order categories and items appear in on the diner menu (Starters -> Mains -> Desserts, bestsellers first) | ❌ | `sortOrder exists at packages/db/src/schema/menu.ts:23,59, is the primary ORDER BY in apps/api/src/repositories/menu.ts:61,66, and is accepted by the A…` |
| 10 | Owner can bulk-load a 150-item menu from a spreadsheet, preview what will import, and safely re-run it after fixing the rejected rows | 🟡 | `Preview + import work: apps/api/src/menu/import.ts:90-202, apps/api/src/routes/menu.ts:175-244, apps/web/src/app/cafes/[id]/menu/menu-import.tsx:108 (…` |
| 11 | Cafe can sell half/full portions and priced add-ons (extra cheese, extra shot, sugar level) at the correct price | ❌ | `packages/db/src/schema/menu.ts:73-96 defines menu_item_modifiers + menu_modifier_options, shipped in packages/db/drizzle/migrations/0001_giant_luke_ca…` |
| 12 | An item whose stock runs out stops selling without someone remembering to 86 it by hand | ❌ | `apps/api/src/repositories/inventory.ts:28,98 defines decrementForOrder with a comment saying it is 'intended to be called from order creation'; a grep…` |

## 3. Counter order to paid bill

> As a counter cashier in a busy Indian cafe, I want to punch a walk-in customer's order, amend it as they change their mind, fire a KOT to the kitchen, print a GST bill and take the money by cash/UPI/card, so that every rupee crossing the counter lands on a legally numbered invoice and the drawer tallies at closing.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Cashier can build a cart fast: search or tap items, bump quantity up/down, and remove a line, with a live total that matches what the server will charge | ✅ | `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:513 (search), :558 (tap tiles), :235 (setQuantity), :904-932 (cart +/-/trash), :118-154 (comp…` |
| 2 | Cashier can attach a per-item kitchen instruction ("no onion", "less sugar") that prints on the KOT for that line | 🟡 | `DB packages/db/src/schema/orders.ts:120 (order_items.notes), API accepts it apps/api/src/routes/orders.ts:53, persisted apps/api/src/orders/build.ts:1…` |
| 3 | Cashier can apply a % or ₹ discount (with reason), service charge, packaging charge and round-off, see the exact payable before placing, and have the server recompute it authoritatively | ✅ | `order-builder.tsx:973-1055 (UI), :343-354 (payload); apps/api/src/routes/orders.ts:58-67 (zod), apps/api/src/orders/build.ts:60-105 (server math), per…` |
| 4 | Placing the order allocates a gapless legal invoice number and fires a kitchen ticket without extra cashier steps | ✅ | `apps/api/src/repositories/orders.ts:111-125 (atomic invoice_sequences upsert inside the create transaction); auto-KOT order-builder.tsx:370-380 → prin…` |
| 5 | Cashier can print a GST-compliant customer bill, and any second copy is visibly stamped DUPLICATE and recorded for audit | ✅ | `print-views.tsx:117-120 → :30-49 POST bill-printed → apps/api/src/routes/orders.ts:310-351 (audit entry :336-347) → apps/api/src/repositories/orders.t…` |
| 6 | Cashier can take payment by cash, UPI or card — including a split across two or three tenders — and the order lands completed+paid with a tender ledger on the bill | ✅ | `order-actions.tsx:311-456 (single + split picker), :168-188 (settle) → apps/api/src/routes/orders.ts:354-390 (sum must equal total, 409 if already pai…` |
| 7 | For a takeaway that is paid the moment it is punched, the cashier can settle the bill in one action rather than walking the order through the kitchen states | ❌ | `apps/api/src/routes/orders.ts:93-100 ALLOWED_TRANSITIONS forbids pending→completed (test asserts it: apps/api/src/routes/orders.test.ts:526); order-ac…` |
| 8 | When a customer changes their mind after the order is placed — wrong item punched, quantity wrong, or "add one more chai" — the cashier can amend that order instead of voiding and re-punching the whole bill | ❌ | `apps/api/src/repositories/orders.ts:45-104 OrdersRepository has no update/replace/add-item method; apps/api/src/routes/orders.ts exposes only POST /or…` |
| 9 | Cashier can void a placed order safely — with a reason, an audit trail, and a way to return money if it was already paid | 🟡 | `Cancel works with a confirm dialog: order-actions.tsx:472-495 → apps/api/src/routes/orders.ts:259-298. But that handler never calls auditRepo (contras…` |
| 10 | When an item runs out mid-service, staff can 86 it and the counter pad stops selling it without the next order failing outright | 🟡 | `Toggle exists only in the menu editor: apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:273-284 and :381-396. The order pad filters availability from …` |
| 11 | When the internet drops, the counter keeps taking orders and the customer still gets a numbered bill; nothing is duplicated when the link returns | 🟡 | `Queue + auto-replay work: apps/web/src/lib/offline-queue.ts:94-105, :140-158 and use-offline-queue.ts:59-85, wired at order-builder.tsx:389-399. But t…` |
| 12 | A day with two people on the counter works: each sale is attributable to who took it, bill numbers never collide, and any bill from earlier in the day can be found again to reprint, refund or tally against the drawer | 🟡 | `Numbering is safe (apps/api/src/repositories/orders.ts:115-125). Everything else is not: packages/db/src/schema/staff.ts:14 says "PIN login enforcemen…` |

## 4. Dine-in table service

> As a waiter on the floor of a busy Indian cafe, I want to seat a table, punch rounds of orders onto its running tab through the evening, correct mistakes, hand over one combined bill and settle it, so that the kitchen sends food to the right table, nothing the guests ate goes unbilled, and the table is freed for the next party.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | A cafe can lay out its floor: add tables with label/area/seats/shape, drag them into a room plan, and have positions persist across reloads. | ✅ | `apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:112 (savePosition -> PATCH), :600 (create), :729 (edit); apps/api/src/routes/tables.ts:66,…` |
| 2 | A waiter taps a free table, records guest name/party size, and the table shows as Occupied on the live floor with its running total. | ✅ | `apps/web/src/app/cafes/[id]/tables/open-session-sheet.tsx:56 -> apps/api/src/routes/table-sessions.ts:75; apps/api/src/repositories/table-sessions.ts:…` |
| 3 | Multiple rounds of orders attach to one running tab, and the waiter can view the combined tab with every round and a single total. | ✅ | `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx:171 (Add items -> ?session=), apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:342 …` |
| 4 | Every dine-in round reaches the kitchen tagged with its table number, on both the printed KOT and the kitchen display. | ❌ | `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:340 sets tableLabel only from the manual text field, never from sessionTableLabel (:476); res…` |
| 5 | A wrong item punched onto a live tab can be corrected from the tab itself (remove a line or void that round) and the tab total updates. | 🟡 | `Cancel exists only at whole-order level (apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:481,494 -> apps/api/src/routes/orders.ts:259) …` |
| 6 | When an item runs out (86'd), it can no longer be added to any open tab. | 🟡 | `Toggle exists (apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:272-282,384) and the builder filters unavailable items (apps/web/src/app/cafes/[id]/or…` |
| 7 | An order the diner places from that table's QR menu joins the same table tab, so the settled bill includes it. | ❌ | `apps/api/src/routes/public.ts:128 hardcodes tableSessionId: null (the diner's tableLabel at :127 is free text only); nothing joins a public order to a…` |
| 8 | The whole tab prints as one GST tax invoice whose Subtotal + CGST + SGST equals the Total, with reprints tracked as duplicates. | 🟡 | `Print page merges rounds correctly (apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:39,187) but prints Subtotal/CGST/SGST/Total…` |
| 9 | The full table bill can be settled in one action — including split tender across cash/UPI and a bill-level discount — and the table returns to Free. | 🟡 | `Single-tender settle works end to end (apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx:59 -> apps/api/src/routes/table-sessions.ts:132 -> a…` |
| 10 | After the bill is handed to the guests, the floor shows that table as billed/awaiting payment so a second waiter does not re-bill it. | ❌ | `'billed' is defined at packages/db/src/schema/tables.ts:46, read at apps/api/src/repositories/table-sessions.ts:57 and drawn in the legend at apps/web…` |
| 11 | A waiter can transfer a tab to another table, merge two tables into one bill, or split a table's bill between guests. | ❌ | `No route (apps/api/src/routes/table-sessions.ts:50-169 has only floor/history/open/get/settle/close), no repository method (apps/api/src/repositories/…` |
| 12 | Two waiters can work the floor at the same time under their own identities without double-opening or double-settling a table. | ❌ | `All table routes gate on owner identity only (apps/api/src/routes/table-sessions.ts:46-48, apps/api/src/routes/tables.ts:51-53); staff PIN login is ex…` |

## 5. Kitchen display & order lifecycle

> As kitchen staff at a busy Indian cafe, I want every new order to land on a kitchen screen the moment it is punched and to move it through pending, preparing and ready with one tap — including when it is cancelled, changed, or an item runs out — so that food goes out in the right order, nothing is cooked twice or forgotten, and the counter always knows what is ready to serve.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | New tickets from every source (counter, QR, phone) appear on the kitchen screen automatically without a manual reload, oldest-first, showing item names, quantities, table/source and an age timer. | ✅ | `apps/api/src/repositories/orders.ts:210-239 (status filter + asc(createdAt) + batched items); apps/api/src/routes/orders.ts:196-209; apps/web/src/app/…` |
| 2 | Kitchen staff move a ticket pending -> preparing -> ready with one tap, and the change persists across a device reload and is visible to the counter. | ✅ | `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:31-51 (columns + bump targets), 118-144 (PATCH + optimistic + reconcile); apps/api/src/routes/or…` |
| 3 | A ready ticket is closed out and leaves the board when the food is handed over, without a cook hunting for that order elsewhere in the app. | 🟡 | `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:46-50 (ready column bump:null), 240-324 (ticket card has no link to the order); completion exist…` |
| 4 | When the counter cancels/voids an order, the kitchen is told to stop cooking it — the ticket is visibly marked cancelled, not silently removed. | 🟡 | `cancel exists at apps/api/src/routes/orders.ts:93-100 and apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:472-495, but apps/api/src/rep…` |
| 5 | A ticket bumped by mistake (tapped Ready too early) can be pulled back to preparing from the kitchen screen. | ❌ | `apps/api/src/routes/orders.ts:93-100 ALLOWED_TRANSITIONS is forward-only (ready -> completed\|cancelled only); apps/web/src/app/cafes/[id]/kitchen/kit…` |
| 6 | A customer changing their mind or a wrong item punched can be fixed by editing/voiding that one line, without voiding the whole bill. | ❌ | `no order-item mutation endpoint exists — apps/api/src/routes/orders.ts registers only create (122), list (181), kitchen feed (196), stats (213), get (…` |
| 7 | An item that runs out mid-service can be flagged from the kitchen so the counter and the QR menu stop selling it, and open tickets for it are stopped. | ❌ | `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:304-322 offers only the bump button — no 86/out-of-stock action; availability is only editable i…` |
| 8 | Special instructions ("no onion", "less spicy") captured at the counter or by the diner reach the kitchen on the correct line of the ticket. | 🟡 | `the KDS renders them (apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:283-296, 298-302) and API/DB accept them (apps/api/src/routes/orders.ts:48…` |
| 9 | Two devices acting at once (kitchen bumps while the counter completes/cancels) never corrupt the order state, and the losing device is told what happened. | ✅ | `apps/api/src/routes/orders.ts:278-286 (INVALID_TRANSITION guard against the freshly-read current status); apps/web/src/app/cafes/[id]/kitchen/kitchen-…` |
| 10 | When the cafe wifi drops or the login session expires, the kitchen can tell the board is stale rather than trusting a frozen screen. | ❌ | `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:96-99 swallows every non-manual failure; 53-62 sends no Authorization header once the session is…` |
| 11 | Per-station routing: the hot kitchen and the beverage/chai counter each see only the lines they cook. | ❌ | `zero occurrences of "station" in apps/api/src, apps/web/src, packages/db/src, packages/types/src and packages/db/drizzle; no station column on package…` |
| 12 | Kitchen staff can sign in on the kitchen device with kitchen-only access, and every bump/void is attributable to a person for the day-end review. | ❌ | `apps/api/src/routes/orders.ts:116-118 and 200-205 gate on cafesRepo.findByIdAndOwner; apps/api/src/plugins/auth.ts:78-129 accepts only a Supabase user…` |

## 6. QR diner self-ordering & payment

> As a diner seated at a table in an Indian cafe, I want to scan the table QR to browse the live menu, order and pay from my own phone, and watch my order go from placed to ready, so that I am served without flagging down a waiter and the cafe turns the table faster with fewer staff and no bill disputes.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | The owner can generate and print a per-table QR code that opens this cafe's live menu with the table already identified. | ✅ | `apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:132 (urlFor builds /m/{slug}?table={label}), :148-157 (Print QR codes button), :247 (QRCod…` |
| 2 | A diner who scans sees only items the cafe currently sells, with prices and the true GST-inclusive payable total before committing — no surprise at the payment screen. | ✅ | `apps/api/src/routes/public.ts:78-81 filters items on isAvailable; gstRateBp exposed at public.ts:97 (apps/api/src/orders/build.ts:117-127); diner-orde…` |
| 3 | A diner can build a cart, change their mind (add, remove, change quantity) and attach special instructions such as "no onion / less spicy" that reach the kitchen ticket. | 🟡 | `Cart edit works: diner-order.tsx:119-138 (inc/dec), :752-773 (per-card stepper), :544-567 (cart line steppers). Special instructions do NOT exist in t…` |
| 4 | Placing an order creates a correctly numbered order at the right table that appears on the kitchen board within seconds AND marks the table as occupied on the floor plan. | 🟡 | `Kitchen half works: order created at public.ts:148 with tableLabel (:127) and gapless bill number (orders.ts:112-121); listKitchenTickets picks up 'pe…` |
| 5 | In prepaid-required mode, an order does not reach the kitchen until payment is verified, and an abandoned unpaid order never becomes a kitchen ticket. | ❌ | `apps/api/src/routes/public.ts:148 creates the order (default status 'pending', packages/db/src/schema/orders.ts:46) BEFORE any payment; the client onl…` |
| 6 | In pay-at-table mode, the diner can choose pay-now or pay-at-counter, and the cashier can later settle that unpaid QR order with cash/UPI/card (including a split). | ✅ | `diner-order.tsx:341-343 sets the 'choose' state; Confirmation renders both CTAs at :934-949. Counter settlement: order-actions.tsx:296-352 (single-ten…` |
| 7 | An online payment is confirmed server-side and recorded exactly once — including when the diner leaves to a UPI app and the browser tab is killed — and a retry never double-charges. | 🟡 | `Verification itself is correct: amount always read from the DB row (payments.ts:103), timing-safe HMAC (apps/api/src/payments/razorpay.ts:61-74), 409 …` |
| 8 | If payment is interrupted, the diner can come back — after a reload or a phone lock — and still see and pay that order from their phone. | 🟡 | `The order survives and live status is visible: it is written to localStorage (apps/web/src/lib/diner-orders.ts:35-44) and "Your orders" polls the serv…` |
| 9 | Several rounds of ordering from the same table roll up into ONE bill so the cashier settles the table once. | ❌ | `apps/api/src/routes/public.ts:128 sets tableSessionId:null on every QR order; the counter flow proves the mechanism exists and is deliberately not use…` |
| 10 | When an item runs out mid-service it stops being orderable, and a diner holding a stale menu gets a clear, actionable rejection rather than a dead end. | 🟡 | `Server-side guard is real: buildOrder throws ITEM_UNAVAILABLE naming the item (apps/api/src/orders/build.ts:160-162) → 400 (public.ts:118-121) → shown…` |
| 11 | A diner who pays online gets a GST-compliant tax invoice / bill of supply for what they paid, on their phone. | ❌ | `Bill rendering is owner-only: apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:4 + apps/web/src/lib/bill-document.ts:19-30, mounted only o…` |
| 12 | Money from a QR payment lands in the cafe's own account and reconciles cleanly into the day-end report and the order's tender ledger. | 🟡 | `Day-end does count it: markPaid sets paymentMethod:'online' (apps/api/src/repositories/orders.ts:303-316) which the report groups on (apps/api/src/rep…` |

## 7. Billing correctness & printed documents

> As a cafe cashier, I want to punch an order, send a priced-free KOT to the kitchen and hand the customer a correctly-taxed, serially-numbered bill that matches my cash drawer at close, so that the customer trusts the total, the kitchen makes the right food, and the owner can file GST and reconcile the day without hand-written corrections.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | The cafe's declared GST regime drives the rate on every bill, correctly for all four gstMode values (regular_5 → 5%, regular_18 → 18%, composition → 0%, exempt → 0%), computed server-side so the counter and QR flows cannot diverge. | ✅ | `apps/api/src/orders/build.ts:100-120 (gstRateBpFor), build.ts:173 (buildOrder), apps/api/src/routes/orders.ts:136 and apps/api/src/routes/public.ts:11…` |
| 2 | The printed bill splits GST into CGST + SGST at half the rate each, and the two lines sum exactly to the tax charged (no lost paise). | ✅ | `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:209-210 (cgst = floor(tax/2), sgst = tax - cgst) and 311-312 (rendered rows); halfRatePct…` |
| 3 | The cashier can apply a bill-level discount (% or flat, with reason), a service charge, a packaging charge and a nearest-rupee round-off at the counter; the screen preview matches the server to the paise, and each adjustment prints as its own line on the customer bill. | ✅ | `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:991-1055 (UI) and :131 (client preview mirroring apps/api/src/orders/build.ts:57-101); apps/a…` |
| 4 | Every bill handed to a customer carries exactly one gapless, per-financial-year serial that is safe when two terminals punch at the same instant. | 🟡 | `apps/api/src/repositories/orders.ts:110-124 allocates atomically per (cafe, FY) and is concurrency-safe; but the serial is burned at ORDER creation, a…` |
| 5 | The moment an order is punched, the kitchen gets a price-free KOT with quantities, item notes and the table, printed automatically without the cashier navigating anywhere. | ✅ | `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:386 (window.open ?autoprint=kot); print-views.tsx:78-108 (auto-print effect) and :150-187 (Ko…` |
| 6 | Reprinting a customer bill stamps the paper DUPLICATE and records the reprint, so a second unmarked copy cannot be handed to another table as an original. | 🟡 | `apps/api/src/routes/orders.ts:310-341 (POST bill-printed, audits order.bill_reprinted) + apps/api/src/repositories/orders.ts:259-267 (atomic SQL incre…` |
| 7 | Every printed bill is headed TAX INVOICE only when the cafe actually charges GST, BILL OF SUPPLY for composition/exempt cafes, and carries the composition-dealer declaration where required. | 🟡 | `print-views.tsx:204/345 correctly uses billDocumentTitle + compositionDeclaration from apps/web/src/lib/bill-document.ts:19,27; but apps/web/src/app/c…` |
| 8 | The invoice carries the Rule-46 fields a GST bill needs: HSN/SAC per line (frozen at order time), the total in words, and the buyer's GSTIN when a B2B customer asks for it. | 🟡 | `print-views.tsx:207/356 (HSN from item.hsnSnapshot), :327 (amountInWords), :268-271 (customerGstin) all render, and packages/db/src/schema/orders.ts:5…` |
| 9 | A B2B diner's GSTIN can actually be captured by the cashier at the counter so it lands on the invoice. | ❌ | `apps/api/src/routes/orders.ts:41-46 validates customerGstin and apps/api/src/repositories/orders.ts:137 persists it, but grep across apps/web/src find…` |
| 10 | A dine-in table tab prints one consolidated bill whose printed lines add up to the amount charged. | ❌ | `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:144-155 prints only Subtotal, CGST, SGST, Total — discountPaise, serviceChargeP…` |
| 11 | A per-item GST rate (e.g. packaged goods at 18% alongside food at 5%) set on the menu is actually applied to the bill. | ❌ | `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:521 saves gstRateBpOverride and apps/api/src/routes/menu.ts:37 persists it, but apps/api/src/orders/b…` |
| 12 | At close, the cashier can print a day-end Z-report that reconciles the drawer — gross, taxable value, tax, total discounts given, charges, round-off, and the bill-number range for the day. | ❌ | `apps/web/src/app/cafes/[id]/reports/reports-view.tsx:87-138 offers only a CSV download — no window.print/@page anywhere on the reports route; packages…` |
| 13 | A wrong item punched in, or a discount the customer produces after the KOT went out, can be fixed on the existing bill without voiding the order and burning a serial. | ❌ | `apps/api/src/routes/orders.ts exposes only POST /orders, GET list/stats/detail/payments, PATCH /status, POST /settle, /refund, /bill-printed — no rout…` |
| 14 | When the internet drops mid-service the counter keeps working: the kitchen still gets a KOT and the customer still gets a numbered bill. | ❌ | `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:404-410 queues the order to localStorage (apps/web/src/lib/offline-queue.ts) and returns — th…` |

## 8. Cash drawer, day close & reporting

> As the owner-cashier of a 30-seat Indian cafe, I want to open the till with a counted float, have the system tell me exactly how much cash it expects at closing, and produce a day-end Z-report that reconciles item sales, payment modes and every void, discount and refund to a named staff member, so that I can detect skimming the same night it happens and hand my CA a figure I can defend in a GST audit.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | A cashier can open a shift by entering the counted opening float, and the system refuses to open a second drawer while one is already open. | ✅ | `apps/api/src/routes/cash-drawer.ts:54-81 (409 DRAWER_ALREADY_OPEN at :64-72); repo apps/api/src/repositories/cash-drawer.ts:56-69; UI apps/web/src/app…` |
| 2 | At close, the system itself computes the expected cash (opening float + cash sales - cash refunds - cash paid out) and the cashier only enters the physically counted amount. | ❌ | `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx:247-263 renders 'Expected cash' as a free-text number input; apps/api/src/routes/cash-dr…` |
| 3 | Variance (counted vs expected) is shown at close and is a number the cashier cannot manufacture. | 🟡 | `apps/api/src/routes/cash-drawer.ts:106-109 computes counted-minus-expected and cash-drawer-panel.tsx:265-270,:339-346 renders it over/short. But both …` |
| 4 | Every cash transaction is tied to the open drawer session so a shift can be reconciled on its own (two shifts in a day, or a shift that crosses midnight). | ❌ | `No cashDrawerSessionId column anywhere: grep 'cashDrawerSessionId\|drawerSessionId\|drawer_session' over apps/api/src, packages/db/src, packages/types…` |
| 5 | Cash taken out of the drawer during the day (vegetable vendor, milk, staff advance) is recorded so it does not read as a shortage at close. | ❌ | `packages/db/src/schema/expenses.ts:22-35 has no payment-mode or drawer link; no pay-in/pay-out endpoint exists (grep payIn\|payOut\|cashIn\|cashOut ov…` |
| 6 | After a shift is closed the owner can pull it back up: opening float, counted, expected, variance, notes and who ran it. | ❌ | `apps/api/src/repositories/cash-drawer.ts:17-23 exposes only findOpen/open/close - no list or findById; apps/api/src/routes/cash-drawer.ts has only /cu…` |
| 7 | A day-end Z-report for a chosen business day shows gross, net, tax, order counts, payment-mode split and cancellations. | ✅ | `apps/api/src/repositories/reports.ts:35-157; route apps/api/src/routes/reports.ts:41-57; UI apps/web/src/app/cafes/[id]/reports/reports-view.tsx:169-2…` |
| 8 | Z-report money reconciles to cash actually collected: unpaid/in-progress orders excluded, refunds deducted, discounts given shown as a line. | ❌ | `apps/api/src/repositories/reports.ts:43 defines the revenue filter as 'not cancelled', so pending/preparing/ready unpaid orders are summed into grossS…` |
| 9 | Sales broken down by item, by category and by hour for the day. | ✅ | `apps/api/src/repositories/reports.ts:169-188 (item), :190-218 (category, with an Uncategorized bucket for deleted menu rows), :220-247 (IST hour bucke…` |
| 10 | The day's numbers can be exported to CSV for the accountant. | 🟡 | `apps/web/src/app/cafes/[id]/reports/reports-view.tsx:87-99 downloads a client-built blob, built at :395-442. It contains only the currently selected g…` |
| 11 | Voids/cancellations and discounts are written to the immutable audit log with a reason and the person responsible. | ❌ | `Only two audit actions exist in the codebase: apps/api/src/routes/orders.ts:341 ('order.bill_reprinted') and :432 ('order.refund') - grep 'auditRepo.r…` |
| 12 | Every sensitive action is attributable to a named staff member, not just 'the account holder'. | ❌ | `Staff PINs are hashed and stored (apps/api/src/routes/staff.ts:74) but apps/api/src/lib/pin.ts:20 verifyPin is never called by any route; packages/db/…` |

