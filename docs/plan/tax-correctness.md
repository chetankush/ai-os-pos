# Tax correctness: per-item GST, rate-wise summary, session totals

**Estimated effort: 15 engineer-days · 7 work items**

Today every line on every bill is taxed at one cafe-level rate, the per-item GST override the menu editor collects is never read by buildOrder, and a table tab's consolidated "TAX INVOICE" prints a Subtotal/CGST/SGST/Total block that literally does not add up once any round carries a discount or a service charge. This theme makes the money maths per-line and rate-wise end to end: a new exact integer-paise apportionment engine, per-line and rate-wise tax persisted on the order, a rate-wise CGST/SGST block plus a labelled taxable value on both the single-order and the table-session bill, session totals that reconcile, a rate-wise GST split in the day-end report, one invoice serial per document the guest actually receives (with a cheap KOT number for kitchen rounds), and IST-correct financial-year and day boundaries. For a cafe that sells both restaurant service at 5% and packaged/bakery goods at 18%, this is the difference between a filable set of books and a silent GST short-payment that only surfaces at return time.

---

<a id="per-item-gst-engine"></a>

## 🔴 `per-item-gst-engine` — Apply per-item GST rates and persist a rate-wise breakdown on the order

### Approach

Verified: gaps 1 and 3 are the same defect reported twice — apps/api/src/orders/build.ts:140-153 builds byId with only {name, price, available, hsn} and :173 derives one gstRateBp from cafe.gstMode. Both auditor pointers are correct; merge into one fix.

New pure module apps/api/src/orders/apportion.ts:
  export function apportion(total: number, weights: number[]): number[]
Largest-remainder in pure integer arithmetic: base_i = Math.floor((total * w_i) / W); rem_i = (total * w_i) % W; leftover R = total - sum(base_i); the R lines with the largest rem_i get +1 paisa each, ties broken by LOWER index (deterministic, stable). Guarantees sum(result) === total for every non-negative input. W === 0 puts the whole total on index 0; empty weights returns []. Magnitude bound: total*w_i <= ~1e14 for realistic bills, inside Number.MAX_SAFE_INTEGER — assert this in a comment.

Rate resolution (new exported helper in build.ts):
  resolveLineRateBp(gstMode, overrideBp) = gstRateBpFor(gstMode) === 0 ? 0 : (overrideBp ?? gstRateBpFor(gstMode))
A composition or exempt cafe MUST NOT collect tax, so a per-item override is ignored there. An override of 0 is meaningful (a genuinely zero-rated item) and must not be confused with null — the web helper percentStrToBp already returns null for empty and 0 for "0", so the wire contract is already correct.

New core in build.ts, replacing the single-rate path:
  export interface TaxLineInput { grossPaise: number; gstRateBp: number }
  export function computeBill(lines: TaxLineInput[], adj: BillAdjustments = {}): ComputedBill
Order of operations, all integer paise:
 1. gross_i = unitPrice*qty; subtotal = sum(gross_i).
 2. Discount D computed exactly as today (percent of subtotal or flat, capped at subtotal) so single-rate bills are unchanged.
 3. discount_i = apportion(D, gross_i). Sum is exactly D.
 4. netFood_i = gross_i - discount_i; netFood = subtotal - D.
 5. Service charge S = round(netFood * serviceChargeBp / 10000) (unchanged). ATTRIBUTION RULE: service charge is consideration for restaurant service, so it goes entirely into the cafe-default-rate bucket — apportion S across only those lines whose resolved rate equals gstRateBpFor(cafe.gstMode), weighted by netFood_i. If no line sits at the default rate (or those lines sum to 0), fall back to apportion(S, netFood_i) across all lines; if netFood is 0 everywhere, fall back to weights gross_i, then to index 0. This is the one judgement call in the theme and must be signed off by a CA (see risks).
 6. packaging_i = apportion(P, netFood_i) — packaging is ancillary to the goods, so pro rata across all lines.
 7. taxableValue_i = netFood_i + service_i + packaging_i. Sum === netFood + S + P (today's taxableBase).
 8. Bucket by resolved rate: bucketTaxable[rate] = sum of taxableValue_i in that rate.
 9. bucketTax[rate] = Math.round(bucketTaxable[rate] * rate / 10000); taxPaise = sum(bucketTax). NOTE: for a mixed bill this can differ by up to (buckets-1) paise from a single round over the whole base — that is correct, not a bug.
10. Per-line tax: within each bucket, tax_i = apportion(bucketTax[rate], taxableValue_i of that bucket's lines). Sum of all tax_i === taxPaise.
11. cgst = Math.floor(bucketTax/2); sgst = bucketTax - cgst. cgst+sgst === bucketTax per bucket.
12. preRound = taxableBase + taxPaise; roundOff as today; total = preRound + roundOff. Round-off is a bill-level line and is NEVER apportioned — it changes no taxable value and no tax.
Buckets are returned sorted by rateBp ascending; zero-tax buckets are dropped from the printed breakdown but rate-0 lines still carry taxableValue.

Keep the exported computeBillAdjustments(subtotalPaise, gstRateBp, adj) signature as a thin wrapper that calls computeBill with one synthetic line, so all 12 existing tests in build.test.ts keep passing unmodified and prove there is no single-rate regression.

buildOrder: byId map gains gstRateBpOverride; each NewOrderItem gains gstRateBp (resolved snapshot), taxableValuePaise, taxPaise; BuiltOrderTotals gains taxBreakdown: TaxBucket[] and taxableValuePaise. orders.gstRateBp is retained but its meaning is documented as "the cafe default rate at order time"; taxBreakdown is authoritative for anything printed or filed.

Deliberately NO backfill of historic rows: taxBreakdown and the three order_items columns stay NULL for pre-migration orders and are read through an explicit legacy path (single bucket synthesised from gstRateBp/taxPaise). Rewriting historical tax figures on an audit-trail product is worse than a documented branch in code.

Menu editor: no functional change needed once this lands (the field finally works), but add an inline note in both GST-override fields when cafe.gstMode is 'composition' or 'exempt' saying overrides are ignored because the cafe may not collect tax.

### Schema

Migration 0013 (additive, no backfill, no NOT NULL):
  ALTER TABLE "orders" ADD COLUMN "tax_breakdown" jsonb;
  ALTER TABLE "order_items" ADD COLUMN "gst_rate_bp" integer;
  ALTER TABLE "order_items" ADD COLUMN "taxable_value_paise" integer;
  ALTER TABLE "order_items" ADD COLUMN "tax_paise" integer;
Drizzle (packages/db/src/schema/orders.ts, casing is snake_case so declare camelCase with no explicit name):
  orders: taxBreakdown: jsonb().$type<{ rateBp: number; taxableValuePaise: number; cgstPaise: number; sgstPaise: number; taxPaise: number }[]>()   // inline type, do not import @sangam/types into packages/db
  orderItems: gstRateBp: integer(), taxableValuePaise: integer(), taxPaise: integer()
No new index: the day-end rate report range-scans via the existing orders_cafe_created_at_idx.
NULL semantics: tax_breakdown IS NULL means "written before 0013 — single rate, read orders.gst_rate_bp".

### API

No new routes. Two existing contracts gain fields (additive, non-breaking):
POST /cafes/:cafeId/orders  201 { order: OrderWithItems } — order gains taxBreakdown: TaxBucket[] | null; each item gains gstRateBp | null, taxableValuePaise | null, taxPaise | null. Request body unchanged. 400 INVALID_ITEM / ITEM_UNAVAILABLE, 404 cafe unchanged.
GET /cafes/:cafeId/orders/:orderId 200 { order: OrderWithItems } — same new fields.
POST /public/cafes/:slug/orders 201 unchanged on the wire (diner payload is a trimmed PublicOrder) but the persisted order now carries per-item rates.
GET /public/cafes/:slug 200 unchanged — it already returns full MenuItem objects carrying gstRateBpOverride, plus cafe.gstRateBp (the default). The client rule is exactly the server rule: cafeRateBp === 0 ? 0 : (override ?? cafeRateBp).

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx — keep the GST override field (it now works); add the composition/exempt hint under both fields (edit form ~:594-609, add form ~:898-909). No other web change in this item; rendering lands in mixed-rate-bill-print.

### Tests

apps/api/src/orders/apportion.test.ts (new): 'splits evenly when the weights are equal'; 'gives the leftover paise to the largest remainders first'; 'breaks a remainder tie by the lower index'; 'always sums to the total across 500 randomised splits'; 'returns all zeros for a zero total'; 'puts the whole total on index 0 when every weight is 0'; 'returns an empty array for no weights'.
apps/api/src/orders/build.test.ts (extend): 'a single-rate bill produces exactly one tax bucket'; 'an item override of 1800bp is taxed at 18% while the other lines stay at the cafe 5%'; 'bucket tax sums exactly to order taxPaise on a mixed bill'; 'an explicit 0bp override is honoured and is not treated as absent'; 'a composition cafe ignores per-item overrides and charges zero tax'; 'an exempt cafe ignores per-item overrides and charges zero tax'; 'buckets come back sorted by rate ascending'; 'a 10% discount is apportioned across rate buckets pro rata to line value'; 'discount apportionment sums exactly to the discount for an odd split (33333 paise over 3 unequal lines)'; 'service charge lands entirely in the cafe default rate bucket on a mixed bill'; 'service charge falls back to pro-rata when no line sits at the cafe default rate'; 'packaging is apportioned pro rata to post-discount line value'; 'per-line taxPaise sums to its bucket taxPaise'; 'per-line taxableValuePaise sums to subtotal - discount + service + packaging'; 'cgst + sgst equals taxPaise for every bucket'; 'round-off is not apportioned and changes no taxable value'; 'a 100% discount leaves zero taxable value and zero tax in every bucket'; 'invariant: subtotal - discount + service + packaging + tax + roundOff === total'; 'computeBillAdjustments returns byte-identical numbers to the pre-change implementation for all 12 legacy cases'; 'order items carry the resolved gstRateBp snapshot, not the override'.
apps/api/src/routes/orders.test.ts (extend, buildTestApp + mocked repos): 'POST /orders persists taxBreakdown and per-item tax for a mixed-rate cart'; 'POST /orders persists a single-element taxBreakdown for a uniform cart'; 'POST /orders on a composition cafe persists taxPaise 0 and an empty breakdown'.
apps/api/src/routes/public.test.ts (extend): 'a public QR order applies the per-item GST override'.

### Files

- `apps/api/src/orders/apportion.ts`
- `apps/api/src/orders/apportion.test.ts`
- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0013_per_item_gst.sql`
- `packages/db/drizzle/migrations/meta/_journal.json`
- `packages/types/src/domain.ts`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`

---

<a id="mixed-rate-bill-print"></a>

## 🔴 `mixed-rate-bill-print` — Rate-wise CGST/SGST block plus a labelled taxable value on the single-order bill and in both cart previews

### Approach

Auditor pointers confirmed: print-views.tsx:209-211 computes one cgst/sgst pair from order.taxPaise and one halfRatePct from order.gstRateBp/200, and :309-314 prints exactly one CGST/SGST pair. Both assume one rate per bill. This item also absorbs the taxable-value half of gap 6 (:296-320) because it rewrites the same block.

New shared web module apps/web/src/lib/bill-totals.ts (web logic tests live only under src/lib, so all derivation must move here):
  export interface TaxBucketView { rateBp: number; taxableValuePaise: number; cgstPaise: number; sgstPaise: number; taxPaise: number; halfRateLabel: string }
  export function billTaxBuckets(o: Pick<Order,'taxBreakdown'|'gstRateBp'|'taxPaise'|'subtotalPaise'|'discountPaise'|'serviceChargePaise'|'packagingChargePaise'>): TaxBucketView[]
  export function taxableValuePaise(o: same): number   // subtotal - discount + service + packaging
billTaxBuckets uses order.taxBreakdown when non-null; when null (pre-0013 order) it synthesises one bucket {rateBp: o.gstRateBp, taxableValuePaise: taxableValuePaise(o), cgst: floor(tax/2), sgst: tax-floor, tax: o.taxPaise} so every historic bill reprints byte-identically to today. Returns [] when taxPaise === 0. halfRateLabel formats rateBp/200 with the existing formatPct rule (integer or 2dp).

Bill component rewrite (print-views.tsx):
- Insert Row label="Taxable value" value=formatRupees(taxableValuePaise(order)) immediately after the Packaging row and before the tax block (Rule 46 wants the taxable value stated, not derived).
- Replace the single CGST/SGST pair with buckets.map(...). For a single bucket, print exactly the two rows it prints today (no visual regression on the 99% case). For two or more buckets, print a per-bucket group: a header line `GST @ {rateBp/100}% on {taxableValue}` followed by its CGST and SGST rows.
- When buckets.length > 1, add a `GST%` column to the item table (BillItemRow) fed by item.gstRateBp, so the guest can see which line was charged what. Column only appears on mixed bills to keep 80mm paper legible.
- Keep the existing Divider/Row/formatRupees helpers; do not restyle.

Cart preview mirrors — both currently compute a single-rate total and will now disagree with the server on a mixed cart:
- apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:128-166 has a hand-copied computeBill. Move it to apps/web/src/lib/bill-preview.ts and port the full apportionment (a straight transcription of apps/api/src/orders/apportion.ts and computeBill, with a header comment naming the server file as the source of truth).
- apps/web/src/app/m/[slug]/diner-order.tsx:156-160 computes taxPaise = round(subtotal * cafe.gstRateBp / 10000). Replace with bill-preview over per-line rates using cafe.gstRateBp as the default and item.gstRateBpOverride per line, applying the same zero-default rule.

### API

none — this item is pure presentation over fields added by per-item-gst-engine.

### Web

apps/web/src/lib/bill-totals.ts (new); apps/web/src/lib/bill-totals.test.ts (new); apps/web/src/lib/bill-preview.ts (new, moved from order-builder); apps/web/src/lib/bill-preview.test.ts (new); apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx (Bill: taxable-value row, rate-wise CGST/SGST groups, conditional GST% item column; BillItemRow gains showRate); apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx (delete the local computeBill, import bill-preview, feed per-line rates from the cart's MenuItem.gstRateBpOverride); apps/web/src/app/m/[slug]/diner-order.tsx (per-line tax preview).

### Tests

apps/web/src/lib/bill-totals.test.ts (new): 'returns a single synthesised bucket for a legacy order with taxBreakdown null'; 'returns the stored buckets, sorted, for a mixed-rate order'; 'cgst + sgst sums back to each bucket tax'; 'labels 500bp as 2.5 per half'; 'labels 1800bp as 9 per half'; 'taxableValuePaise equals subtotal - discount + service + packaging'; 'returns no buckets when taxPaise is 0'; 'sum of bucket taxable values equals taxableValuePaise'.
apps/web/src/lib/bill-preview.test.ts (new): 'preview matches the server total for a single-rate cart' (same fixture numbers as build.test.ts); 'preview matches the server total for a mixed-rate cart with a 10% discount'; 'preview matches the server total for a mixed cart with service charge, packaging and round-off'; 'preview charges 0% on every line for a composition cafe even when items carry overrides'; 'preview line taxes sum to preview taxPaise'.

### Files

- `apps/web/src/lib/bill-totals.ts`
- `apps/web/src/lib/bill-totals.test.ts`
- `apps/web/src/lib/bill-preview.ts`
- `apps/web/src/lib/bill-preview.test.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/m/[slug]/diner-order.tsx`

---

<a id="session-bill-reconciles"></a>

## 🔴 `session-bill-reconciles` — Table-session totals carry discount, charges and round-off so the tab invoice adds up

### Approach

Auditor pointers confirmed exactly: apps/api/src/repositories/table-sessions.ts:96-109 defines totals() which reduces only subtotalPaise/taxPaise/totalPaise; packages/types/src/domain.ts:226-233 TableSessionDetail exposes only those three; the print page at sessions/[sessionId]/print/page.tsx:144-155 prints Subtotal, CGST, SGST, Total — so a 10% discount on one round shows Subtotal 1000, CGST 22.50, SGST 22.50, Total 945 under a TAX INVOICE heading. history() at the same file repeats the same three-field rollup into TableHistorySession.

API side:
- New pure module apps/api/src/orders/tax-buckets.ts:
    export function mergeTaxBuckets(orders: Pick<Order,'taxBreakdown'|'gstRateBp'|'taxPaise'|'subtotalPaise'|'discountPaise'|'serviceChargePaise'|'packagingChargePaise'>[]): TaxBucket[]
  Sums taxableValue/cgst/sgst/tax per rateBp across rounds; an order with taxBreakdown null contributes one synthesised bucket at its gstRateBp (same legacy rule as the web helper); zero-tax orders contribute nothing; output sorted by rateBp asc. Reused by the day-end report.
- totals() becomes a full reduce over subtotalPaise, discountPaise, serviceChargePaise, packagingChargePaise, taxPaise, roundOffPaise, totalPaise, plus taxBreakdown: mergeTaxBuckets(orders) and taxableValuePaise = subtotal - discount + service + packaging. Assert in a test, not at runtime, that subtotal - discount + service + packaging + tax + roundOff === total.
- history(): the per-session accumulator loop gains the same four fields plus taxBreakdown, so the History drill-down shows what was discounted at the table.
- Cancelled-order exclusion is already correct in ordersForSession (ne(status,'cancelled')) — keep it and keep the existing repo test green.

Web side: the three consumers all render the extra rows. The consolidated print page also stops using `session.orders[0].gstRateBp` (line 43, which silently assumes one rate for the whole tab) and renders via billTaxBuckets-equivalent logic; add a sibling helper in apps/web/src/lib/bill-totals.ts:
    export function sessionTaxBuckets(session: Pick<TableSessionDetail,'taxBreakdown'|'orders'|...>): TaxBucketView[]
  which just maps the server-provided taxBreakdown (falling back to per-order synthesis if it is absent, e.g. an older API deploy).

### Schema

none — every field already exists on orders; this is a rollup that was dropping columns.

### API

GET /cafes/:cafeId/table-sessions/:sessionId → 200 { session: TableSessionDetail }; TableSessionDetail gains discountPaise: number, serviceChargePaise: number, packagingChargePaise: number, roundOffPaise: number, taxableValuePaise: number, taxBreakdown: TaxBucket[]. 404 for another owner's cafe or an unknown session (unchanged, resolved via cafesRepo.findByIdAndOwner).
POST /cafes/:cafeId/table-sessions/:sessionId/settle → 200 { session: TableSessionDetail } with the same new fields. Request body { paymentMethod } unchanged. 404 unchanged.
GET /cafes/:cafeId/tables/history → 200 { history: TableHistory }; TableHistorySession gains discountPaise, serviceChargePaise, packagingChargePaise, roundOffPaise, taxableValuePaise, taxBreakdown. Additive only — no status codes change and no request shapes change.

### Web

apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx — replace lines 41-46 and 144-155 with: Subtotal, Discount (when > 0), Service charge (when > 0), Packaging (when > 0), Taxable value, per-bucket CGST/SGST groups, Round off (when != 0), Total; drop the `session.orders[0]?.gstRateBp` assumption.
apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx:211-219 — the combined totals block gains Discount / Service charge / Packaging / Round off rows and labels GST with the rate when the tab is single-rate.
apps/web/src/app/cafes/[id]/tables/history-view.tsx:249-262 — the session <dl> gains the same rows so an owner can see what was discounted at that table.

### Tests

apps/api/src/orders/tax-buckets.test.ts (new): 'merges two rounds at the same rate into one bucket'; 'keeps two rates as two buckets sorted ascending'; 'synthesises one bucket from gstRateBp and taxPaise for a pre-0013 order'; 'ignores orders with zero tax'; 'summed bucket tax equals summed order tax'.
apps/api/src/repositories/table-sessions.repo.test.ts (extend the existing in-memory Drizzle harness): 'getDetail sums discount, service charge, packaging and round-off across rounds'; 'getDetail totals reconcile: subtotal - discount + charges + tax + roundOff equals total'; 'getDetail returns a merged rate-wise breakdown for a mixed-rate tab'; 'getDetail still excludes a cancelled round from every one of the new totals'; 'history sums discount and charges per settled session'.
apps/api/src/routes/table-sessions.test.ts (extend): 'GET session detail exposes discount and charge totals'; 'settle response carries the reconciled totals'.
apps/web/src/lib/bill-totals.test.ts (extend): 'the audit case reconciles: one 1000-rupee round discounted 10% prints taxable 900, tax 45, total 945'.

### Files

- `apps/api/src/orders/tax-buckets.ts`
- `apps/api/src/orders/tax-buckets.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/repositories/table-sessions.repo.test.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `packages/types/src/domain.ts`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`
- `apps/web/src/app/cafes/[id]/tables/history-view.tsx`
- `apps/web/src/lib/bill-totals.ts`

---

<a id="rate-wise-day-report"></a>

## 🟠 `rate-wise-day-report` — Split the day-end report's GST into rate buckets so a mixed-rate cafe can still file

### Approach

Not in the audit list, but a direct consequence of per-item-gst-engine: DayEndReport.taxPaise (apps/api/src/repositories/reports.ts:149, a single sum(orders.tax_paise)) becomes unfilable the moment one cafe bills at two rates, because GSTR-1 wants taxable value and tax per rate. Without this the theme fixes the bill and leaves the owner unable to reconcile it.

reports.ts dayEnd(): add one range-scoped select over non-cancelled orders in the IST day window returning gstRateBp, taxPaise, taxBreakdown, subtotalPaise, discountPaise, serviceChargePaise, packagingChargePaise, and fold it with mergeTaxBuckets from apps/api/src/orders/tax-buckets.ts (same helper as the session rollup — one implementation, one set of legacy rules). Sorted ascending by rate.

Perf: this is an extra range scan already served by orders_cafe_created_at_idx, folded in TS. A single cafe-day is tens to low hundreds of rows and a month is a few thousand — acceptable. Leave a comment that if this helper is ever reused for multi-month exports it must move to SQL (LEFT JOIN LATERAL jsonb_array_elements(tax_breakdown) with a COALESCE fallback for NULL breakdowns) rather than loading rows.

Assert taxByRate totals equal report.taxPaise in a test rather than at runtime.

### API

GET /cafes/:cafeId/reports/day-end?date=YYYY-MM-DD → 200 { report: DayEndReport }. DayEndReport gains taxByRate: TaxBucket[] (rateBp, taxableValuePaise, cgstPaise, sgstPaise, taxPaise), ascending by rateBp, empty when the day had no tax. Additive; 400 for a malformed date and 404 for another owner's cafe are unchanged.

### Web

apps/web/src/app/cafes/[id]/reports/reports-view.tsx — add a compact "GST by rate" table under the existing tax figure: one row per bucket showing Rate, Taxable value, CGST, SGST, Total tax, with a footer row that must equal the headline taxPaise. Render nothing extra when taxByRate has a single bucket beyond the existing line, to avoid noise for the 5%-only cafe.

### Tests

apps/api/src/repositories/reports.repo.test.ts or the existing reports route test (buildTestApp + mocked reports repo): 'day-end splits GST into a 5% and an 18% bucket'; 'day-end rate buckets sum exactly to the reported taxPaise'; 'day-end treats a pre-0013 order as one bucket at its gstRateBp'; 'day-end excludes cancelled orders from the rate buckets'; 'day-end returns an empty taxByRate for a composition cafe'.

### Files

- `apps/api/src/repositories/reports.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/routes/reports.test.ts`
- `packages/types/src/reports.ts`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`

---

<a id="one-serial-per-document"></a>

## 🟠 `one-serial-per-document` — Issue one invoice serial per bill handed over, with a separate KOT number per kitchen round

### Approach

Pointer confirmed: apps/api/src/repositories/orders.ts:110-125 allocates an INV serial from invoice_sequences inside create(), so a 3-round tab burns 3 serials while the consolidated slip (print/page.tsx:88-91) shows only session.orders[0].orderNumber.

Choosing the structural fix over the cosmetic one: separate the kitchen ticket number from the legal invoice serial. Printing all three serials on the slip would keep three GSTR-1 invoices whose individual values the guest never saw; a serial should be consumed when a document is issued, not when a kitchen round is fired.

Also worth flagging while here: today a CANCELLED order still burns a serial, so the issued-invoice series has holes that have to be reported as cancelled invoices. Under the new design a serial is only consumed at issue, so cancelled/abandoned orders consume none.

Design:
- create() stops touching invoice_sequences. orders.order_number becomes a cheap per-cafe, per-IST-day kitchen ticket: `KOT/2026-09-07/0007`, allocated from a new kot_sequences table with the same atomic INSERT ... ON CONFLICT DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq, inside the same create() transaction. The KOT slip prints only the tail (`0007`); screens keep showing the full string.
- New nullable orders.invoice_number / invoice_issued_at, and table_sessions.invoice_number / invoice_issued_at.
- ordersRepo.issueInvoiceNumber(id, cafeId): in a transaction, re-read the order; if invoice_number is already set, return it unchanged (idempotent); else allocate from invoice_sequences using financialYearIst() (see ist-financial-year), write buildBillNumber(fy, seq) plus invoice_issued_at, return it.
- sessionsRepo.issueSessionInvoiceNumber(id, cafeId): same, but allocates ONE serial, writes it to the session AND to every non-cancelled order on the tab, so each round is reportable under the single invoice the guest holds.
- Issue points (all idempotent, so a reprint never consumes a second serial): POST .../orders/:orderId/bill-printed (before markBillPrinted); POST .../orders/:orderId/settle; PATCH .../orders/:orderId/status when the transition is to 'completed'; ordersRepo.markPaid (online payment verified); the table-session settle transaction; and a new explicit endpoint for printing a tab bill before it is settled.
- Audit entries via recordAudit: action 'order.invoice_issued' and 'session.invoice_issued' with the serial in metadata (invoice issuance is exactly the kind of sensitive action the immutable log exists for).
- findByOrderNumber must search invoice_number as well as order_number (the AI console and staff look bills up by the number printed on paper).

Backfill (migration 0014, one UPDATE): UPDATE orders SET invoice_number = order_number, invoice_issued_at = created_at WHERE order_number LIKE 'INV/%'; — historic orders genuinely were issued those serials, so this records the truth rather than rewriting it. Sessions are left NULL and the print page falls back to listing the constituent orders' invoice numbers, which is exactly the status quo for old tabs.

BREAKING: orders.orderNumber changes format for new orders. Every consumer that shows it as "the bill number" must switch to invoiceNumber ?? orderNumber, and anything matching /^INV\// on orderNumber breaks. Sweep: print-views Bill header, order detail page, session print header, kitchen board, offline-queue toast, order lists, public diner confirmation, AI console lookups, any CSV export.

### Schema

New Drizzle file packages/db/src/schema/kot-sequences.ts (and it MUST be added to the explicit schema list in packages/db/drizzle.config.ts and re-exported from packages/db/src/schema/index.ts):
  kotSequences: id uuid pk default gen_random_uuid(), cafeId uuid notNull, istDate text notNull, lastSeq integer notNull default 0; uniqueIndex('kot_sequences_cafe_date_idx').on(cafeId, istDate)
Migration 0014:
  CREATE TABLE "kot_sequences" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "cafe_id" uuid NOT NULL, "ist_date" text NOT NULL, "last_seq" integer DEFAULT 0 NOT NULL);
  CREATE UNIQUE INDEX "kot_sequences_cafe_date_idx" ON "kot_sequences" ("cafe_id","ist_date");
  ALTER TABLE "kot_sequences" ADD CONSTRAINT "kot_sequences_cafe_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE;
  ALTER TABLE "orders" ADD COLUMN "invoice_number" text;
  ALTER TABLE "orders" ADD COLUMN "invoice_issued_at" timestamp with time zone;
  CREATE UNIQUE INDEX "orders_cafe_invoice_number_idx" ON "orders" ("cafe_id","invoice_number") WHERE "invoice_number" IS NOT NULL;
  ALTER TABLE "table_sessions" ADD COLUMN "invoice_number" text;
  ALTER TABLE "table_sessions" ADD COLUMN "invoice_issued_at" timestamp with time zone;
  UPDATE "orders" SET "invoice_number" = "order_number", "invoice_issued_at" = "created_at" WHERE "order_number" LIKE 'INV/%';
The partial unique index is hand-written into the generated migration (drizzle-kit will not emit the WHERE clause).

### API

POST /cafes/:cafeId/orders/:orderId/bill-printed — 200 response becomes { printCount: number, isDuplicate: boolean, invoiceNumber: string }. No request body. 404 for an unknown cafe or order (unchanged).
POST /cafes/:cafeId/table-sessions/:sessionId/invoice (NEW) — body: none (send {}). 200 { invoiceNumber: string, issuedAt: string }; idempotent, a second call returns the same serial. 404 { error: { code: 'NOT_FOUND' } } for another owner's cafe or an unknown session. 409 { error: { code: 'SESSION_EMPTY', message: 'This tab has no billable order yet' } } when every round is cancelled or the tab is empty.
POST /cafes/:cafeId/orders/:orderId/settle — 200 { order } where order now carries invoiceNumber; unchanged request/status codes.
PATCH /cafes/:cafeId/orders/:orderId/status — 200 { order } with invoiceNumber populated on a transition to 'completed'.
POST /cafes/:cafeId/table-sessions/:sessionId/settle — 200 { session: TableSessionDetail } where the session and every round carry the one shared invoiceNumber.
GET /public/cafes/:slug/orders/:orderId — PublicOrder gains invoiceNumber: string | null so a prepaid QR diner sees the real serial after payment.
All Order payloads gain invoiceNumber: string | null and invoiceIssuedAt: string | null; TableSessionDetail/TableSession gain the same two.

### Web

apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx — Bill header prints `Bill: {order.invoiceNumber ?? order.orderNumber}` and a separate `KOT: {kotTail(order.orderNumber)}` line; Kot prints the KOT tail as its big number.
apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:88-91 — header uses session.invoiceNumber; the Rounds row lists each round's KOT tail; when session.invoiceNumber is null (legacy tab) it falls back to listing every constituent invoiceNumber, which is the cosmetic fix retained for history.
apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx, apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx (adds a Print bill action that calls the new invoice endpoint before opening the print tab), apps/web/src/app/cafes/[id]/tables/history-view.tsx, apps/web/src/app/m/[slug]/diner-order.tsx, apps/web/src/lib/api.ts — all switch bill-number display to invoiceNumber ?? orderNumber.
New helper apps/web/src/lib/bill-number.ts: kotTail(orderNumber) and billNumber(order) with the fallback rule, so the choice is tested once.

### Tests

apps/api/src/routes/orders.test.ts (extend): 'creating an order does not consume an invoice serial'; 'bill-printed issues an invoice number on the first print'; 'bill-printed returns the same invoice number on a reprint'; 'settling an order issues an invoice number when none was printed'; 'completing an order issues an invoice number'; 'issuing writes an order.invoice_issued audit entry'.
apps/api/src/routes/table-sessions.test.ts (extend): 'settling a three-round tab issues exactly one invoice serial'; 'every non-cancelled round on a settled tab carries the session invoice number'; 'a cancelled round is not stamped with the session invoice number'; 'POST /table-sessions/:id/invoice is idempotent across two calls'; 'POST /table-sessions/:id/invoice returns 404 for another owner\'s session'; 'POST /table-sessions/:id/invoice returns 409 SESSION_EMPTY for a tab with no billable round'.
apps/api/src/repositories/orders.repo.test.ts (new, modelled on the in-memory harness in table-sessions.repo.test.ts): 'KOT numbers restart at 0001 on a new IST day'; 'KOT numbers increment within the same IST day'; 'issueInvoiceNumber returns the existing serial without consuming a new one'; 'findByOrderNumber matches on the invoice number as well as the KOT number'.
apps/web/src/lib/bill-number.test.ts (new): 'billNumber prefers the invoice number'; 'billNumber falls back to the order number for an unissued bill'; 'kotTail extracts 0007 from KOT/2026-09-07/0007'; 'kotTail returns a legacy INV string unchanged'.

### Files

- `packages/db/src/schema/kot-sequences.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/src/schema/tables.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/drizzle/migrations/0014_invoice_at_bill_time.sql`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.repo.test.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/lib/bill-number.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`

---

<a id="ist-financial-year-and-day"></a>

## 🟡 `ist-financial-year-and-day` — Reckon the invoice financial year and the "today" window in IST, not server-local time

### Approach

Pointers confirmed and one is understated. apps/api/src/repositories/orders.ts:115 calls financialYear(new Date()); apps/api/src/orders/build.ts:195-202 reads getFullYear()/getMonth(), which are server-local. There are THREE server-local day boundaries in the orders repo, not one: todayStats at :396-398, topItemsToday at :463-465 and itemSalesToday at :490-492 all do `new Date(); setHours(0,0,0,0)`. All three are wrong the same way — on a UTC host, "today" starts at 05:30 IST, so the first five and a half hours of trading fall into yesterday's dashboard.

Fix:
- build.ts financialYear(date: Date): switch getFullYear()/getMonth() to getUTCFullYear()/getUTCMonth(). Every existing test in build.test.ts passes Z-suffixed dates whose UTC month is what the assertion expects, so all six stay green — and the function stops depending on the server's TZ at all.
- Add export function financialYearIst(now: Date = new Date()): string = financialYear(new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000)), importing IST_OFFSET_MINUTES from ../reports/date-range.js (line 9, as the auditor points out). Shifting first and reading UTC getters is the only combination that is correct on any host.
- repositories/orders.ts: the invoice-serial FY becomes financialYearIst() (after one-serial-per-document this lives inside issueInvoiceNumber).
- The three today-windows become `const { fromIso, toIso } = istDayRange(todayIstDate());` with `gte(createdAt, fromIso)` AND `lt(createdAt, toIso)` — matching how the reports repo already bounds a business day, so the dashboard and the Z-report finally agree.

No data fix for invoices already filed into the wrong FY: those are historic documents. Note in the PR that a handful of 1-April overnight bills from a prior year may still sit in the previous series and the accountant should be told rather than the rows edited.

### API

none — GET /cafes/:cafeId/orders/stats keeps its shape; only the window it covers changes (it now starts at 00:00 IST). Cached under the same key with the same 15s TTL.

### Tests

apps/api/src/orders/build.test.ts (extend): 'financialYear reads the date in UTC and is unaffected by the process timezone' (run with process.env.TZ pinned to America/Los_Angeles in the test via vi.stubEnv or an explicit UTC assertion pair); 'financialYearIst: 2026-03-31T20:00:00Z is 01:30 IST on 1 April and belongs to FY 2026-27'; 'financialYearIst: 2026-03-31T17:00:00Z is 22:30 IST on 31 March and belongs to FY 2025-26'; 'financialYearIst: 2026-04-01T00:30:00Z is 06:00 IST on 1 April and belongs to FY 2026-27'; 'financialYearIst matches financialYear for a midday IST date'.
apps/api/src/repositories/orders.repo.test.ts (extend the in-memory harness): 'todayStats bounds the day at 00:00 IST, not server midnight'; 'an order placed at 02:00 IST on 1 April counts toward that day, not the previous one'; 'topItemsToday and itemSalesToday use the same IST window as todayStats'.

### Files

- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.repo.test.ts`
- `apps/api/src/reports/date-range.ts`

---

<a id="kot-reprint-stamp"></a>

## 🟡 `kot-reprint-stamp` — Stamp REPRINT on a re-fired kitchen ticket

### Approach

Pointer confirmed: print-views.tsx tracks isDuplicate for the bill only (:56, :62-67) and the KOT at :150-187 renders identically every time, so a waiter reprinting a slip the kitchen already worked can get a dish double-made.

Deliberately NOT server-recorded and NOT audited: the KOT is not a financial document and must not consume a bill print count or an audit row. Track it per device, per order, in localStorage, so a page reload still knows — a plain in-component flag would forget on every navigation, which is the common case (the counter opens the order fresh to reprint).

New apps/web/src/lib/kot-reprint.ts:
  export function kotPrintKey(orderId: string): string   // `sangam:kot-printed:${orderId}`
  export function readKotPrintCount(orderId: string): number      // 0 on any failure
  export function recordKotPrint(orderId: string): number         // returns the new count
Every localStorage access wrapped in try/catch (private mode, blocked storage) returning 0 rather than throwing — the cashier must never be blocked from printing.

print-views.tsx: `const [kotReprint, setKotReprint] = useState(false);` hydrated in an effect from readKotPrintCount(order.id) > 0 (hydrate in an effect, not in the initial state, so SSR and CSR markup match — same pattern already used for the auto-print preference in order-builder.tsx). print('kot') calls recordKotPrint before setMode. Kot gains a `reprint` prop and renders `*** REPRINT ***` in the same bold tracking-widest style as the bill's DUPLICATE stamp, directly under the KOT heading. The ?autoprint=kot path records too.

State the limitation in the code comment: this is per-device, so a reprint fired from a second terminal is not stamped. Making it authoritative would mean a server counter on a non-financial document, which is the wrong trade for a kitchen slip.

### API

none — deliberately no endpoint; the KOT stays out of the audited financial path.

### Web

apps/web/src/lib/kot-reprint.ts (new); apps/web/src/lib/kot-reprint.test.ts (new); apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx (Kot gains a reprint prop and the stamp; print('kot') and the autoprint effect record the print).

### Tests

apps/web/src/lib/kot-reprint.test.ts (new, with a stubbed localStorage): 'the first print of an order reports count 1 and is not a reprint'; 'the second print reports count 2 and is a reprint'; 'counts are kept separately per order id'; 'readKotPrintCount returns 0 and does not throw when localStorage throws'; 'recordKotPrint returns 1 and does not throw when localStorage throws'; 'a corrupt stored value is treated as 0'.

### Files

- `apps/web/src/lib/kot-reprint.ts`
- `apps/web/src/lib/kot-reprint.test.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`

---

## Order of work

1. Step 0 (day 1, only if per-item-gst-engine will not be the first thing merged): disable the GST override input in apps/web/src/app/cafes/[id]/menu/menu-editor.tsx at the edit form (~:594-609) and the add form (~:898-909) and hide the 'GST 18%' badge at :357-366, so the UI stops asserting a behaviour that does not exist. Leave the column, the API validation and the stored data intact — they are correct and the engine work needs them. Skip this step entirely if work item 1 lands first.
2. 1. per-item-gst-engine — apportion.ts and its property tests first (it is the foundation everything else's exactness rests on), then computeBill, then the schema/migration 0013, then the repo and the two route call sites. Nothing downstream can be built until orders carry a taxBreakdown.
3. 2. mixed-rate-bill-print — the printed document is the artefact the customer and the officer read, so it follows the engine immediately. Do bill-totals.ts (server-shaped, tested) before touching print-views.tsx, and port the cart previews last so a preview/server mismatch is caught by the paired named tests rather than at the counter.
4. 3. session-bill-reconciles — depends on tax-buckets.ts, which is easiest to write once the single-order buckets are settled and their shape has stopped moving. Fix the API rollup before any of the three web surfaces so all three read the same server-computed numbers.
5. 4. rate-wise-day-report — reuses tax-buckets.ts unchanged; safe to run in parallel with step 3 once that helper exists.
6. 5. ist-financial-year-and-day — independent of everything above and cheap; land it any time from day 1 onward, but land it BEFORE one-serial-per-document so the new issuance path picks up financialYearIst rather than needing a second edit.
7. 6. kot-reprint-stamp — fully independent; slot it into any gap, ideally alongside step 2 since it edits the same file (print-views.tsx) and avoids a second pass over that component.
8. 7. one-serial-per-document — last, and on its own branch. It is the largest item, it is the only breaking change, and it rewrites the bill/KOT headers that steps 2 and 3 have already stabilised — doing it last means those print surfaces are touched once more, not twice mid-flight.
9. 8. Before release: run one manual pass on real thermal hardware (80mm) with (a) a single-rate bill, (b) a mixed 5%/18% bill with a discount and packaging, (c) a three-round tab with a discount on round two, (d) a reprint of each. Check the paper reconciles line by line and that the rate-wise block does not overflow 80mm.

## Risks

- The service-charge attribution rule (100% into the cafe-default-rate bucket, pro-rata fallback when no line sits at that rate) is a genuine tax judgement, not a mechanical fact. A cafe's CA may want it apportioned pro rata like packaging, or forced to 5% always. Get it signed off before release and keep it isolated in one function in build.ts so switching it is a one-line change plus test updates — do NOT scatter the assumption across the engine.
- Same for the bill-level discount: apportioning it pro rata across rate buckets is standard trade practice, but a cafe running an offer on packaged goods only will want it forced onto that bucket. There is no UI for per-line discounts and this plan does not add one; expect it back as a feature request within a quarter.
- The web cart previews (order-builder.tsx, diner-order.tsx) will hold a hand-ported copy of the server's apportionment maths. Drift here means the cashier sees one total and the customer is charged another. Mitigation: bill-preview.test.ts asserts against the exact fixtures used in build.test.ts, and both files carry a cross-reference comment. A shared package would be better and is out of scope here — flag it as follow-up.
- orders.gstRateBp changes meaning from "the bill's rate" to "the cafe default rate at order time". Anything still reading it as the bill's rate silently prints the wrong percentage on a mixed bill. Sweep for it before merge: sessions/[sessionId]/print/page.tsx:43 and print-views.tsx:211 are the two known sites, and the AI console tools should be checked too.
- No backfill of taxBreakdown or the per-item tax columns is deliberate — historic tax rows must not be rewritten on an audit-trail product — but it means every consumer needs a legacy branch, and a missed branch shows up as a blank tax block on an old bill rather than an error. The legacy path is centralised in exactly two helpers (apps/api/src/orders/tax-buckets.ts and apps/web/src/lib/bill-totals.ts); nothing else may synthesise a bucket.
- one-serial-per-document is a breaking display change: new orders get KOT/YYYY-MM-DD/NNNN where INV/FY/NNNNNN used to be. Any operator muscle memory, saved search, exported CSV, or AI-console prompt keyed on the INV prefix breaks on the day it ships. Ship it with a note to the cafes and keep findByOrderNumber matching both columns.
- Migration 0014's UPDATE over the whole orders table takes a row lock proportional to table size. Small today; run it in a low-traffic window and check the plan on the largest tenant first.
- Cancelled orders no longer consume an invoice serial after work item 5. This is an improvement, but a cafe's accountant who has been reconciling against the old behaviour (every order = one serial, cancellations reported as cancelled invoices) will see the pattern change mid-year. Tell them explicitly; the series itself stays consecutive and gapless.
- Per-bucket rounding means a mixed-rate bill's tax can differ by a paisa or two from a naive single round over the whole taxable base. That is correct GST behaviour, but it will be reported as a bug by whoever spot-checks with a calculator. Document it in the code and in the release note.
- The day-end rate-wise fold happens in TypeScript over the day's orders. Fine for a day or a month for one cafe; if this helper is ever reused for a multi-month or multi-cafe export it will pull too many rows into memory and must move to SQL aggregation first.
