# Payment reliability & per-cafe settlement

**Estimated effort: 18 engineer-days · 6 work items**

Today a cafe cannot actually be paid for QR orders (one server-wide Razorpay key pair sends every rupee to the platform account), a captured payment is lost whenever the diner's browser doesn't return (no webhook), the kitchen cooks unpaid "prepaid-required" orders, refunds never reach Razorpay and can be issued repeatedly beyond the bill total, and the Z-report counts in-flight orders as revenue while ignoring refunds. This plan makes online money real and traceable: per-cafe (BYO-account) Razorpay credentials encrypted at rest, an idempotent webhook that settles orders the browser never confirmed, a kitchen hold that genuinely enforces prepayment, provider-backed refunds with a transactional cumulative cap, a resumable diner payment, and a Z-report that ties to the drawer. Every payment and refund lands in the order_payments tender ledger, so the per-order audit artefact the product is positioned on is finally complete. Nine of the ten fixes are on the money path — none of this can ship without a Razorpay test-mode pass.

---

<a id="per-cafe-payment-credentials"></a>

## 🔴 `per-cafe-payment-credentials` — Per-cafe Razorpay credentials, encrypted at rest, resolved per request

### Approach

Verified: RAZORPAY_KEY_ID/SECRET are read once at plugin-register time (apps/api/src/routes/payments.ts:53-57) and baked into a single module-level provider, so every cafe's diner money settles into whichever account runs the server. Auditor's pointers all check out.

Decision — BYO account, not Razorpay Route. Route requires marketplace onboarding + KYC of the platform and makes Sangam a funds-holder (RBI Payment Aggregator exposure). BYO keys (the cafe signs up with Razorpay itself and pastes its keys into Sangam) ships in days, puts money directly in the cafe's account, and carries zero PA exposure. Schema keeps razorpay_account_id reserved so Route can be layered on later without another migration.

1. New apps/api/src/lib/crypto.ts: AES-256-GCM. encryptSecret(plain, key) -> 'v1:<ivB64>:<tagB64>:<ctB64>'; decryptSecret(blob, key). Key from new env PAYMENT_CREDENTIALS_KEY (base64; zod .refine(v => Buffer.from(v,'base64').length === 32)). The 'v1:' prefix is the hook for future key rotation.
2. CRITICAL and easy to get wrong: CafesRepository.findByIdAndOwner / findBySlug / listByOwner all do bare select() (repositories/cafes.ts:57-80), so adding secret columns would ship ciphertext straight to the browser via GET /cafes/:id. Convert all three to explicit column projections that omit razorpayKeySecretEnc / razorpayWebhookSecretEnc, and add one new method findProviderConfig(cafeId): Promise<{cafeId, provider, keyId, keySecret, webhookSecret, accountId} | null> that decrypts — called only from payments.ts and webhooks.ts.
3. payments.ts: replace the module-level `provider` with resolveProvider(cafe) memoised in a Map<cafeId, {provider, keyId, credsUpdatedAt}>, invalidated when cafes.paymentCredentialsUpdatedAt changes. Fall back to app.config.RAZORPAY_* only when a new env PAYMENT_ALLOW_PLATFORM_FALLBACK is true (default true in dev/test, false in production) so production can never silently route a cafe's money to the platform.
4. Latent bug the per-cafe change exposes: CreatePaymentResponse.keyId is hardcoded to the server key at payments.ts:92 and :112. Both must emit the resolved cafe's key id, or Checkout opens against the wrong account.
5. public.ts:84-86 computes onlinePaymentEnabled from server env; change to cafe.onlinePaymentEnabled && cafe has a usable key id + secret.
6. razorpay.ts createOrder gains an optional transfers param, emitted as { transfers: [{ account, amount, currency }] } only when accountId is set. Not surfaced in the UI this pass — the Route path, documented and untested, deliberately dormant.
7. PATCH /cafes/:id accepts write-only credential fields and writes a cafe.payment_credentials_updated audit entry whose metadata carries only keyIdLast4, never a secret.

### Schema

packages/db/src/schema/cafes.ts + new migration 0013:
ALTER TABLE cafes
  ADD COLUMN payment_provider text NOT NULL DEFAULT 'razorpay',
  ADD COLUMN razorpay_key_id text,
  ADD COLUMN razorpay_key_secret_enc text,
  ADD COLUMN razorpay_webhook_secret_enc text,
  ADD COLUMN razorpay_account_id text,
  ADD COLUMN payment_credentials_updated_at timestamptz;
Drizzle: paymentProvider: text({ enum: ['razorpay'] }).notNull().default('razorpay'), razorpayKeyId: text(), razorpayKeySecretEnc: text(), razorpayWebhookSecretEnc: text(), razorpayAccountId: text(), paymentCredentialsUpdatedAt: timestamp({ withTimezone: true, mode: 'string' }).
No new index — cafes are always reached by id or slug, both already indexed (cafes_slug_idx, cafes_owner_id_idx). Additive, all-nullable, no backfill.

### API

PATCH /cafes/:id — body gains razorpayKeyId?: string|null (regex /^rzp_(test|live)_[A-Za-z0-9]{8,}$/), razorpayKeySecret?: string|null (10-200 chars), razorpayWebhookSecret?: string|null (10-200 chars). Empty string clears the stored credential. 200 { cafe } where Cafe NEVER contains the *Enc columns and instead carries razorpayKeyId: string|null, hasRazorpayKeySecret: boolean, hasRazorpayWebhookSecret: boolean. 400 VALIDATION_ERROR; 404 NOT_FOUND (other owner).

POST /cafes/:cafeId/payments/test — body {} -> 200 { ok: true, keyIdLast4: string, mode: 'test'|'live' } (calls Razorpay GET /v1/payments?count=1 with the stored creds). 400 { error: { code: 'PAYMENT_CREDENTIALS_INVALID', message } }; 409 { error: { code: 'PAYMENT_UNCONFIGURED' } } when nothing is stored; 404 NOT_FOUND.

GET /public/cafes/:slug — response unchanged in shape; cafe.onlinePaymentEnabled now derives from the cafe's own credentials rather than server env.

### Web

apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx — replace the Payments block (lines 411-468, today just two checkboxes) with: Key ID text input; Key Secret password input showing the placeholder '•••• saved' when hasRazorpayKeySecret; Webhook Secret password input; a read-only copy-to-clipboard Webhook URL field rendering ${NEXT_PUBLIC_API_URL}/webhooks/razorpay/${cafe.id} with a one-line 'paste this into Razorpay Dashboard > Webhooks' hint; a 'Test connection' button calling POST /cafes/:id/payments/test with inline success/failure state. The 'Require prepayment' checkbox stays disabled until onlinePaymentEnabled AND hasRazorpayKeySecret — the settings screen must not promise prepayment it cannot enforce.

### Tests

apps/api/src/lib/crypto.test.ts: 'encrypt then decrypt round-trips a secret'; 'the same plaintext encrypts to different ciphertext (random IV)'; 'decrypt throws when the auth tag is tampered with'; 'decrypt throws under a different key'; 'rejects a key that is not 32 bytes'.
apps/api/src/routes/cafes.test.ts: 'PATCH stores razorpayKeySecret encrypted and never returns it'; 'GET /cafes/:id omits razorpay_key_secret_enc and razorpay_webhook_secret_enc'; 'GET /cafes/:id reports hasRazorpayKeySecret true without exposing the value'; 'PATCH with an empty-string razorpayKeySecret clears the credential'; 'PATCH rejects a malformed razorpayKeyId with 400'; 'PATCH writes a cafe.payment_credentials_updated audit entry containing no secret'; 'PATCH credentials on another owner cafe returns 404'.
apps/api/src/routes/payments.test.ts: 'create payment opens Checkout with the cafe own key id, not the server env key'; 'create payment returns 503 PAYMENT_UNCONFIGURED for a cafe with no credentials when platform fallback is off'; 'create payment uses the platform key when PAYMENT_ALLOW_PLATFORM_FALLBACK is true'; 'two cafes with different credentials resolve to different providers'; 'the provider cache is invalidated when paymentCredentialsUpdatedAt changes'.
apps/api/src/routes/public.test.ts: 'onlinePaymentEnabled is false when the cafe has no Razorpay credentials'.

### Files

- `apps/api/src/lib/crypto.ts`
- `apps/api/src/lib/crypto.test.ts`
- `apps/api/src/config/env.ts`
- `packages/db/src/schema/cafes.ts`
- `packages/db/drizzle/migrations/0013_per_cafe_payment_credentials.sql`
- `apps/api/src/repositories/cafes.ts`
- `apps/api/src/routes/cafes.ts`
- `apps/api/src/routes/cafes.test.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/routes/payments.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/payments/razorpay.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx`

---

<a id="razorpay-webhook-idempotent-settlement"></a>

## 🔴 `razorpay-webhook-idempotent-settlement` — Razorpay webhook + idempotent markPaid that writes the tender-ledger row

### Approach

Verified: there is no webhook route anywhere; the only settle path is the diner's browser POSTing /payment/verify (payments.ts:121-169). Verified: markPaid (repositories/orders.ts:303-315) is a bare UPDATE that writes no order_payments row, so the Tender panel is empty for every QR payment. Both auditor pointers correct.

Correction to the auditor's pointer: the webhook cannot be a single POST /webhooks/razorpay once credentials are per-cafe (WI-1) — the secret needed to verify the signature is the cafe's, and you cannot know the cafe before verifying a body you have not yet trusted. The route must carry the cafe in the path: POST /webhooks/razorpay/:cafeId. Each cafe pastes its own URL into its own Razorpay dashboard.

1. New apps/api/src/routes/webhooks.ts, registered as a PLAIN async plugin (NOT wrapped in fastify-plugin) so its content-type parser stays encapsulated:
   app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => { req.rawBody = body; try { done(null, JSON.parse(body.toString('utf8'))) } catch { done(null, {}) } });
   Signature must be verified over the RAW bytes, never over a re-serialised object. Wrapping this in fastify-plugin would replace the JSON parser app-wide — a test pins that.
2. New PaymentProvider.verifyWebhookSignature({ rawBody: Buffer, signature: string, secret: string }): boolean — HMAC-SHA256 hex, timing-safe, same length-guard pattern as razorpay.ts:61-74.
3. Order resolution: payload.payment.entity.notes.sangamOrderId (already sent at payments.ts:106) -> ordersRepo.findByIdAndCafe. Fallback: payload.payment.entity.order_id -> new ordersRepo.findByProviderOrderId(providerOrderId, cafeId).
4. Amount guard: if payload.payment.entity.amount !== order.totalPaise, do NOT settle. Record the event with status 'mismatch' and audit it. A short capture must never close a bill.
5. Events: payment.captured / order.paid -> markPaid; payment.failed -> markPaymentFailed only when not already paid; refund.processed -> stamp provider_refund_id on the matching ledger row; anything else -> 200 { status: 'ignored' } so Razorpay stops retrying.
6. Rewrite markPaid as a transaction, which also closes the empty-Tender-panel gap:
   BEGIN; SELECT * FROM orders WHERE id=$1 AND cafe_id=$2 FOR UPDATE;
   INSERT INTO order_payments (cafe_id, order_id, kind='payment', method='online', amount_paise=order.total_paise, provider_payment_id=$pid) ON CONFLICT (provider_payment_id) DO NOTHING;
   IF order.payment_status <> 'paid' THEN UPDATE orders SET payment_status='paid', payment_method='online', provider_payment_id=$pid, paid_at=now(), kitchen_hold=false; END IF;
   COMMIT;
   Idempotent by construction: the partial unique index on provider_payment_id means a browser verify and a webhook for the same Razorpay payment produce exactly one ledger row and one state flip, whichever arrives first. amount_paise is copied from the order's own integer total — no arithmetic, no rounding.
7. payment_webhook_events, unique on (provider, provider_event_id) from the x-razorpay-event-id header, gives replay/debug history and short-circuits redeliveries at 200 { status: 'duplicate' }.
8. Audit row payment.webhook_settled, actorType 'system'.
9. Rate limiter: raise max for this route (Razorpay retries in bursts) via a route-level config in app.ts's rateLimit registration.

### Schema

Migration 0014:
ALTER TABLE order_payments ADD COLUMN provider_payment_id text;
ALTER TABLE order_payments ADD COLUMN provider_refund_id text;
CREATE UNIQUE INDEX order_payments_provider_payment_id_idx ON order_payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_event_id text NOT NULL,
  event text NOT NULL,
  order_id uuid,
  provider_payment_id text,
  amount_paise integer,
  status text NOT NULL DEFAULT 'processed',  -- processed | ignored | duplicate | mismatch | unresolved
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_webhook_events_provider_event_idx ON payment_webhook_events (provider, provider_event_id);
CREATE INDEX payment_webhook_events_cafe_created_at_idx ON payment_webhook_events (cafe_id, created_at);

BACKFILL (required — historical online payments have no ledger row; run AFTER the unique index so a genuine duplicate fails the migration loudly rather than silently):
INSERT INTO order_payments (cafe_id, order_id, kind, method, amount_paise, provider_payment_id)
SELECT o.cafe_id, o.id, 'payment', 'online', o.total_paise, o.provider_payment_id
FROM orders o
WHERE o.payment_method = 'online' AND o.payment_status IN ('paid','refunded')
  AND o.provider_payment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id AND p.kind = 'payment');
Post-migration assertion (must return 0): SELECT count(*) FROM orders o WHERE o.payment_method='online' AND o.payment_status IN ('paid','refunded') AND o.provider_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id=o.id AND p.kind='payment');
Also add packages/db/src/schema/payment-webhook-events.ts to drizzle.config.ts's explicit schema list and to schema/index.ts.

### API

POST /webhooks/razorpay/:cafeId — unauthenticated. Headers: x-razorpay-signature (required), x-razorpay-event-id (required). Body: the raw Razorpay event JSON, e.g. { entity: 'event', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', amount: 31500, status: 'captured', notes: { sangamOrderId: '<uuid>' } } } } }.
Responses: 200 { status: 'processed' | 'ignored' | 'duplicate' | 'mismatch' }; 400 { error: { code: 'WEBHOOK_SIGNATURE_INVALID', message } }; 400 { error: { code: 'WEBHOOK_MALFORMED', message } }; 404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }; 503 { error: { code: 'WEBHOOK_UNCONFIGURED', message } } when the cafe has no webhook secret.
Registered in apps/api/src/routes/index.ts inside the existing `if (hasDb)` block (lines 59-63), alongside publicRoutes and paymentsRoutes — it needs the DB but no auth.
No change to POST /public/cafes/:slug/orders/:orderId/payment/verify's contract; it just now goes through the transactional markPaid.

### Tests

apps/api/src/routes/webhooks.test.ts (new): 'rejects a request with no x-razorpay-signature (400 WEBHOOK_SIGNATURE_INVALID)'; 'rejects a payload whose signature was computed over different bytes'; 'verifies against the raw body, not the re-serialised JSON' (send unusual key order and trailing whitespace, assert it still verifies); 'a signature made with another cafe secret is rejected'; 'marks the order paid on payment.captured and writes exactly one order_payments row'; 'a redelivered event with the same x-razorpay-event-id returns 200 duplicate and writes no second ledger row'; 'a webhook arriving after a successful /payment/verify writes no second ledger row and does not move paidAt'; 'does not settle when the captured amount differs from the order total and records status mismatch'; 'resolves the order via notes.sangamOrderId'; 'falls back to provider_order_id when notes are absent'; 'returns 200 ignored for an unhandled event type'; 'returns 404 for an unknown cafeId'; 'returns 503 when the cafe has no webhook secret'; 'payment.failed on an already-paid order leaves it paid'; 'writes a payment.webhook_settled audit entry with actorType system'; 'the JSON content-type parser override does not leak to other routes' (POST an ordinary route in the same app instance and assert normal parsing).
apps/api/src/routes/payments.test.ts: 'verify writes an order_payments row with kind payment, method online and the provider payment id'; 'a repeated verify of the same payment id does not double the ledger'.
apps/api/src/payments/razorpay.test.ts: 'verifyWebhookSignature accepts a correct HMAC over the raw buffer'; 'verifyWebhookSignature rejects a wrong-length signature without throwing'.

### Files

- `apps/api/src/routes/webhooks.ts`
- `apps/api/src/routes/webhooks.test.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/payments/razorpay.ts`
- `apps/api/src/payments/razorpay.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/payment-webhook-events.ts`
- `apps/api/src/routes/payments.test.ts`
- `apps/api/src/app.ts`
- `packages/db/src/schema/order-payments.ts`
- `packages/db/src/schema/payment-webhook-events.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/drizzle/migrations/0014_webhook_and_tender_ledger.sql`
- `packages/types/src/domain.ts`

---

<a id="prepaid-kitchen-hold"></a>

## 🔴 `prepaid-kitchen-hold` — Prepaid orders actually held from the kitchen, payment state on the ticket, stale holds expired

### Approach

Verified: public.ts:148 inserts the QR order with the schema default status 'pending' regardless of cafe.qrPrepaidRequired, and listKitchenTickets (repositories/orders.ts:210-222) filters only on status, so an abandoned checkout is in the New column instantly. Verified: TicketCard (kitchen-board.tsx:252-279) renders order number, table, source, customer and age but no payment state, though KitchenTicketsResponse already carries the whole OrderWithItems.

Correction to the auditor's suggestion of a bare paymentStatus filter on the kitchen query: that is wrong in two directions. A pay-later QR tab order is legitimately unpaid and MUST reach the kitchen; and a held prepaid order later settled in cash at the counter should be released even though it was never 'paid' online. The release signal is not paymentStatus, it is 'was this order placed under a prepayment rule, and has that rule been discharged'. Model it on the row.

1. orders.kitchen_hold boolean not null default false. public.ts sets kitchenHold: cafe.onlinePaymentEnabled && cafe.qrPrepaidRequired at creation (threaded through NewOrder in repositories/orders.ts:24-43 and the insert at :127-149). Deciding at creation time means a later settings toggle does not retroactively free or trap already-placed orders — the order keeps the rule it was placed under, which is the defensible semantics.
2. listKitchenTickets adds eq(schema.orders.kitchenHold, false). Single indexed predicate, no cafe join on the 10s-poll hot path.
3. markPaid clears kitchen_hold in the same transaction as WI-2 — payment is the release event.
4. Counter override: POST /cafes/:cafeId/orders/:orderId/release-to-kitchen for the diner who walks up and pays cash. Audited (order.kitchen_released, actorType owner).
5. Ticket payment badge: move apps/web/src/app/cafes/[id]/orders/_components/payment-badge.tsx to apps/web/src/components/ui/payment-badge.tsx (re-export from the old path so the orders list and order detail keep compiling) and render it in the TicketCard header next to the age chip.
6. Stale-hold expiry, no scheduler exists in this codebase (grep for cron/setInterval in apps/api/src: nothing). Use a lazy per-cafe sweep rather than inventing infrastructure: ordersRepo.expireStaleHolds(cafeId, olderThanIso) issuing UPDATE orders SET status='cancelled' WHERE cafe_id=$1 AND kitchen_hold AND status='pending' AND payment_status IN ('unpaid','pending','failed') AND created_at < $2 RETURNING id, order_number. Called from the GET kitchen/tickets handler behind an in-process Map<cafeId, lastRunMs> throttle of 60s so the 10s board poll does not hammer it. Window from new env PREPAID_HOLD_EXPIRY_MINUTES (default 20). One audit row per expired order: order.prepaid_expired, actorType 'system'.
7. Reconciliation surface for orphans: GET /cafes/:cafeId/orders gains paymentStatus and source query filters, and the orders list gets a payment filter chip row.

### Schema

Migration 0015:
ALTER TABLE orders ADD COLUMN kitchen_hold boolean NOT NULL DEFAULT false;
CREATE INDEX orders_cafe_kitchen_hold_idx ON orders (cafe_id, created_at) WHERE kitchen_hold;
Drizzle (packages/db/src/schema/orders.ts): kitchenHold: boolean().notNull().default(false), plus the partial index in the table's index array.
Backfill: none. DEFAULT false means every pre-existing order remains visible to the kitchen — fully backward compatible.

### API

POST /cafes/:cafeId/orders/:orderId/release-to-kitchen — auth required, body {} -> 200 { order: OrderWithItems }; 409 { error: { code: 'NOT_HELD', message: 'This order is not held' } } when kitchen_hold is already false; 404 NOT_FOUND for a missing order or another owner's cafe.
GET /cafes/:cafeId/orders — gains optional query paymentStatus ('unpaid'|'pending'|'paid'|'failed'|'refunded') and source ('counter'|'qr'|'phone'). Response shape unchanged: { orders: Order[] }.
GET /cafes/:cafeId/kitchen/tickets — request and response shapes unchanged; held tickets are simply absent, and the handler now runs the throttled stale-hold sweep as a side effect.
POST /public/cafes/:slug/orders — request and response unchanged; the created row now carries kitchenHold internally (not exposed in PublicOrder).
Order type gains kitchenHold: boolean.

### Web

apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx — TicketCard header (252-279): render <PaymentBadge status={ticket.paymentStatus} method={ticket.paymentMethod} /> beside the age chip, so a pay-later tab is visibly distinguishable from a settled ticket.
apps/web/src/components/ui/payment-badge.tsx — moved from app/cafes/[id]/orders/_components/payment-badge.tsx (thin re-export left behind).
apps/web/src/app/cafes/[id]/orders/page.tsx — a Payment filter chip row (All / Unpaid / Payment pending / Paid / Refunded) driving the new query params; this is the orphan-hunting screen gap #4 asks for.
apps/web/src/lib/kitchen-ticket.ts (new pure helper ticketPaymentTone) — the unit-testable slice of the badge decision.

### Tests

apps/api/src/routes/public.test.ts: 'a QR order at a prepaid-required cafe is created with kitchenHold true'; 'a QR order at a pay-later cafe is created with kitchenHold false'; 'kitchenHold is false when prepayment is required but online payment is disabled'.
apps/api/src/repositories/orders.repo.test.ts (new, same fake-Drizzle predicate-evaluator style as apps/api/src/repositories/table-sessions.repo.test.ts): 'listKitchenTickets excludes rows with kitchen_hold true'; 'listKitchenTickets still returns an unpaid pay-later QR order'; 'listKitchenTickets still returns a held-then-released order'.
apps/api/src/routes/orders.test.ts: 'POST release-to-kitchen clears the hold and writes an order.kitchen_released audit entry'; 'POST release-to-kitchen on an unheld order returns 409 NOT_HELD'; 'POST release-to-kitchen on another owner cafe returns 404'; 'GET /orders?paymentStatus=pending forwards the filter to the repository'; 'GET kitchen/tickets runs the stale-hold sweep once and not again inside the throttle window'; 'the stale-hold sweep writes one order.prepaid_expired audit entry per expired order'.
apps/api/src/routes/webhooks.test.ts: 'settling a held order via webhook releases it to the kitchen'.
apps/api/src/routes/payments.test.ts: 'settling a held order via verify releases it to the kitchen'.
apps/web/src/lib/kitchen-ticket.test.ts (new): 'an unpaid ticket reads Unpaid'; 'a paid ticket reads Paid'; 'a pending ticket reads Payment pending'.

### Files

- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0015_prepaid_kitchen_hold.sql`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/orders.repo.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/config/env.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx`
- `apps/web/src/components/ui/payment-badge.tsx`
- `apps/web/src/app/cafes/[id]/orders/_components/payment-badge.tsx`
- `apps/web/src/app/cafes/[id]/orders/page.tsx`
- `apps/web/src/lib/kitchen-ticket.ts`
- `apps/web/src/lib/kitchen-ticket.test.ts`

---

<a id="refunds-that-actually-move-money"></a>

## 🔴 `refunds-that-actually-move-money` — Refund a cancelled paid order, call the provider, and cap cumulative refunds transactionally

### Approach

Three gaps share one root cause — refunds are a bookkeeping entry with no money behind them and no arithmetic guard. Verified: order-actions.tsx:219 reads `status === 'completed' && (payStatus === 'paid' || payStatus === 'refunded')`, while the API at routes/orders.ts:407-411 already gates on paymentStatus alone. Verified: repositories/orders.ts:360-385 refund() inserts an order_payments row and flips paymentStatus to 'refunded' — no provider call anywhere in the codebase (PaymentProvider at payments/razorpay.ts:15-23 has only createOrder and verifySignature).

BUG NOT IN THE AUDIT, found while reading: the amount check at routes/orders.ts:412-416 compares a SINGLE refund against totalPaise. Nothing tracks cumulative refunds, and paymentStatus 'refunded' is explicitly still accepted at :407. So a 300-rupee order can be refunded 300 rupees five times, five ledger rows, five audit entries, and once WI-4 wires the provider, five real refunds out of the cafe's account. This must be fixed in the same change.

1. UI gate: order-actions.tsx:219 becomes `const refundable = payStatus === 'paid' || payStatus === 'refunded';`. The terminal branch at :218 already covers both 'completed' and 'cancelled', so a cancelled-but-paid order gets the Refund panel with no structural change.
2. Cancelling a paid order must announce the exposure: PATCH .../status returns refundDue: true when the transition is to 'cancelled' and paymentStatus is 'paid' with refundedPaise < totalPaise. The web side raises a persistent callout ('Cancelled - the guest has paid 315 rupees, issue a refund'), never an automatic refund (staff may hand back cash).
3. Cumulative cap moves INTO the transaction in repositories/orders.ts refund():
   BEGIN; SELECT * FROM orders WHERE id=$1 AND cafe_id=$2 FOR UPDATE;
   alreadyRefunded := SELECT coalesce(sum(amount_paise),0) FROM order_payments WHERE order_id=$1 AND kind='refund';
   IF alreadyRefunded + amount > total_paise THEN return { error: 'REFUND_EXCEEDS_TOTAL', alreadyRefundedPaise: alreadyRefunded }; END IF;
   INSERT INTO order_payments (..., kind='refund', method, amount_paise, reason, provider_refund_id);
   UPDATE orders SET refunded_paise = alreadyRefunded + amount, payment_status = CASE WHEN alreadyRefunded + amount >= total_paise THEN 'refunded' ELSE payment_status END;
   COMMIT;
   FOR UPDATE means two cashiers on two terminals cannot both pass the cap. A partial refund now correctly leaves paymentStatus 'paid' with refundedPaise set, instead of mislabelling the whole bill refunded. All quantities are integer paise sums of existing integer columns — nothing is apportioned across lines, so no remainder rule is needed; the invariant is simply sum(refund rows) <= total_paise, enforced under a row lock.
4. PaymentProvider gains refund(input: { paymentId: string; amountPaise: number; notes?: Record<string,string>; idempotencyKey: string }): Promise<{ id: string; amountPaise: number; status: 'processed'|'pending'|'failed' }>. Razorpay impl: POST https://api.razorpay.com/v1/payments/{paymentId}/refund, body { amount, speed: 'normal', notes }, header X-Payment-Idempotency-Key. Idempotency key = `${orderId}:${alreadyRefundedPaise}:${amountPaise}` — a double-tap or a retry after a network timeout hits the same key and Razorpay returns the same refund object rather than refunding twice.
5. ORDERING IS THE WHOLE POINT: call the provider FIRST, write the ledger only on success. A provider failure returns 502 PAYMENT_REFUND_FAILED and writes nothing, so Sangam never says 'refunded' when the guest's money has not moved. The reverse failure (provider succeeded, DB write failed) is reconciled by the refund.processed webhook from WI-2 — the only reason a partial-failure window is acceptable.
6. For an online payment the method is forced to 'online' and the picker is replaced by 'Refunded to the original payment method'. An explicit 'Refund in cash instead' toggle (forceMethod) is kept because cafes really do this — it skips the provider, writes a cash ledger row, and records the override in the audit metadata.

### Schema

Migration 0016:
ALTER TABLE orders ADD COLUMN refunded_paise integer NOT NULL DEFAULT 0;
(order_payments.provider_refund_id already added in WI-2's migration 0014.)
Drizzle: refundedPaise: integer().notNull().default(0) in packages/db/src/schema/orders.ts.
BACKFILL (required — refunds already exist in production):
UPDATE orders o SET refunded_paise = COALESCE((SELECT SUM(p.amount_paise) FROM order_payments p WHERE p.order_id = o.id AND p.kind = 'refund'), 0)
WHERE EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id AND p.kind = 'refund');
Post-migration assertion (must return 0): SELECT count(*) FROM orders o WHERE o.refunded_paise <> COALESCE((SELECT SUM(p.amount_paise) FROM order_payments p WHERE p.order_id=o.id AND p.kind='refund'), 0);

### API

POST /cafes/:cafeId/orders/:orderId/refund — body { method: 'cash'|'upi'|'card'|'online', amountPaise: integer >= 1, reason?: string (max 200), forceMethod?: boolean (default false) }.
200 { order: OrderWithItems, refund: { id: string, amountPaise: number, method: PaymentMethod, providerRefundId: string | null } }
400 { error: { code: 'NOT_REFUNDABLE', message: 'Only a paid order can be refunded' } }
400 { error: { code: 'REFUND_EXCEEDS_TOTAL', message: 'Already refunded 200 rupees of 300 rupees; this refund would exceed the bill' } }
502 { error: { code: 'PAYMENT_REFUND_FAILED', message } } — provider rejected; nothing written
503 { error: { code: 'PAYMENT_UNCONFIGURED', message } } — online refund required but the cafe has no credentials
404 { error: { code: 'NOT_FOUND' } } — missing order or another owner's cafe
PATCH /cafes/:cafeId/orders/:orderId/status — response gains refundDue: boolean alongside { order }.
Order type gains refundedPaise: number.

### Web

apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx — line 219 gate change; a 'Refund due' callout inside the cancelled terminal branch when payStatus is 'paid'; MethodPicker replaced by a fixed 'Refunded to the original payment method (online)' note plus a 'Refund in cash instead' toggle when paymentMethod is 'online' and providerPaymentId is set; the refund amount input clamped to totalPaise - refundedPaise with 'Remaining refundable: X' shown.
apps/web/src/lib/refunds.ts (new, pure, the testable unit) — refundableState({ status, paymentStatus, totalPaise, refundedPaise, paymentMethod, providerPaymentId }) -> { canRefund, maxRefundablePaise, forcedMethod: 'online'|null, reason }.
apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx — Tender panel shows 'Refunded X of Y'.
apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx — a partially-refunded bill prints the refund line; a reprint of a refunded bill must not read as a clean sale.

### Tests

apps/web/src/lib/refunds.test.ts (new): 'a cancelled but paid order is refundable'; 'a completed paid order is refundable'; 'an unpaid cancelled order is not refundable'; 'maxRefundable equals total minus already refunded'; 'a fully refunded order is not refundable again'; 'an online payment with a provider payment id forces the online method'; 'an online payment with no provider payment id does not force a method'.
apps/api/src/routes/orders.test.ts: 'refunds a cancelled paid order and returns 200'; 'rejects a cumulative refund that would exceed the order total with 400 REFUND_EXCEEDS_TOTAL'; 'two partial refunds summing to the total mark the order refunded'; 'one partial refund leaves paymentStatus paid and sets refundedPaise'; 'calls provider.refund with the provider payment id and the amount in paise for an online payment'; 'writes no ledger row and returns 502 PAYMENT_REFUND_FAILED when provider.refund throws'; 'sends the same idempotency key when the identical refund is retried'; 'returns 503 PAYMENT_UNCONFIGURED for an online refund at a cafe with no credentials'; 'forceMethod cash skips the provider and records the override in the audit metadata'; 'a cash refund of a cash order never calls the provider'; 'refund on another owner cafe returns 404'; 'cancelling a paid order returns refundDue true'; 'cancelling an unpaid order returns refundDue false'.
apps/api/src/payments/razorpay.test.ts: 'refund POSTs to /payments/:id/refund with the amount in paise'; 'refund sends the X-Payment-Idempotency-Key header'; 'refund throws carrying the provider status on a non-2xx response'.

### Files

- `apps/api/src/payments/razorpay.ts`
- `apps/api/src/payments/razorpay.test.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations/0016_order_refunded_paise.sql`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/lib/refunds.ts`
- `apps/web/src/lib/refunds.test.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`

---

<a id="diner-resume-payment"></a>

## 🟠 `diner-resume-payment` — Diner can resume an interrupted payment from Your orders and after a reload

### Approach

Verified: the Pay/Retry CTA lives only in DinerOrder's React state (diner-order.tsx:355-371 renders <Confirmation> off `placed`), so a lock screen or back-swipe drops the diner onto the menu with no route back. Verified: OrdersView (ai-widget.tsx:425-480) renders a status pill and a 'Paid' pill and nothing else — no action on an unpaid record. Both auditor pointers correct.

1. Extract startPayment (diner-order.tsx:174-277) into apps/web/src/lib/start-payment.ts as startPayment(deps: { slug, apiUrl, orderId, orderNumber, cafeName, themeColor, prefill: { name?, contact? }, razorpay: () => Promise<RazorpayConstructor>, onPaid(order), onPending(), onError(message) }). One implementation, called from both diner-order.tsx and the new Pay button. Injecting the Razorpay global makes it unit-testable.
2. ai-widget.tsx OrdersView: render a `Pay {formatRupees(o.totalPaise)}` button on any record whose live paymentStatus (liveById[o.id] ?? o.paymentStatus) is 'unpaid' | 'pending' | 'failed', gated on a new prop onlinePaymentEnabled. AiWidget gains two props — onlinePaymentEnabled: boolean and onPay: (order: DinerOrderRecord) => void — wired from diner-order.tsx:476-486, which already holds `cafe` and startPayment.
3. Move the status poll (ai-widget.tsx:73-107) so it runs whenever the sheet is open, not only while view === 'orders', and show a dot on the Orders tab when any record is unpaid. Today a diner in the chat tab has no signal that money is owed.
4. Confirmation rehydrate: add setLastDinerOrderId/getLastDinerOrderId/clearLastDinerOrderId to apps/web/src/lib/diner-orders.ts (alongside getDinerOrders at :23-33) keyed `sangam:diner-last-order:<slug>`. On mount, diner-order.tsx reads the key, fetches GET /public/cafes/:slug/orders/:orderId, and if the order is not paid restores `placed` and derives confirmKind from live state rather than from whatever was in memory. Clear the key on paid and on 'Order something else'.
5. New pure helper confirmKindFor({ paymentStatus, onlinePaymentEnabled, prepaidRequired }) -> ConfirmKind, replacing the inline branch at diner-order.tsx:336-347 so both the place-order path and the rehydrate path derive the screen identically.
6. No duplicate Razorpay order is created on resume: payments.ts:90-99 already reuses order.providerOrderId when paymentStatus is 'pending'. Confirmed, no server change needed.

### API

none. Reuses POST /public/cafes/:slug/orders/:orderId/payment (200 CreatePaymentResponse | 409 PAYMENT_CONFLICT when already paid | 503 PAYMENT_UNCONFIGURED), POST /public/cafes/:slug/orders/:orderId/payment/verify, and GET /public/cafes/:slug/orders/:orderId — all unchanged.

### Web

apps/web/src/lib/start-payment.ts (new, extracted from diner-order.tsx:174-277).
apps/web/src/lib/diner-confirm.ts (new, confirmKindFor).
apps/web/src/lib/diner-orders.ts — add the last-order-id helpers.
apps/web/src/app/m/[slug]/diner-order.tsx — call the extracted startPayment; add the mount rehydrate effect; pass onlinePaymentEnabled + onPay to AiWidget.
apps/web/src/app/m/[slug]/ai-widget.tsx — Pay CTA in OrdersView (425-480); poll regardless of active tab; unpaid dot on the Orders tab.

### Tests

apps/web/src/lib/diner-orders.test.ts (new): 'getDinerOrders returns an empty list when localStorage is empty'; 'getDinerOrders returns an empty list for corrupt JSON'; 'addDinerOrder de-duplicates by order id and caps the list at 25'; 'updateDinerOrder patches paymentStatus without dropping other records'; 'setLastDinerOrderId and getLastDinerOrderId round-trip per slug'; 'clearLastDinerOrderId removes only that slug key'.
apps/web/src/lib/start-payment.test.ts (new, fetch and the Razorpay constructor stubbed): 'POSTs to the create-payment endpoint and opens Checkout with the returned keyId and providerOrderId'; 'calls onPaid after a successful verify'; 'calls onPending when the diner dismisses Checkout'; 'calls onPending when verify returns a non-2xx'; 'surfaces the server message when create-payment returns 503 PAYMENT_UNCONFIGURED'; 'a resumed payment reuses the existing providerOrderId and does not create a second Razorpay order'.
apps/web/src/lib/diner-confirm.test.ts (new): 'paid maps to the paid screen'; 'prepaid plus unpaid maps to pending'; 'tab plus unpaid maps to choose'; 'online payment off maps to counter'; 'failed under prepaid maps to pending'.

### Files

- `apps/web/src/lib/start-payment.ts`
- `apps/web/src/lib/start-payment.test.ts`
- `apps/web/src/lib/diner-confirm.ts`
- `apps/web/src/lib/diner-confirm.test.ts`
- `apps/web/src/lib/diner-orders.ts`
- `apps/web/src/lib/diner-orders.test.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/app/m/[slug]/ai-widget.tsx`

---

<a id="z-report-settled-open-refunds"></a>

## 🔴 `z-report-settled-open-refunds` — Z-report splits settled vs open sales and deducts refunds so the day ties to the drawer

### Approach

Verified: repositories/reports.ts:43 defines notCancelled = inDay AND status <> 'cancelled', and every revenue aggregate (:47-73) uses it — so a table still eating at 11pm counts at full bill value. Verified: there is no aggregate over order_payments where kind = 'refund' (the refund row is written at repositories/orders.ts:369-376), so a refund is invisible to the Z-report. Auditor's pointers correct.

One subtlety the audit misses: filtering settled revenue on paymentStatus = 'paid' alone would EXCLUDE a fully refunded order, while byPaymentMethod (:56-64, grouped on orders.paymentMethod, which is only ever non-null once an order is paid) still INCLUDES it — recreating the exact card-vs-tile disagreement this gap is about. Settled must be paymentStatus IN ('paid','refunded'), with refunds shown as an explicit deduction.

1. Keep grossSalesPaise as-is (all non-cancelled) so anyone comparing against yesterday's number is not silently rebased, and add:
   - settledAgg: notCancelled AND payment_status IN ('paid','refunded') -> settledSalesPaise, settledCount
   - openAgg: notCancelled AND payment_status IN ('unpaid','pending','failed') -> openSalesPaise, openCount
   - refundAgg: over schema.orderPayments where cafe_id = $1 AND kind = 'refund' AND created_at >= fromIso AND created_at < toIso, grouped by method -> refundsPaise, refundCount, and the per-method deduction
2. Refunds are bucketed by the REFUND's own created_at, not the order's. A refund issued today against yesterday's bill comes out of today's drawer — that is what has to reconcile against the cash count and the UPI statement. Documented in the DayEndReport doc comment because it deliberately differs from every other aggregate in the report.
3. PaymentMethodBreakdown gains refundPaise so the payment-mode card shows 'Cash 5,000 (-400 refunded)' and finally agrees with the tiles.
4. netSettledPaise = settledSalesPaise - refundsPaise. Both operands are SUMs of integer paise columns; the only derived value in the report is one integer subtraction. Nothing is apportioned across lines here, so no remainder rule applies. Keep the file's existing Number(x ?? 0) coercion on every sum() result.
5. REGRESSION GUARD for WI-2: splitAgg (:88-105) folds order_payments rows in only where orders.paymentMethod IS NULL. markPaid now writes a ledger row AND sets paymentMethod = 'online', so the online amount is still counted exactly once, via the order-level paymentAgg. This is one isNull away from double-counting every QR payment in the country, so it gets its own named test.
6. Extract buildCsv (reports-view.tsx:395-442) into apps/web/src/lib/day-end-csv.ts so the export is unit-testable — currently untestable because it is a module-private function in a client component.

### Schema

none. order_payments already has order_payments_cafe_created_at_idx on (cafe_id, created_at), which is exactly the refund aggregate's access path.

### API

GET /cafes/:cafeId/reports/day-end?date=YYYY-MM-DD — request unchanged, status codes unchanged (200 | 400 malformed date | 401 | 404). Response { report: DayEndReport } grows additively:
packages/types/src/reports.ts:
  interface PaymentMethodBreakdown { method: PaymentMethod; grossPaise: number; refundPaise: number; count: number }   // refundPaise is NEW and required
  interface DayEndReport { ...existing 10 fields...;
    settledSalesPaise: number;   // non-cancelled, paymentStatus in ('paid','refunded')
    settledCount: number;
    openSalesPaise: number;      // non-cancelled, paymentStatus in ('unpaid','pending','failed') — NOT revenue
    openCount: number;
    refundsPaise: number;        // refunds issued this business day, by refund timestamp, positive magnitude
    refundCount: number;
    netSettledPaise: number;     // settledSalesPaise - refundsPaise
  }
Additive for consumers that read fields, but PaymentMethodBreakdown gaining a required member is a compile-time break for any code that CONSTRUCTS one — i.e. the fixtures in apps/api/src/routes/reports.test.ts and any web test literal.

### Web

apps/web/src/app/cafes/[id]/reports/reports-view.tsx DayEndSummary (168-239): promote the tile row to Net settled (primary) / Settled sales / Refunds / Open (unsettled), with the Open tile hinting 'n orders still unpaid — not in the drawer', and demote Gross / Net / Tax / Orders to a secondary row. Add a one-line reconciliation strip under the tiles: 'Settled A - Refunds B = Net C', so the owner can see why the payment-mode card and the gross tile differ instead of guessing. Each payment-mode Row gains a '-X refunded' sub-line when refundPaise > 0.
apps/web/src/lib/day-end-csv.ts (new, buildCsv moved out of reports-view.tsx): metric block gains Settled sales / Open (unsettled) / Open orders / Refunds / Net settled rows; the payment-mode block gains a 'Refunds (Rs)' column.

### Tests

apps/api/src/repositories/reports.repo.test.ts (new, fake-Drizzle style per apps/api/src/repositories/table-sessions.repo.test.ts) and apps/api/src/routes/reports.test.ts:
'day-end keeps an unpaid in-flight order out of settledSalesPaise and reports it under openSalesPaise'; 'grossSalesPaise equals settledSalesPaise plus openSalesPaise'; 'a refund issued today against yesterday order lands in today refundsPaise'; 'a refund issued yesterday against today order does not land in today refundsPaise'; 'netSettledPaise equals settledSalesPaise minus refundsPaise'; 'a fully refunded order stays inside settledSalesPaise and is deducted exactly once through refundsPaise'; 'byPaymentMethod carries the per-method refundPaise'; 'an online order settled by markPaid is counted once, not twice, across the order-level and ledger aggregates'; 'a split-tender order is still summed from order_payments'; 'a cancelled order contributes to neither settled nor open'; 'a day with no orders returns zeros for every new field'.
apps/web/src/lib/day-end-csv.test.ts (new): 'emits Settled sales, Open, Refunds and Net settled rows'; 'the payment-mode block includes a refunds column'; 'escapes a comma inside an item name'; 'renders paise as a two-decimal rupee string'.

### Files

- `apps/api/src/repositories/reports.ts`
- `apps/api/src/repositories/reports.repo.test.ts`
- `apps/api/src/routes/reports.test.ts`
- `packages/types/src/reports.ts`
- `apps/web/src/app/cafes/[id]/reports/reports-view.tsx`
- `apps/web/src/lib/day-end-csv.ts`
- `apps/web/src/lib/day-end-csv.test.ts`

---

## Order of work

1. 1. per-cafe-payment-credentials FIRST — it changes how a provider is resolved and it is the only item that can leak secrets. Every later item calls resolveProvider / findProviderConfig, so building them against the old module-level provider means rewriting them. Land the crypto util and the cafes-repo column projection before touching any payment route. Migration 0013.
2. 2. razorpay-webhook-idempotent-settlement — depends on per-cafe webhook secrets from step 1 (the endpoint is /webhooks/razorpay/:cafeId precisely because the secret is per cafe). Its transactional markPaid rewrite is the foundation both step 3 (hold release) and step 6 (report double-count guard) build on. Migration 0014 plus the ledger backfill. Verify the post-migration assertion returns 0 before proceeding.
3. 3. prepaid-kitchen-hold — needs step 2's markPaid transaction to clear kitchen_hold as part of settlement. Migration 0015. Ship the kitchen payment badge together with the hold; a badge on tickets that can no longer be unpaid is pointless on its own, and the badge is the fallback when a cafe runs the pay-later tab mode.
4. 4. refunds-that-actually-move-money — needs step 1's per-cafe provider (to call the right Razorpay account) and step 2's order_payments.provider_refund_id column and refund.processed webhook (to reconcile a provider-succeeded / DB-failed window). Migration 0016 plus the refunded_paise backfill. The one-line UI gate change at order-actions.tsx:219 can land on day one as an independent hotfix if a cancelled-paid order is stuck in production right now — the API already permits it — but do not ship the provider call before step 1.
5. 5. diner-resume-payment — web-only, no server dependency; can run in parallel with steps 2-4 by a second developer. Sequence it after step 3 only if you want the Pay CTA to say 'your order is waiting for payment' rather than 'unpaid'.
6. 6. z-report-settled-open-refunds — depends on steps 2 and 4 for the data it reports (ledger rows for online payments, refunded_paise), and its double-count test is the regression guard on step 2. Independent of steps 3 and 5. Land it last so the numbers it reports are the corrected ones.
7. 7. Razorpay test-mode end-to-end pass before any of this reaches a real cafe: create order -> dismiss Checkout -> resume from Your orders -> pay by test UPI -> confirm the webhook arrives over a tunnelled URL -> kill the browser mid-verify and confirm the webhook still settles -> full refund -> partial refund -> Z-report reconciles. Unit tests stub the provider and prove nothing about the real API contract.

## Risks

- Money is in flight during the rollout. Items 2 and 4 change how payments and refunds are recorded, and both carry backfills. Run each backfill inside a transaction with the stated post-migration assertion, and roll out per cafe (credentials are per cafe anyway, so the blast radius is naturally one merchant at a time).
- Route vs BYO keys is a business decision this plan makes for you. BYO (the cafe's own Razorpay account) is what is planned: fast, no platform funds-handling, no RBI Payment Aggregator exposure. It also means Sangam CANNOT take a per-transaction cut — money never touches the platform. If a take-rate is required commercially, Razorpay Route is mandatory: roughly 5 more engineer-days plus Razorpay marketplace onboarding and KYC that can take weeks of calendar time. razorpay_account_id is reserved for that, but do not promise a take-rate on this plan's timeline.
- If anyone 'simplifies' back to a single pooled Razorpay account plus manual payouts to cafes, Sangam becomes a funds-holder and needs an RBI Payment Aggregator licence. Write this into the code comment above the credentials columns, not just here.
- The cafes repository uses bare select() in findByIdAndOwner, findBySlug and listByOwner. Adding the encrypted columns without converting all three to explicit projections ships ciphertext to every browser that loads GET /cafes/:id. This is the single most likely way to get item 1 wrong, and no existing test would catch it — hence the explicit 'GET omits the enc columns' test.
- The webhook signature must be verified over raw bytes. Wrapping webhooksRoutes in fastify-plugin would de-encapsulate the content-type parser and replace JSON parsing app-wide — silently, in a way that also breaks every other route's body parsing. Pinned by a test, but review it deliberately.
- Losing PAYMENT_CREDENTIALS_KEY means every cafe must re-enter its Razorpay credentials; there is no rotation path in v1 (the 'v1:' blob prefix is the hook for one). Treat it as a production secret with the same care as DATABASE_URL, and back it up before the first cafe onboards.
- Gapless invoice numbers are still allocated at order creation (repositories/orders.ts:111-125), so an abandoned prepaid order that later expires still consumes a serial. Legal, since the cancellation is recorded and appears in the Z-report's cancelled bucket, but it remains a free way for a bored teenager to burn serials and pollute the day's order count. The proper fix — allocating the serial at settlement rather than creation — is a substantial change to create() and its transaction, and is deliberately out of scope here.
- The stale-hold sweep is lazy: it runs off the kitchen-tickets request, so holds are not expired while the kitchen board is closed. Nothing is being cooked in that window, so it is safe, but the orders list will show stale held orders overnight until someone opens the board. A real scheduler is the follow-up.
- The Z-report buckets refunds by the refund's own timestamp while every other aggregate buckets by the order's timestamp. This is correct for drawer reconciliation and wrong for anyone treating the report as a per-order ledger. Document it in the DayEndReport doc comment, or an accountant will file a bug.
- PaymentMethodBreakdown gaining a required refundPaise member breaks every literal that constructs one (test fixtures in reports.test.ts, any web mock). Compile-time, not runtime, but it will surface as a wall of TS errors on the first build after the types change.
- provider.refund is called before the ledger write, so a provider success followed by a DB failure leaves money moved with no Sangam record until the refund.processed webhook reconciles. This ordering is deliberate — the reverse ordering would let Sangam claim a refund that never happened — but it means item 4 genuinely depends on item 2's webhook, not just nominally.
- Nothing here proves the real Razorpay API contract; all provider tests stub it. The manual test-mode pass in sequencing step 7 is not optional padding, it is the only coverage of the actual integration.
