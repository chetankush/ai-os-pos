# Onboarding, validation & config hygiene

**Estimated effort: 19 engineer-days · 12 work items**

This theme covers everything between "owner signs up" and "guest is handed a legally correct piece of paper": the install-day config trap that makes a fresh deploy look broken in two misleading ways, an auth middleware that signs the counter out whenever the network hiccups (killing the offline order queue exactly when it is needed), tax identifiers that accept nonsense while a GST-charging cafe can have no GSTIN at all, a dead-end first run, and three bill surfaces that disagree with each other — the dine-in consolidated bill is an un-maintained fork that hardcodes "TAX INVOICE" and silently drops every discount/service/packaging/round-off line, so any composition cafe hands out an illegal document all day and any adjusted bill visibly fails to add up. For a cafe the payoff is concrete: the counter stays usable when the WiFi drops, install day takes an hour instead of a day, the printed bill is the same correct document on every path (counter, table tab, diner phone), and the corporate guest can finally get their GSTIN on the invoice instead of it being hand-written and rejected.

---

<a id="env-config-preflight"></a>

## 🟠 `env-config-preflight` — Document the real Supabase env surface and fail loudly instead of silently degrading

### Approach

Verified: apps/api/.env.example documents only SUPABASE_JWT_SECRET; apps/api/src/config/env.ts already reads SUPABASE_URL and SUPABASE_SECRET_KEY (both optional), apps/api/src/routes/auth.ts:52-58 returns early (never registering POST /auth/signup) when either is missing, and apps/api/src/plugins/auth.ts builds the JWKS set only when SUPABASE_URL is set. The developer's own apps/api/.env has SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY — none of which the example carries; SUPABASE_PUBLISHABLE_KEY is not even in the env schema. The warning at apps/api/src/routes/index.ts:48 says 'requires DATABASE_URL and SUPABASE_JWT_SECRET' which is now wrong on both counts (auth needs SUPABASE_JWT_SECRET *or* SUPABASE_URL).

Three changes. (1) Rewrite the Auth block of .env.example to list SUPABASE_URL (required for modern ES256 projects — without it every authenticated call 401s), SUPABASE_SECRET_KEY (required or /auth/signup is never registered and returns the generic 404 'Route not found'), SUPABASE_PUBLISHABLE_KEY, SUPABASE_JWT_SECRET (legacy HS256, also what the test suite signs with) and WEB_APP_URL, each with a one-line 'symptom if missing' note. (2) Add SUPABASE_PUBLISHABLE_KEY and WEB_APP_URL to the env schema. (3) Replace the ad-hoc app.log.warn calls with a single startup preflight, apps/api/src/config/preflight.ts, exporting a pure `capabilityReport(env): CapabilityReport` that returns, per capability group (db, auth-hs256, auth-jwks, signup, payments, ai, cache), `{ enabled, missing: string[], symptom: string }`. buildApp logs it as one warn-level table at boot; a new `GET /health/config` returns the same object with no secret values so install-day debugging is one curl. In production, if DATABASE_URL is set but neither SUPABASE_JWT_SECRET nor SUPABASE_URL is, throw at boot instead of booting a server where every request 401s — a half-configured prod API is worse than a crash loop.

The preflight is where the honest fix lives: the current failure mode is two symptoms (404 on signup, 401 on everything) that both point away from the actual cause.

### API

GET /health/config -> 200 { capabilities: Array<{ name: 'db'|'auth-hs256'|'auth-jwks'|'signup'|'payments'|'ai'|'cache', enabled: boolean, missing: string[], symptom: string }> }. No auth (it leaks only variable NAMES, never values); rate-limited by the default anonymous bucket. Existing GET /health is unchanged.

### Tests

apps/api/src/config/preflight.test.ts: 'reports signup disabled with SUPABASE_SECRET_KEY in missing[] when only SUPABASE_URL is set'; 'reports auth-jwks disabled and auth-hs256 enabled when only SUPABASE_JWT_SECRET is set'; 'reports every capability enabled for a fully populated env'; 'never includes a secret value in the report'. apps/api/src/routes/health.test.ts: 'GET /health/config returns the capability matrix'; 'GET /health/config response body contains no value from process.env'. apps/api/src/app.test.ts (new): 'buildApp throws in production when DATABASE_URL is set and no Supabase auth config is present'; 'buildApp does not throw in development with the same env'. Plus a repo-level guard test apps/api/src/config/env-example.test.ts: 'every non-commented key in .env.example is a key in the env schema' and 'every required-in-production schema key appears in .env.example' — this is what stops the example drifting again.

### Files

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/config/preflight.ts`
- `apps/api/src/config/preflight.test.ts`
- `apps/api/src/config/env-example.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/health.test.ts`

---

<a id="auth-session-resilience"></a>

## 🔴 `auth-session-resilience` — Stop signing the counter out on a network blip; drop the per-navigation Supabase round-trip

### Approach

Verified: apps/web/src/lib/supabase/middleware.ts:28-30 destructures only `{ data: { user } }` from getUser() and throws the error away, then line 44 treats `!user` as 'not logged in' for every non-public path. The middleware matcher (apps/web/src/middleware.ts:9) covers everything, so /m/* diner pages pay a Supabase round-trip too. apps/web/src/app/cafes/layout.tsx:14-19 then makes a *second* getUser() call on every owner page, with the same redirect-on-any-failure behaviour — the same root cause, two files. The offline order queue (apps/web/src/lib/offline-queue.ts, mounted in orders/new/order-builder.tsx) is unreachable if either redirect fires.

Fix in three parts.

(1) New pure module apps/web/src/lib/supabase/session-cookie.ts, no network, fully unit-testable:
  - `readCookieSession(cookies: Array<{name,value}>): CookieSession | null` — finds cookies matching /^sb-.+-auth-token(\.\d+)?$/, sorts chunk suffixes numerically, concatenates, strips a leading 'base64-' prefix, base64url-decodes, JSON.parses, pulls `access_token`, then base64url-decodes the JWT's middle segment for `{ sub, email, exp }`. Returns null on any malformed step (never throws).
  - `decideSession(session: CookieSession | null, nowMs: number): 'anonymous' | 'valid' | 'needs-refresh'` — null -> 'anonymous'; exp*1000 - nowMs > REFRESH_WINDOW_MS (300_000) -> 'valid'; otherwise 'needs-refresh' (this includes already-expired).
  - `resolveVerifyOutcome(getUserResult, session, nowMs): 'authed' | 'anonymous' | 'degraded-authed'` — a user object -> 'authed'; an error whose `status` is 401 or 403 -> 'anonymous' (genuine sign-out); any other error (AuthRetryableFetchError, TypeError from fetch, abort, 5xx) -> 'degraded-authed' if the cookie session's exp is still in the future, else 'anonymous'.
SECURITY NOTE that must go in the file header: the JWT payload is read WITHOUT signature verification. That is acceptable here and only here — the Next layer is not the security boundary; apps/api/src/plugins/auth.ts verifies every token against the JWKS/HS256 secret, so a forged cookie buys a rendered shell whose every API call 401s. Never use readCookieSession to authorise anything.

(2) Rewrite updateSupabaseSession to: compute isPublic FIRST and return NextResponse.next() immediately for /_next, /api/, /m/*, / and the marketing paths — no Supabase client constructed at all, which removes the round-trip from every diner QR scan. Then readCookieSession + decideSession. On 'valid', skip getUser() entirely and serve the page (this is the latency win: no Supabase hop on a normal navigation). On 'needs-refresh' or 'anonymous', construct the client with `global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(2500) }) }` and call getUser(), capturing `{ data, error }`, then branch on resolveVerifyOutcome. Only 'anonymous' redirects to /login. 'degraded-authed' serves the page. /login and /signup keep the verified path (a stale-cookie bounce to /cafes that the layout bounces back would loop) and additionally carry a `?next=` param preserved through the redirect.

(3) apps/web/src/app/cafes/layout.tsx: replace `supabase.auth.getUser()` with a new `getLayoutUser()` in apps/web/src/lib/supabase/server.ts that uses readCookieSession for `{ id, email }` and only falls back to getUser() when the cookie is absent/expired. Same redirect rule (redirect only on 'anonymous'). This removes the second per-navigation network hop.

Breaking-change note: a user whose Supabase session was revoked server-side (password change, admin sign-out) stays visually 'logged in' in the web shell for up to REFRESH_WINDOW_MS past the access-token exp. Every API call still 401s, so no data is exposed. This is a deliberate trade and belongs in the PR description.

### Web

apps/web/src/lib/supabase/middleware.ts (rewritten), apps/web/src/lib/supabase/session-cookie.ts (new), apps/web/src/lib/supabase/server.ts (add getLayoutUser), apps/web/src/app/cafes/layout.tsx (use getLayoutUser). No visual change except: /login gains a `?next=` round-trip so a blip-recovered redirect returns the cashier to the page they were on, not the cafe list.

### Tests

apps/web/src/lib/supabase/session-cookie.test.ts: 'reads a single unchunked sb-<ref>-auth-token cookie'; 'reassembles .0/.1/.2 chunks in numeric order, not lexicographic'; 'strips the base64- prefix before decoding'; 'returns null for a malformed cookie without throwing'; 'returns null when no sb-* auth cookie is present'; 'decideSession returns valid when exp is 10 minutes out'; 'decideSession returns needs-refresh when exp is 60 seconds out'; 'decideSession returns needs-refresh for an already-expired token'; 'resolveVerifyOutcome returns anonymous for a 401 AuthError'; 'resolveVerifyOutcome returns degraded-authed for a network TypeError with an unexpired cookie'; 'resolveVerifyOutcome returns degraded-authed for AuthRetryableFetchError'; 'resolveVerifyOutcome returns anonymous for a network error with an expired cookie'; 'resolveVerifyOutcome returns anonymous for a 403'. apps/web/src/lib/supabase/middleware.test.ts (mock createServerClient): 'serves /cafes/<id>/orders/new when getUser rejects with a network error and the cookie is unexpired'; 'redirects to /login when getUser returns a 401'; 'does not call createServerClient at all for /m/<slug>'; 'does not call getUser when the cookie session has 10 minutes left'; 'calls getUser when the cookie session has 60 seconds left'; 'preserves the original path in ?next= on redirect'.

### Files

- `apps/web/src/lib/supabase/middleware.ts`
- `apps/web/src/lib/supabase/middleware.test.ts`
- `apps/web/src/lib/supabase/session-cookie.ts`
- `apps/web/src/lib/supabase/session-cookie.test.ts`
- `apps/web/src/lib/supabase/server.ts`
- `apps/web/src/app/cafes/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`

---

<a id="tax-id-validation"></a>

## 🟠 `tax-id-validation` — Real GSTIN/FSSAI validation, and no GST-charging cafe without a GSTIN

### Approach

Verified: apps/api/src/routes/cafes.ts:24-25 uses `z.string().trim().length(15)` for gstin and `.min(7).max(14)` for fssai; :44-65 repeats the same in the partial update schema; gstMode defaults to 'regular_5' at :113 with no cross-check against gstin. The web validators at new-cafe-form.tsx:70-74 and edit-cafe-form.tsx:83-87 only check `length !== 15`. Note apps/api/src/routes/orders.ts:41-46 ALREADY has the correct GSTIN pattern for the *customer* GSTIN — the cafe's own GSTIN is the weaker of the two. Reuse and centralise.

New shared runtime module packages/types/src/tax-id.ts (the package already emits runtime values — see EXPENSE_CATEGORIES in expenses.ts — so both apps can import it from '@sangam/types'):
  - `GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/`
  - `GSTIN_STATE_CODES: ReadonlySet<string>` = '01'..'38' plus '97' (Other Territory) and '99' (Centre Jurisdiction).
  - `gstinChecksumChar(first14: string): string` — alphabet '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; for i in 0..13, factor = i % 2 === 0 ? 1 : 2, product = index(char) * factor, sum += Math.floor(product / 36) + (product % 36); return alphabet[(36 - (sum % 36)) % 36]. All integer arithmetic.
  - `isValidGstin(v: string): boolean` — uppercase+trim, GSTIN_RE, state code in the set, and char 14 === gstinChecksumChar(chars 0..13). Worked example that must be in the test: '27AAPFU0939F1ZV' checksums to 'V' (weighted sum 221, 221 % 36 = 5, (36-5)%36 = 31, alphabet[31] = 'V').
  - `FSSAI_RE = /^[12][0-9]{13}$/` — exactly 14 digits, first digit 1 (licence) or 2 (registration). `isValidFssai(v)`.
  - `gstModeRequiresGstin(mode: GstMode): boolean` — true for 'regular_5' and 'regular_18'.

API changes in apps/api/src/routes/cafes.ts:
  - createCafeBodySchema: gstin -> `.transform(s => s.toUpperCase()).refine(isValidGstin, 'Enter a valid 15-character GSTIN')`; fssai -> `.refine(isValidFssai, 'FSSAI licence number is 14 digits')`; gstMode becomes REQUIRED (drop `.optional()` and drop the `?? 'regular_5'` fallback at :113).
  - POST /cafes: after parse, if gstModeRequiresGstin(body.gstMode) && !body.gstin -> 400 { error: { code: 'GSTIN_REQUIRED', message: 'A cafe on the 5% or 18% GST regime must have a GSTIN — it is printed on every tax invoice. Choose Composition or Exempt if you are not GST-registered.' } }.
  - PATCH /cafes/:id: the partial patch cannot be validated in isolation. Fetch the current cafe with cafesRepo.findByIdAndOwner FIRST (404 if absent — this also brings the route in line with the house rule, which it currently skips by going straight to repo.update), merge `{ ...current, ...patch }`, and apply the same GSTIN_REQUIRED check to the merged state. Only then call repo.update.

BREAKING CHANGE + BACKFILL: gstMode becomes required on POST /cafes. Any existing caller omitting it now gets a 400. The only caller is the web form, which always sends it — but note it in the changelog. FSSAI tightening from 7-14 chars to exactly 14 digits means an existing cafe holding a short/legacy FSSAI can no longer save ANY edit (the edit form always sends fssai). Ship a one-off audit query in packages/db/scripts/audit-tax-ids.sql — `select id, name, gstin, fssai, gst_mode from cafes where (gstin is not null and length(gstin) <> 15) or (fssai is not null and fssai !~ '^[12][0-9]{13}$') or (gst_mode in ('regular_5','regular_18') and coalesce(gstin,'') = '')` — and run it before deploy. Do NOT auto-null bad values: a wrong GSTIN on file is a fact the owner must correct, not something to silently erase.

Because existing rows can already be in the bad state, add a dismissible banner (not a blocker) on the cafe dashboard when `gstModeRequiresGstin(cafe.gstMode) && !cafe.gstin`: 'Your bills charge 5% GST but no GSTIN is printed on them. That is not a valid tax invoice — add your GSTIN in cafe settings.' with a link to /cafes/[id]/edit.

Web: replace the length checks in both forms with isValidGstin/isValidFssai, uppercase the GSTIN input on change, add an `fssai` entry to ErrorField/FIELD_ORDER and a ref (it currently has neither, so an invalid FSSAI cannot be focused), and gate the submit on the gstMode/gstin pair with the same message. In new-cafe-form.tsx set INITIAL.gstMode to '' with a disabled placeholder option 'Select your GST regime' so the owner makes an explicit choice rather than silently inheriting 5%.

### Schema

none — no column changes. One read-only audit query file: packages/db/scripts/audit-tax-ids.sql.

### API

POST /cafes — body gains a REQUIRED `gstMode: 'regular_5'|'regular_18'|'composition'|'exempt'`; `gstin?: string` now must satisfy the 15-char pattern + state code + mod-36 checksum; `fssai?: string` now must be 14 digits starting 1 or 2. New failure: 400 { error: { code: 'GSTIN_REQUIRED', message: string } } when gstMode is regular_5/regular_18 and gstin is absent or empty. Malformed gstin/fssai continue to surface as the existing 400 VALIDATION_ERROR envelope from the Zod handler. PATCH /cafes/:id — same field rules; the GSTIN_REQUIRED check runs against { ...currentCafe, ...patch }; the route now returns 404 NOT_FOUND before validating when the cafe is not the caller's. 201/200 success bodies unchanged.

### Web

apps/web/src/app/cafes/new/new-cafe-form.tsx (validate() uses isValidGstin/isValidFssai; gstMode select starts unselected; fssai gains a ref + FIELD_ORDER slot; GSTIN input uppercases on change; new gstMode/gstin cross-check error rendered on the gstMode field). apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx (same three changes). apps/web/src/app/cafes/[id]/page.tsx (new GstinMissingBanner above the stats grid, rendered only when gstModeRequiresGstin(cafe.gstMode) && !cafe.gstin).

### Tests

packages/types/src/tax-id.test.ts: 'accepts 27AAPFU0939F1ZV'; 'rejects 27AAPFU0939F1ZA (checksum char wrong)'; 'rejects AAAAAAAAAAAAAAA (pattern)'; 'rejects 39AAPFU0939F1ZV (state code 39 is not assigned)'; 'accepts state code 97 and 99'; 'rejects a 14-char and a 16-char string'; 'lowercase input is accepted after uppercasing'; 'gstinChecksumChar returns V for 27AAPFU0939F1Z'; 'isValidFssai accepts 10012345678901'; 'isValidFssai rejects 12345678901234 starting with 3'; 'isValidFssai rejects a 13-digit and a 7-digit value'; 'gstModeRequiresGstin is true only for regular_5 and regular_18'. apps/api/src/routes/cafes.test.ts: 'POST /cafes rejects a structurally valid but checksum-failing GSTIN with 400'; 'POST /cafes rejects a 7-digit FSSAI with 400'; 'POST /cafes rejects gstMode regular_5 with no gstin, code GSTIN_REQUIRED'; 'POST /cafes accepts gstMode composition with no gstin'; 'POST /cafes rejects a body with no gstMode'; 'POST /cafes uppercases a lowercase gstin before persisting'; 'PATCH /cafes/:id rejects switching an existing composition cafe to regular_5 while gstin is null'; 'PATCH /cafes/:id accepts switching to regular_5 when the same body supplies a valid gstin'; 'PATCH /cafes/:id rejects clearing gstin to null on a regular_18 cafe'; 'PATCH /cafes/:id returns 404 (not 403) for another owner cafe before any validation runs'.

### Files

- `packages/types/src/tax-id.ts`
- `packages/types/src/tax-id.test.ts`
- `packages/types/src/index.ts`
- `apps/api/src/routes/cafes.ts`
- `apps/api/src/routes/cafes.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/web/src/app/cafes/new/new-cafe-form.tsx`
- `apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx`
- `apps/web/src/app/cafes/[id]/page.tsx`
- `packages/db/scripts/audit-tax-ids.sql`

---

<a id="email-verification"></a>

## 🟡 `email-verification` — Prove the signup email address; surface an unverified banner

### Approach

Verified: apps/api/src/routes/auth.ts:76-81 posts to Supabase's admin users endpoint with `email_confirm: true`, so a typo'd address yields a fully working account bound to an inbox the owner does not control.

SPIKE FIRST (0.5d, and be honest that this is a spike): GoTrue's behaviour differs by version. Confirm against the project's Supabase instance which of these actually sends mail — (a) POST /auth/v1/admin/generate_link { type: 'signup' } (generates; may or may not send depending on version/SMTP), (b) POST /auth/v1/resend { type: 'signup', email } with the publishable key (documented to send). Do not build on assumption; the endpoint that demonstrably delivers is the one to wire.

Implementation once confirmed:
  - Change the admin create call to `email_confirm: false`. Instant sign-in still works provided the project's 'Confirm email' toggle is OFF — this is now a load-bearing project setting, so document it in .env.example next to SUPABASE_URL and in the preflight symptom text from `env-config-preflight`.
  - After a successful create, fire the verification send with `AbortSignal.timeout(4000)`. A send failure must NEVER fail signup: catch, request.log.warn, and report it in the response.
  - Response becomes 201 { user: { id, email, emailVerified: false }, verificationEmailSent: boolean }. `verificationEmailSent: false` is what the signup screen uses to say 'We could not send the confirmation email — you can resend it from your dashboard' instead of silently pretending.
  - New route POST /auth/resend-verification, authenticated (app.authenticate), rate-limited hard at max 3 / 15 minutes keyed by the bearer token. It reads the email from request.user, calls the same send helper, returns 202 { sent: boolean }. Extract the send into `sendVerificationEmail(deps, email)` in apps/api/src/auth/verification.ts so both routes and the tests share one implementation with an injectable fetch.
  - Web banner: apps/web/src/app/cafes/layout.tsx already has the user in hand. getLayoutUser (from `auth-session-resilience`) exposes the cookie JWT's `email_verified` / `email_confirmed_at` claim; when it is falsy, render <UnverifiedEmailBanner email={...} /> — a slim amber strip under the header with the address and a 'Resend' button posting to /auth/resend-verification, with a per-browser localStorage dismissal that re-shows after 24h. Non-blocking: it must never gate the POS.

Sequencing note: this depends on `auth-session-resilience` for getLayoutUser, and on `env-config-preflight` for SUPABASE_PUBLISHABLE_KEY being in the env schema.

### API

POST /auth/signup — request body unchanged { email, password, fullName? }. Response 201 body CHANGES from { user: { id, email } } to { user: { id, email, emailVerified: boolean }, verificationEmailSent: boolean }. Additive-only for existing consumers (the signup form reads neither today), but it is a contract change. 409 EMAIL_ALREADY_REGISTERED and 400/502 SIGNUP_FAILED are unchanged.
POST /auth/resend-verification (new) — preHandler app.authenticate, config { rateLimit: { max: 3, timeWindow: '15 minutes' } }. No request body. 202 { sent: boolean }; 401 UNAUTHORIZED via the standard auth plugin envelope; 429 from the rate limiter. Never 4xx on a send failure — `sent: false` is the signal, because a hard error here trains owners to ignore the banner.

### Web

apps/web/src/app/(auth)/signup/page.tsx (surface verificationEmailSent === false). apps/web/src/components/unverified-email-banner.tsx (new client component). apps/web/src/app/cafes/layout.tsx (render the banner). apps/web/src/lib/api.ts (add resendVerification()).

### Tests

apps/api/src/auth/verification.test.ts: 'posts to the confirmed send endpoint with the publishable key'; 'resolves { sent: false } when the provider returns 500'; 'resolves { sent: false } when the fetch aborts on the 4s deadline'; 'never throws'. apps/api/src/routes/auth.test.ts: 'creates the Supabase user with email_confirm false'; 'returns 201 with emailVerified false and verificationEmailSent true on the happy path'; 'still returns 201 with verificationEmailSent false when the verification send fails'; 'returns 409 EMAIL_ALREADY_REGISTERED unchanged'; 'POST /auth/resend-verification returns 401 without a bearer token'; 'POST /auth/resend-verification returns 202 { sent: true } and calls the send helper with the token subject email'; 'POST /auth/resend-verification returns 429 on the 4th call inside the window'.

### Files

- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/auth.test.ts`
- `apps/api/src/auth/verification.ts`
- `apps/api/src/auth/verification.test.ts`
- `apps/api/src/config/env.ts`
- `apps/web/src/components/unverified-email-banner.tsx`
- `apps/web/src/app/cafes/layout.tsx`
- `apps/web/src/app/(auth)/signup/page.tsx`
- `apps/web/src/lib/api.ts`

---

<a id="first-run-checklist"></a>

## 🟡 `first-run-checklist` — First-run setup checklist on the dashboard, and stop the empty menu dead-ending

### Approach

Verified: apps/web/src/app/cafes/[id]/page.tsx:189-192 renders 'No orders yet — start with "New order" above'; following it reaches order-builder.tsx:552-556 (auditor said :538-542 — off by ~14 lines, the card is at 549-556) which reads 'No available items. Add items in the menu editor first.' with no link. Nothing mentions tables/QR.

The dashboard already makes three RSC round-trips (cafe, orders, stats). Do NOT add three more — that violates the perf constraint. Instead add ONE endpoint backed by ONE query.

New repo method on CafesRepository: `setupStatus(cafeId: string): Promise<CafeSetupStatus>`, implemented as a single Drizzle `db.select({...})` over four correlated EXISTS subqueries against menu_items, restaurant_tables, staff and orders — all four already have a cafe_id index (menu_items_cafe_id_idx, and the tables/staff/orders equivalents). One round-trip, sub-millisecond.

New route GET /cafes/:id/setup-status in apps/api/src/routes/cafes.ts, guarded by findByIdAndOwner (404 for another owner). Added to the dashboard's existing Promise.all so it costs no extra wall-clock.

Web: new server component apps/web/src/app/cafes/[id]/_components/setup-checklist.tsx, rendered directly under the header and ONLY while `!setup.complete`. Four rows, each with a done/todo state, a one-line why, and a link: (1) Add your menu -> /cafes/[id]/menu ('Nothing can be ordered until at least one item exists'); (2) Create tables & print QR codes -> /cafes/[id]/tables ('Guests scan these to order from their phone'); (3) Add staff -> /cafes/[id]/staff, marked Optional ('Skip if you are running the counter yourself'); (4) Take your first order -> /cafes/[id]/orders/new, disabled with an explanatory tooltip until hasMenuItems is true. The primary CTA is the first incomplete step. Replace the bare 'No orders yet' string at :189-192 with 'No orders yet — finish the setup steps above, then take your first order.' when !setup.complete, keeping the current copy once it is.

Order builder: turn the empty-menu Card at order-builder.tsx:549-556 into an actionable dead-end-breaker — keep the copy, add a primary <Link href={`/cafes/${cafeId}/menu`}> 'Open the menu editor' button and a secondary 'Import a menu from CSV' link (the API already has the import route). Same treatment on the QR-menu-empty path so a diner scanning a QR at a cafe with no menu is not left staring at a blank list.

`complete` = hasMenuItems && hasTables && hasOrders. Staff is deliberately excluded — a solo owner would never clear the checklist otherwise, and a checklist that can never be completed is worse than none.

### Schema

none — read-only EXISTS queries against existing tables and indexes.

### API

GET /cafes/:id/setup-status — preHandler app.authenticate. 200 { setup: { hasMenuItems: boolean, hasTables: boolean, hasStaff: boolean, hasOrders: boolean, complete: boolean } }. 404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } } when findByIdAndOwner misses (another owner's cafe included — never 403). New shared type CafeSetupStatus + CafeSetupStatusResponse in packages/types/src/api.ts.

### Web

apps/web/src/app/cafes/[id]/page.tsx (fetch setup-status in the existing Promise.all; render <SetupChecklist> under the header; conditional empty-state copy). apps/web/src/app/cafes/[id]/_components/setup-checklist.tsx (new). apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx (empty-menu card at :549-556 gains 'Open the menu editor' + 'Import from CSV' links). apps/web/src/app/m/[slug]/diner-order.tsx (empty-menu state copy).

### Tests

apps/api/src/routes/cafes.test.ts: 'GET /cafes/:id/setup-status returns all false and complete false for a brand-new cafe'; 'returns complete true when menu, tables and orders all exist'; 'returns complete true with hasStaff false (staff is optional)'; 'returns 404 for another owner cafe'; 'returns 401 without a bearer token'. apps/web/src/app/cafes/[id]/_components/setup-checklist.test.tsx: 'renders four steps with the first incomplete one as the primary CTA'; 'marks the menu step done and the tables step as the CTA when only tables are missing'; 'disables the first-order step while hasMenuItems is false'; 'renders nothing when complete is true'; 'labels the staff step Optional'.

### Files

- `apps/api/src/repositories/cafes.ts`
- `apps/api/src/routes/cafes.ts`
- `apps/api/src/routes/cafes.test.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/page.tsx`
- `apps/web/src/app/cafes/[id]/_components/setup-checklist.tsx`
- `apps/web/src/app/cafes/[id]/_components/setup-checklist.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/m/[slug]/diner-order.tsx`

---

<a id="customer-gstin-capture"></a>

## 🟠 `customer-gstin-capture` — Add the customer GSTIN input the cashier is missing (gaps 8 and 12 are one gap)

### Approach

Gaps 8 and 12 are the same defect described twice — the DB column (packages/db/src/schema/orders.ts:56 customerGstin), migration 0012, the Zod validator (apps/api/src/routes/orders.ts:41-46, already the correct checksum-capable pattern), the shared type (packages/types/src/api.ts:191) and the printed line (print-views.tsx:268-273) all exist; only the input is missing. One fix, one work item.

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:
  - Add `const [customerGstin, setCustomerGstin] = useState('')` next to customerName/customerPhone (the state block is at :151-153; the auditor's :160-162 is off by ~8 lines).
  - Add the input to the collapsed details block at :1078-1118 (auditor said :1065-1108 — off by ~13 lines), directly below Phone: `<Field label="Customer GSTIN" hint="For a company bill (input tax credit)">` with maxLength 15, `style={{ textTransform: 'uppercase' }}`, autoCapitalize="characters", autoCorrect="off", spellCheck={false}, and onChange upper-casing the value.
  - Validate client-side in handleSubmit (at :335-345) with the SAME isValidGstin from packages/types/src/tax-id.ts introduced in `tax-id-validation` — one implementation, two callers, no drift between what the cashier sees and what the API accepts. On failure set the existing `error` state to 'Enter a valid 15-character GSTIN, or leave it blank.' and return before submitting.
  - Include it in the CreateOrderRequest body at :349-355: `...(customerGstin.trim() ? { customerGstin: customerGstin.trim().toUpperCase() } : {})`.
  - Auto-open the details disclosure (setShowDetails(true)) when a GSTIN is present so the value is never hidden behind a collapsed section on re-render.

API: tighten apps/api/src/routes/orders.ts:41-46 to add the state-code and checksum refinement on top of the existing regex, reusing isValidGstin, so the two sides agree exactly.

Offline queue interaction: the GSTIN travels inside CreateOrderRequest, which offline-queue.ts persists verbatim — no change needed there, but add a replay test proving the field survives a queue round-trip.

### Schema

none — orders.customer_gstin (text, nullable) already exists from migration 0012.

### API

POST /cafes/:cafeId/orders — no shape change; the existing optional `customerGstin` field gains state-code + mod-36-checksum validation on top of the current pattern. A structurally-valid-but-checksum-failing GSTIN now returns 400 VALIDATION_ERROR where it previously passed. Response unchanged (OrderResponse already carries order.customerGstin).

### Web

apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx only — new state at :151-153, new Field in the details block at :1078-1118, validation in handleSubmit, payload field at :349-355. No new page, no new component.

### Tests

apps/api/src/routes/orders.test.ts: 'POST /cafes/:cafeId/orders persists a valid customerGstin uppercased'; 'rejects a checksum-failing customerGstin with 400'; 'accepts a body with no customerGstin and stores null'. apps/web/src/app/cafes/[id]/orders/new/order-builder.test.tsx (new file — this component has no test today): 'includes customerGstin in the POST body when the field is filled'; 'omits customerGstin from the body when the field is blank'; 'uppercases a lowercase GSTIN before sending'; 'blocks submit and shows the inline error for a checksum-failing GSTIN'; 'keeps the details disclosure open when a GSTIN is present'. apps/web/src/lib/offline-queue.test.ts: 'a queued order round-trips customerGstin through localStorage unchanged'.

### Files

- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.test.tsx`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/web/src/lib/offline-queue.test.ts`

---

<a id="one-thermal-bill"></a>

## 🔴 `one-thermal-bill` — Kill the forked dine-in bill: one <ThermalBill> renderer, and session totals that carry adjustments

### Approach

Verified in full. apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:87 hardcodes 'TAX INVOICE' (a composition cafe — the majority of small Indian cafes — hands that out on every table, all day, with no composition declaration); :144-150 renders only Subtotal, CGST, SGST then a Total at :152-155, so the moment discount / service charge / packaging / round-off is used the printed slip visibly does not add up; there is no HSN column, no amount-in-words, no customer GSTIN, no DUPLICATE stamp. The correct logic is one directory away and was never wired. The root cause is the fork itself, so the fix is to delete the fork, not to patch it.

API first. apps/api/src/repositories/table-sessions.ts:96-109 `totals()` sums only subtotal/tax/total. Widen it to sum discountPaise, serviceChargePaise, packagingChargePaise and roundOffPaise as well — all six are plain integer-paise sums over the session's non-cancelled orders. MONEY RULE, and this is why no apportionment is needed: computeBillAdjustments (apps/api/src/orders/build.ts:60-105) guarantees per order that `subtotal - discount + service + packaging + tax + roundOff === total`. Summation preserves the identity exactly, so the session bill needs no remainder handling and must NEVER recompute tax from a rate — it sums stored integers only. Add an invariant assertion in the test suite. Apply the identical widening to the history rollup at :291-320 so TableHistorySession stops under-reporting a discounted tab; that is the same bug in a second place. Add `discountReason: string | null` to TableSessionDetail with a deterministic rule: exactly one distinct non-null reason across the session's orders -> that reason; zero or more than one -> null (rendered as a plain 'Discount' row). Also add `customerGstin: string | null` (first non-null across the session's orders) so a corporate table tab prints it.

Migration 0013 (additive): `ALTER TABLE table_sessions ADD COLUMN bill_print_count integer DEFAULT 0 NOT NULL;` — mirrors orders.bill_print_count from 0012, so the consolidated bill can carry the DUPLICATE stamp. New route POST /cafes/:cafeId/table-sessions/:sessionId/bill-printed mirroring apps/api/src/routes/orders.ts:310-352 exactly, including the audit entry on reprints under a new action key 'table_session.bill_reprinted'.

Web. New shared presentational component apps/web/src/components/bill/thermal-bill.tsx with NO 'use client' directive, so it renders as a server component inside the session print RSC and as a client component inside print-views.tsx. Props (normalised, so neither caller leaks its own shape into the renderer):
  { cafe: { name, addressLine1, addressLine2, city, state, pincode, gstin, fssai, gstMode },
    header: { billNumber, dateIso, tableLabel?, customerName?, customerPhone?, customerGstin?, extraRows?: Array<{label,value}> },
    lines: Array<{ key, name, hsn: string|null, quantity, unitPricePaise, lineTotalPaise }>,
    totals: { subtotalPaise, discountPaise, discountReason: string|null, serviceChargePaise, packagingChargePaise, taxPaise, gstRateBp, roundOffPaise, totalPaise },
    payments?: Array<{ key, label, amountPaise, isRefund }>,
    isDuplicate: boolean, footerNote?: string|null }
It owns every rule that today lives only in print-views.tsx: billDocumentTitle(cafe.gstMode) for the header, compositionDeclaration(cafe.gstMode) in the footer, amountInWords(totals.totalPaise) under the total, the HSN column shown only when some line has one, CGST = Math.floor(taxPaise / 2) and SGST = taxPaise - CGST (exact, sums to taxPaise by construction), and the full adjustment row set.
Then: (a) print-views.tsx's `Bill` (:191-350) becomes a ~30-line adapter mapping OrderWithItems -> ThermalBillProps; (b) the session print page becomes an adapter mapping TableSessionDetail -> ThermalBillProps and its ~60 lines of duplicated Divider/Row/formatRupees/formatPct/mergeItems helpers are deleted; mergeItems moves into the adapter and its key becomes `${itemNameSnapshot}|${unitPricePaise}|${hsnSnapshot ?? ''}` so two items sharing a name but not an HSN never merge into one wrong line.

The test that matters most is the one asserting the two adapters produce the same rendered document for equivalent input — that is what stops the fork reappearing.

### Schema

Migration 0013 (drizzle-kit generate, additive, backward-compatible): ALTER TABLE "table_sessions" ADD COLUMN "bill_print_count" integer DEFAULT 0 NOT NULL; Schema change in packages/db/src/schema/tables.ts tableSessions: `billPrintCount: integer().notNull().default(0)`. No backfill needed — the default covers every existing row and 0 correctly means 'never printed'. No other column changes; every new money field on TableSessionDetail is a computed sum, not storage.

### API

GET /cafes/:cafeId/table-sessions/:sessionId — response `session` object (TableSessionDetail) gains, additively: discountPaise: number, discountReason: string|null, serviceChargePaise: number, packagingChargePaise: number, roundOffPaise: number, customerGstin: string|null, and session.billPrintCount: number. Existing subtotalPaise/taxPaise/totalPaise are unchanged in meaning. Additive only — no existing consumer breaks.
GET /cafes/:cafeId/table-sessions/history — each TableHistorySession gains discountPaise, serviceChargePaise, packagingChargePaise, roundOffPaise (additive).
POST /cafes/:cafeId/table-sessions/:sessionId/bill-printed (new) — preHandler app.authenticate; no request body. 200 { printCount: number, isDuplicate: boolean }. 404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } } when findByIdAndOwner misses; 404 with 'Table session not found' when the session is not in that cafe. Writes an audit entry with action 'table_session.bill_reprinted' only when printCount > 1, matching the order-level rule.

### Web

apps/web/src/components/bill/thermal-bill.tsx (new, the single renderer — no 'use client'). apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx (Bill at :191-350 collapses to an adapter; local Divider/Row/BillItemRow/formatRupees/formatPct move into thermal-bill.tsx). apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx (becomes an adapter; :87 hardcoded title and :144-155 partial totals deleted along with all local helpers). apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx (marks the session bill printed with the deadline helper from `print-deadline` before printing, seeded from session.billPrintCount). apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx (show the adjustment lines in the on-screen running tab so the sheet and the paper agree).

### Tests

apps/api/src/repositories/table-sessions.test.ts (or the route test's mock repo): 'session totals sum discount, service charge, packaging and round-off across three rounds'; 'INVARIANT: subtotal - discount + service + packaging + tax + roundOff === total for a mixed-adjustment session'; 'a negative round-off on one order and a positive on another still sums exactly'; 'cancelled orders contribute nothing to any of the six sums'; 'discountReason is the single distinct reason when only one order is discounted'; 'discountReason is null when two orders carry different reasons'; 'customerGstin is the first non-null across the session orders'. apps/api/src/routes/table-sessions.test.ts: 'GET detail returns the six money fields'; 'POST bill-printed returns printCount 1 isDuplicate false on first call'; 'second call returns printCount 2 isDuplicate true'; 'second call writes an audit entry with action table_session.bill_reprinted'; 'first call writes no audit entry'; 'returns 404 for another owner cafe'.
apps/web/src/components/bill/thermal-bill.test.tsx: 'renders BILL OF SUPPLY and the composition declaration for gstMode composition'; 'renders BILL OF SUPPLY with no declaration for gstMode exempt'; 'renders TAX INVOICE for regular_5'; 'renders the discount, service charge, packaging and round-off rows when non-zero'; 'omits each adjustment row when zero'; 'displayed rows arithmetically reconcile to the printed Total'; 'splits tax so CGST + SGST === taxPaise for an odd taxPaise (e.g. 2501 -> 1250 + 1251)'; 'renders the amount in words under the total'; 'renders the DUPLICATE stamp when isDuplicate'; 'shows the HSN column only when at least one line has an HSN'; 'renders the Customer GSTIN row when supplied'.
apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/adapter.test.ts: 'merges identical name+price+HSN lines across rounds and sums their quantities'; 'does NOT merge two lines sharing a name and price but differing in HSN'; 'maps every session money field onto ThermalBillProps.totals'. apps/web/src/app/cafes/[id]/orders/[orderId]/bill-adapter.test.ts: 'an order and an equivalent single-round session produce identical ThermalBillProps.totals' — the anti-fork regression test.

### Files

- `packages/db/src/schema/tables.ts`
- `packages/db/drizzle/migrations/0013_*.sql`
- `packages/types/src/domain.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/table-sessions.test.ts`
- `apps/web/src/components/bill/thermal-bill.tsx`
- `apps/web/src/components/bill/thermal-bill.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx`
- `apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx`

---

<a id="diner-receipt"></a>

## 🟠 `diner-receipt` — Give the QR diner a real bill on their phone after paying

### Approach

Verified: apps/api/src/routes/public.ts:181-190 builds PublicOrderDetail with only { id, orderNumber, status, paymentStatus, totalPaise, tableLabel, items: [{name, quantity}], createdAt } — no money breakdown, no cafe tax identity. apps/web/src/app/m/[slug]/diner-order.tsx:924-931 shows a single 'Total' tile. A prepaid diner walks out with no bill at all.

Widen the public contract rather than adding a fetch. The diner page already holds `cafe: PublicCafe` as a prop from the RSC (m/[slug]/page.tsx:50), so extending PublicCafe costs zero extra requests:
  - PublicCafe (packages/types/src/api.ts:253-267) gains gstMode: GstMode, gstin: string|null, fssai: string|null, addressLine1: string, addressLine2: string|null, state: string, pincode: string. `city` is already there. No privacy concern — every one of these is printed on the paper bill handed to any walk-in.
  - PublicOrder (:274-282) gains `bill: PublicOrderBill` = { subtotalPaise, discountPaise, discountReason: string|null, serviceChargePaise, packagingChargePaise, taxPaise, gstRateBp, roundOffPaise, totalPaise, lines: Array<{ name, quantity, unitPricePaise, lineTotalPaise, hsn: string|null }> }. Putting it on PublicOrder (not only PublicOrderDetail) means the create response, the payment-verify response and the detail GET all carry it, so the confirmation screen can render the bill immediately with no second round-trip on any of the three paths. `totalPaise` stays duplicated at the top level for backward compatibility.
  - Populate it in three places: apps/api/src/routes/public.ts:88-100 (the cafe object), :152-161 (create response) and :181-191 (detail response), plus apps/api/src/routes/payments.ts toPublicOrder so the post-payment screen gets it too.

MONEY: the API returns stored integer paise verbatim. The client recomputes NOTHING except the CGST/SGST halving, done exactly as elsewhere — CGST = Math.floor(taxPaise/2), SGST = taxPaise - CGST, which sums to taxPaise for odd values. No apportionment, no floats, no rate multiplication on the client.

Web: render <ThermalBill> from `one-thermal-bill` on the confirmation screen, inside a collapsed <details> headed 'View bill / GST invoice' so the fast happy path is unchanged, expanded by default when kind === 'paid'. Reuse the same component — the diner's receipt and the counter's paper must be the same document, or the audit-trail positioning is theatre. Wrap it in a `max-w-sm` container with the 80mm width relaxed for phone screens (add an optional `variant: 'thermal' | 'screen'` prop to ThermalBill controlling only width and font size, never content). Add a 'Print / Save as PDF' button calling window.print() with the same @page rules. isDuplicate is always false for the diner copy (a self-served receipt is not a counter reprint and must not be stamped).

### API

GET /public/cafes/:slug — `cafe` object gains gstMode, gstin, fssai, addressLine1, addressLine2, state, pincode (additive). Unchanged: name, slug, logoUrl, primaryColor, city, onlinePaymentEnabled, prepaidRequired, gstRateBp.
POST /public/cafes/:slug/orders — 201 `order` gains `bill: PublicOrderBill` (additive).
GET /public/cafes/:slug/orders/:orderId — 200 `order` gains `bill: PublicOrderBill` (additive); existing fields unchanged.
POST /public/cafes/:slug/orders/:orderId/payment/verify — 200 `order` gains `bill` (additive).
All four are additive; no status codes or error envelopes change. New type PublicOrderBill in packages/types/src/api.ts.

### Web

apps/web/src/app/m/[slug]/diner-order.tsx (Confirmation component at :856-960: add the collapsible bill section under the total tile; add the print button). apps/web/src/components/bill/thermal-bill.tsx (add the `variant` prop). apps/web/src/app/m/[slug]/page.tsx (no change — the widened PublicCafe flows through the existing prop).

### Tests

apps/api/src/routes/public.test.ts: 'GET /public/cafes/:slug returns gstin, gstMode and the full address'; 'GET /public/cafes/:slug returns gstin null for a cafe without one'; 'POST orders returns a bill whose lines sum to subtotalPaise'; 'POST orders returns a bill where subtotal - discount + service + packaging + tax + roundOff === totalPaise'; 'GET order detail returns the same bill after the order is placed'; 'the bill never exposes customerName or customerPhone'. apps/api/src/routes/payments.test.ts: 'verify response order carries the bill breakdown'. apps/web/src/app/m/[slug]/diner-bill.test.tsx: 'renders BILL OF SUPPLY with the composition declaration for a composition cafe'; 'renders the cafe GSTIN on a regular_5 bill'; 'CGST + SGST equals taxPaise for an odd tax amount'; 'the rendered rows reconcile to the displayed total'; 'expanded by default on the paid confirmation, collapsed on the counter confirmation'; 'never renders the DUPLICATE stamp'.

### Files

- `packages/types/src/api.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/routes/payments.test.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/app/m/[slug]/diner-bill.test.tsx`
- `apps/web/src/components/bill/thermal-bill.tsx`

---

<a id="print-deadline"></a>

## 🟠 `print-deadline` — Never let a bookkeeping call stall the printer

### Approach

Verified: apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:58-72 — `print()` awaits markBillPrinted() with no timeout and no AbortSignal before setting the mode and calling window.print() at :71. The fetch at :39-46 passes no signal. The comment at :65-66 says 'Never block the cashier on a bookkeeping call' but only the *failure* is non-blocking; the *wait* is unbounded. On a flaky dinner-rush connection the cashier clicks Print bill and gets nothing until the browser's default fetch timeout, with a queue at the counter.

Extract the whole thing into a testable module apps/web/src/lib/bill-print.ts:
  - `const PRINT_MARK_DEADLINE_MS = 700` — long enough to win on a healthy LAN, short enough that the cashier reads it as instant.
  - `markBillPrinted(url, token, signal): Promise<{ printCount: number; isDuplicate: boolean }>` — the existing fetch plus a `signal` argument.
  - `markBillPrintedWithDeadline(args, deadlineMs): Promise<{ printCount: number; isDuplicate: boolean } | null>` — creates an AbortController, races the fetch against a timer, aborts the fetch when the timer wins, and resolves null on timeout, abort, network failure or a non-ok status. Never rejects.
  - `resolveDuplicateFlag(seeded: boolean, server: { isDuplicate: boolean } | null): boolean` — `server ? server.isDuplicate : seeded`. Pure, trivially testable, and the reason the stamp degrades gracefully instead of vanishing.

Rewrite print(next) as: set mode synchronously first (so React starts painting immediately and the click's user-activation is not spent on an await), then `const res = await markBillPrintedWithDeadline(...)`, `setIsDuplicate(resolveDuplicateFlag(order.billPrintCount > 0, res))`, then window.print() on the next paint. `isDuplicate` is already seeded from order.billPrintCount at :56, so the only case the deadline can get wrong is a second terminal printing the same bill between this page's load and this click — worse than today by nothing, since today that case simply hangs. Document that trade in the file header, replacing the comment at :65-66 that currently overstates what the code does.

Apply the same helper to the autoprint effect at :78-108 and to the session-bill AutoPrint from `one-thermal-bill` — three call sites, one implementation.

### API

none — POST /cafes/:cafeId/orders/:orderId/bill-printed and POST /cafes/:cafeId/table-sessions/:sessionId/bill-printed are unchanged. The client simply stops waiting past 700ms; the server-side count still increments if the request lands after the abort is issued, which is correct (the copy WAS printed).

### Web

apps/web/src/lib/bill-print.ts (new). apps/web/src/lib/bill-print.test.ts (new). apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx (:30-49 markBillPrinted deleted in favour of the lib; :58-72 print() rewritten; :78-108 autoprint effect switched to the helper). apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx (uses the same helper).

### Tests

apps/web/src/lib/bill-print.test.ts (vi.useFakeTimers): 'resolves the server result when the fetch settles in 100ms'; 'resolves null at exactly the 700ms deadline when the fetch never settles'; 'aborts the underlying fetch when the deadline fires'; 'resolves null on a network rejection without throwing'; 'resolves null on a 500 response'; 'resolves null on a 401 response'; 'resolveDuplicateFlag returns the server value when present'; 'resolveDuplicateFlag falls back to the seed when the server result is null'. apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.test.tsx: 'calls window.print within 700ms of the click when the mark request never resolves'; 'sets mode before awaiting the mark call'; 'stamps DUPLICATE from the seeded billPrintCount when the mark call times out'; 'stamps DUPLICATE from the server response when it arrives in time'.

### Files

- `apps/web/src/lib/bill-print.ts`
- `apps/web/src/lib/bill-print.test.ts`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.test.tsx`
- `apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx`

---

<a id="public-rate-limit-keying"></a>

## 🟠 `public-rate-limit-keying` — Stop every cafe's diners sharing one 100/min anonymous bucket

### Approach

Verified: apps/api/src/app.ts:45-54 registers @fastify/rate-limit globally with `max: (req) => req.headers.authorization ? 600 : 100` and `keyGenerator: (req) => req.headers.authorization ?? req.ip`. apps/web/src/app/m/[slug]/page.tsx:20-23 fetches GET /public/cafes/:slug from the RSC — server-side — so every menu load platform-wide arrives from one Next server IP and keys to one 100/min bucket. Past ~100 QR scans a minute across ALL cafes, diners get 429 and page.tsx:24 turns that into `return null` -> 'Menu not found' (:56-70), indistinguishable from a broken QR and invisible to the cafe. Separately, diners inside one cafe share a NAT IP for the browser-side POST /public/cafes/:slug/orders and /ai-waiter calls (verified: diner-order.tsx fetches API_URL directly at :178, :213, :309).

Four changes.

(1) apps/api/src/lib/rate-limit-key.ts (new, pure, testable): `publicSlugFrom(url: string): string | null` matching /^\/public\/cafes\/([^/?]+)/ and decoding the slug; `rateLimitKey(req, trustedIp: string | null): string` returning `public:${slug}:${trustedIp ?? req.ip}` for public URLs and `req.headers.authorization ?? req.ip` otherwise; `rateLimitMax(req): number` returning 600 for authenticated, PUBLIC_MAX (600) for /public/*, 100 otherwise.

(2) `trustedClientIp(req, secret)`: honours the `x-sangam-client-ip` header ONLY when `x-sangam-proxy-secret` equals env.INTERNAL_PROXY_SECRET (new optional env var; when unset, the header is always ignored). This is what gives the RSC caller a per-diner bucket instead of one server-wide one. Spoofing the header buys nothing but a different rate-limit bucket — no auth, no data — so the blast radius of a leaked secret is bounded; say so in the code comment.

(3) apps/web/src/app/m/[slug]/page.tsx: read `headers()` from next/headers, take the first entry of x-forwarded-for (falling back to x-real-ip), and send `x-sangam-client-ip` + `x-sangam-proxy-secret` (from a server-only env var INTERNAL_PROXY_SECRET, NOT NEXT_PUBLIC_) on the getCafe fetch. The route is already dynamic (`cache: 'no-store'` + searchParams) so headers() costs nothing.

(4) Fix the invisible failure: page.tsx:19-28 currently collapses every non-ok into null. Distinguish 404 (genuinely no such cafe -> 'Menu not found') from 429/5xx/network (-> a new <MenuTemporarilyUnavailable> with 'This menu is busy right now — pull down to refresh, or ask a staff member' and an auto-retry after 3s). A 429 rendered as 'Menu not found' is what makes this failure invisible to the cafe; a distinct message is half the fix.

Per-route override on POST /public/cafes/:slug/orders — `config: { rateLimit: { max: 120, timeWindow: '1 minute' } }` — so a busy cafe's NAT can place two orders a second while abuse is still bounded, and on /ai-waiter `{ max: 30, timeWindow: '1 minute' }` since each call costs an LLM request.

### API

No route shapes change. Rate-limit behaviour changes: /public/cafes/:slug* keys per (slug, client-ip) with a 600/min ceiling instead of one global anonymous 100/min bucket; POST /public/cafes/:slug/orders is capped at 120/min per key; POST /public/cafes/:slug/ai-waiter at 30/min per key. New optional env var INTERNAL_PROXY_SECRET on both apps/api and apps/web (added to both .env.example files by `env-config-preflight`). Trusted headers, honoured only with a matching secret: x-sangam-client-ip, x-sangam-proxy-secret.

### Web

apps/web/src/app/m/[slug]/page.tsx (forward the diner IP; distinguish 404 from 429/5xx; new MenuTemporarilyUnavailable state with auto-retry).

### Tests

apps/api/src/lib/rate-limit-key.test.ts: 'publicSlugFrom extracts the slug from /public/cafes/cozy-brew/orders'; 'publicSlugFrom returns null for /cafes/<uuid>/orders'; 'publicSlugFrom url-decodes a percent-encoded slug'; 'rateLimitKey buckets two different slugs from the same IP separately'; 'rateLimitKey buckets two different client IPs on the same slug separately'; 'rateLimitKey ignores x-sangam-client-ip when the proxy secret does not match'; 'rateLimitKey ignores x-sangam-client-ip when INTERNAL_PROXY_SECRET is unset'; 'rateLimitKey falls back to the authorization header for owner routes'; 'rateLimitMax returns 600 for public, 600 for authenticated, 100 otherwise'. apps/api/src/routes/public.test.ts: 'the 101st GET for cafe-a does not 429 requests for cafe-b'; 'POST orders 429s at 121 requests in the window'. apps/web/src/app/m/[slug]/page.test.tsx: 'renders Menu not found on a 404'; 'renders the temporarily-unavailable state on a 429'; 'renders the temporarily-unavailable state on a network throw'; 'sends x-sangam-client-ip taken from the first x-forwarded-for entry'.

### Files

- `apps/api/src/app.ts`
- `apps/api/src/lib/rate-limit-key.ts`
- `apps/api/src/lib/rate-limit-key.test.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/web/src/app/m/[slug]/page.tsx`
- `apps/web/src/app/m/[slug]/page.test.tsx`

---

<a id="menu-stale-write-409"></a>

## 🟡 `menu-stale-write-409` — Dirty-field patches plus an If-Match precondition on menu item edits

### Approach

Verified: apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:510-527 builds `patch` with all ten fields regardless of what changed, and apps/api/src/repositories/menu.ts:105-112 updates unconditionally. Two people with the menu open each hold their own page-load snapshot, so the second save silently reverts the first person's price change. The availability toggle at :273-282 sends only `{ isAvailable }` so it does not clobber, but it can still flip a stale row. packages/db/src/schema/menu.ts:61-64 already has `updatedAt` with `$onUpdate`, so no migration is needed.

API. PATCH /cafes/:cafeId/menu/items/:itemId accepts an optional `If-Match` header carrying the item's `updatedAt` value in double quotes. Absent header -> current unconditional behaviour (backward compatible; the CSV import and any script keep working). Present -> the repo adds `eq(schema.menuItems.updatedAt, expected)` to the WHERE clause. `updateItem` returning null then means either 'not found' or 'stale', which the route disambiguates with a new repo method `getItem(itemId, cafeId): Promise<MenuItem | null>` (does not exist today — add it to MenuRepository and the mock in menu.test.ts): item exists -> 409, item absent -> 404. The 409 body carries the current server item so the client can show what actually changed instead of just refusing.

TIMESTAMP PRECISION — the one real risk. updatedAt is timestamptz(6) read with mode:'string'. Rows written by `defaultNow()` carry microsecond precision; rows written by `$onUpdate` carry millisecond ISO. Equality holds ONLY because the client echoes back the exact string the API served, which is the exact string postgres-js returned. Do not normalise, reformat, re-parse through Date, or trim the value anywhere in the round trip — the response serialiser, the client state and the header must all carry it byte-identical. There is an explicit test for this. If a future change breaks that guarantee, switch to an integer `version` column (migration + backfill `version = 1`) rather than papering over it.

Web. EditItemForm keeps the original item in a ref, computes `dirtyFields(original, current)` — a small pure helper in apps/web/src/lib/dirty-fields.ts returning only the changed keys, with null/'' normalisation matching what the form does today — and PATCHes just those with `If-Match: "<item.updatedAt>"`. If nothing is dirty, close the form without a request. On 409 render an inline amber panel: 'Someone else changed this item while you were editing' listing each conflicting field as `yours -> theirs`, with 'Use theirs' (adopt the server item, close) and 'Keep mine' (re-send the dirty fields with the server's fresh updatedAt). Availability toggle at :273-282 also sends If-Match and on 409 reverts the optimistic flip and toasts 'Availability changed elsewhere — refreshed'. Every successful response must write the returned item's new updatedAt into local state or the next edit is instantly stale.

### Schema

none — packages/db/src/schema/menu.ts:61-64 menu_items.updatedAt already exists with $onUpdate. No migration, no backfill. (Contingency only, if the precision test fails: add `version integer NOT NULL DEFAULT 1` to menu_items with a backfill of 1 for every row.)

### API

PATCH /cafes/:cafeId/menu/items/:itemId — new OPTIONAL request header `If-Match: "<item.updatedAt>"` (the ISO/timestamptz string exactly as served, wrapped in double quotes). Request body unchanged in shape but callers should now send only changed fields. Responses: 200 { item: MenuItem } on success (the item carries a fresh updatedAt); 404 { error: { code: 'NOT_FOUND', message: 'Menu item not found' } } when the item does not exist in this cafe; NEW 409 { error: { code: 'STALE_WRITE', message: 'This item was changed by someone else' }, item: MenuItem } when If-Match was supplied and did not match — the current server item ships in the body so the client can diff without a second request; 400 INVALID_CATEGORY unchanged; 404 'Cafe not found' unchanged. Repo interface change: `updateItem(itemId, cafeId, patch, opts?: { expectedUpdatedAt?: string })` and a new `getItem(itemId, cafeId)`.

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx (EditItemForm at :478-540 sends only dirty fields plus If-Match and renders the conflict panel; toggleAvailable at :268-285 sends If-Match and reverts on 409; both write the returned updatedAt back into local state). apps/web/src/lib/dirty-fields.ts + .test.ts (new).

### Tests

apps/web/src/lib/dirty-fields.test.ts: 'returns only the changed key when one field changed'; 'returns an empty object when nothing changed'; 'treats an empty description string and null as equal'; 'detects a price change from 15000 to 16000'; 'detects a boolean flip'. apps/api/src/routes/menu.test.ts: 'PATCH with a matching If-Match returns 200 and the updated item'; 'PATCH with a stale If-Match returns 409 STALE_WRITE and includes the current item in the body'; 'PATCH with a stale If-Match for a deleted item returns 404, not 409'; 'PATCH with no If-Match header still succeeds (backward compatible)'; 'PATCH with a malformed If-Match returns 400'; 'a 409 leaves the row untouched (updateItem is not called a second time)'. apps/api/src/repositories/menu.test.ts (integration, real DB): 'updateItem with expectedUpdatedAt equal to the stored value updates the row'; 'updateItem with a one-millisecond-off expectedUpdatedAt returns null'; 'PRECISION: a row created by defaultNow() round-trips its updatedAt string through the API and matches on If-Match'. apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx: 'sends only the changed price, not the whole item'; 'sends no request when the form is submitted unchanged'; 'renders the conflict panel with yours/theirs on a 409'; 'Use theirs adopts the server item and closes the form'; 'Keep mine re-sends with the server updatedAt'; 'the availability toggle reverts on a 409'.

### Files

- `apps/api/src/repositories/menu.ts`
- `apps/api/src/repositories/menu.test.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx`
- `apps/web/src/lib/dirty-fields.ts`
- `apps/web/src/lib/dirty-fields.test.ts`

---

<a id="audit-log-filters"></a>

## 🟡 `audit-log-filters` — Make the audit log filterable by something that exists, with dates and paging

### Approach

Verified all three sub-claims. apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx:55-66 fires a network request from applyFilter on every keystroke with no debounce. apps/api/src/repositories/audit-logs.ts:84 filters with `eq(schema.auditLogs.action, opts.action)`, so a partial string matches nothing. And the placeholder at :72 suggests 'order.void' — I grepped every recordAudit/auditRepo.record call site in apps/api/src: the ONLY two action keys this codebase ever writes are 'order.bill_reprinted' (orders.ts:341) and 'order.refund' (orders.ts:432). 'order.void' is never written, so the owner's first attempt is guaranteed to return 'No entries' and read as a broken page. The route already accepts from/to (audit-logs.ts:19-20) and echoes `limit` (:50), neither of which the UI uses.

Drop the free-text box entirely rather than debouncing it — a select of keys that actually exist cannot return an empty result by typo, which is the whole defect. Populate it from the data, not a hardcoded list, so it can never drift again:
  - New route GET /cafes/:cafeId/audit-logs/actions -> `select distinct action from audit_logs where cafe_id = $1 order by action`. Cheap; add index `audit_logs_cafe_action_idx` on (cafe_id, action) in migration 0013 alongside the table_sessions column — it also speeds the existing action filter.
  - New shared label map in packages/types/src/staff.ts: `AUDIT_ACTION_LABELS: Record<string, string>` = { 'order.bill_reprinted': 'Bill reprinted', 'order.refund': 'Refund issued', 'table_session.bill_reprinted': 'Table bill reprinted' }, with an `auditActionLabel(key)` that falls back to the raw key for anything unmapped — so a new action key added later shows up immediately without a UI change.
  - Paging: add a `before` keyset cursor to the list endpoint. The repo takes `before?: { createdAt: string; id: string }` and adds `sql\`(${auditLogs.createdAt}, ${auditLogs.id}) < (${before.createdAt}, ${before.id})\`` with ORDER BY created_at DESC, id DESC. Row-value comparison, not OFFSET, so it is stable under concurrent inserts and does not degrade at depth. Response gains `nextCursor: { createdAt, id } | null`, set when the page came back full.

Web: replace the Input at :70-77 with a three-control filter bar — a <select> of actions (labels from auditActionLabel, an 'All actions' default, hidden entirely when the actions list is empty), and two <input type="date"> bound to from/to. Dates are converted to ISO instants at the cafe's day boundary (from -> 00:00:00.000 local, to -> 23:59:59.999 local) before being sent, so 'today' means today's trading day and not a UTC window. A 'Load more' button under the list appends the next page using nextCursor and disappears when it is null. Every filter change resets the cursor. Keep useTransition for the pending dimming that already exists.

### Schema

Migration 0013 (same migration as `one-thermal-bill`, additive): CREATE INDEX "audit_logs_cafe_action_idx" ON "audit_logs" ("cafe_id", "action"); — declared in packages/db/src/schema/audit-logs.ts. No column changes, no backfill.

### API

GET /cafes/:cafeId/audit-logs — query params gain `beforeCreatedAt?: string (ISO datetime)` and `beforeId?: string (uuid)`, which must be supplied together (400 VALIDATION_ERROR otherwise). Existing `limit`, `action`, `from`, `to` unchanged. Response gains `nextCursor: { createdAt: string; id: string } | null` (additive); `logs` and `limit` unchanged. Ordering becomes createdAt DESC, id DESC (previously createdAt DESC only) — deterministic where it previously was not.
GET /cafes/:cafeId/audit-logs/actions (new) — preHandler app.authenticate. 200 { actions: string[] } (distinct action keys present for this cafe, ascending). 404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } } for another owner's cafe.

### Web

apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx (free-text Input at :70-77 replaced by an action <select> + two date inputs; per-keystroke applyFilter at :55-66 deleted; Load more button; nextCursor state). apps/web/src/app/cafes/[id]/audit/page.tsx (fetch the actions list alongside the first page in the existing Promise.all so the select is populated on first paint). packages/types/src/staff.ts (AUDIT_ACTION_LABELS, auditActionLabel, AuditLogActionsResponse, cursor fields on AuditLogListResponse).

### Tests

apps/api/src/routes/audit-logs.test.ts: 'GET actions returns the distinct action keys for the cafe'; 'GET actions returns an empty array for a cafe with no entries'; 'GET actions returns 404 for another owner cafe'; 'list returns nextCursor when the page is full'; 'list returns nextCursor null when the page is short'; 'list with beforeCreatedAt + beforeId returns only older rows'; 'list rejects beforeCreatedAt without beforeId with 400'; 'list with from and to bounds the window inclusively'; 'two rows with an identical createdAt are ordered by id desc and are not skipped or repeated across pages'. apps/web/src/app/cafes/[id]/audit/audit-log-view.test.tsx: 'renders one option per action returned by the actions endpoint'; 'hides the action select entirely when the actions list is empty'; 'labels order.bill_reprinted as Bill reprinted'; 'falls back to the raw key for an unmapped action'; 'issues exactly one request when the action select changes'; 'issues no request while typing in a date field until it is complete'; 'converts the from date to local midnight and the to date to 23:59:59.999 local'; 'appends rather than replaces rows on Load more'; 'hides Load more when nextCursor is null'; 'resets the cursor when the action filter changes'.

### Files

- `apps/api/src/repositories/audit-logs.ts`
- `apps/api/src/routes/audit-logs.ts`
- `apps/api/src/routes/audit-logs.test.ts`
- `packages/db/src/schema/audit-logs.ts`
- `packages/db/drizzle/migrations/0013_*.sql`
- `packages/types/src/staff.ts`
- `apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx`
- `apps/web/src/app/cafes/[id]/audit/audit-log-view.test.tsx`
- `apps/web/src/app/cafes/[id]/audit/page.tsx`

---

## Order of work

1. 1. env-config-preflight — first, and on its own branch. Every other item is easier to develop and review once a fresh checkout can actually boot signup and authenticate. It also adds SUPABASE_PUBLISHABLE_KEY / WEB_APP_URL / INTERNAL_PROXY_SECRET to the env schema, which email-verification and public-rate-limit-keying both need.
2. 2. auth-session-resilience — highest severity and fully independent. Ship it early so the offline queue is reachable while the rest of the programme is in flight. It introduces getLayoutUser, which email-verification depends on.
3. 3. tax-id-validation — introduces packages/types/src/tax-id.ts (isValidGstin). customer-gstin-capture reuses it, so land this first or the two implementations diverge. Run packages/db/scripts/audit-tax-ids.sql against production BEFORE merging and fix any offending rows with the owners, because the tightened FSSAI rule blocks edits on non-conforming cafes.
4. 4. one-thermal-bill — the blocker, and the longest pole. Start it in parallel with step 3 (no shared files). It owns migration 0013, so audit-log-filters must add its index to the SAME generated migration rather than creating a second one; coordinate or run drizzle-kit generate once at the end of both.
5. 5. customer-gstin-capture — after tax-id-validation (for isValidGstin) and ideally after one-thermal-bill lands the ThermalBill customer-GSTIN row, so the field has somewhere to print on the dine-in path as well as the counter path.
6. 6. print-deadline — small, and it produces apps/web/src/lib/bill-print.ts which one-thermal-bill's session AutoPrint consumes. If one-thermal-bill is still in review, land print-deadline first and have the session page import the finished helper.
7. 7. diner-receipt — strictly after one-thermal-bill: it renders the same <ThermalBill> and only adds the `variant` prop. Doing it before means writing a fourth bill renderer, which is the exact mistake being fixed.
8. 8. first-run-checklist — independent; can run in parallel with 4-7. Reviewers should check it does not add RSC round-trips beyond the single setup-status call.
9. 9. public-rate-limit-keying — independent, but sequence it after diner-receipt so the two changes to apps/web/src/app/m/[slug]/page.tsx (IP forwarding, 429-vs-404 handling) do not collide with the PublicCafe widening.
10. 10. email-verification — after auth-session-resilience (getLayoutUser) and env-config-preflight. Begin with the GoTrue send-endpoint spike; if the spike shows neither endpoint sends without extra SMTP configuration, stop and re-scope rather than shipping a banner that promises an email nobody receives.
11. 11. menu-stale-write-409 — independent; land it late because the 409 conflict UI needs unhurried manual two-browser testing that is hard to fake in vitest.
12. 12. audit-log-filters — last. Its index rides in migration 0013; if that migration has already shipped with one-thermal-bill, generate 0014 for the index alone.

## Risks

- Migration 0013 is claimed by two work items (table_sessions.bill_print_count from one-thermal-bill, audit_logs_cafe_action_idx from audit-log-filters). If both branches run drizzle-kit generate independently they will produce two files with the same 0013 prefix and a corrupted meta/_journal.json. Decide up front: one migration generated once, or 0013 and 0014 in a fixed order.
- The FSSAI tightening (7-14 chars -> exactly 14 digits) is a genuine breaking change for existing rows. A cafe holding a legacy short FSSAI cannot save ANY edit, because the edit form always sends the field. The audit query must be run and the affected owners contacted before deploy. Do not auto-null the bad values — a wrong FSSAI on file is a fact to correct, not to erase.
- Making gstMode required on POST /cafes breaks any caller that relied on the 'regular_5' default. Only the web form calls it today, so the real risk is a forgotten script or a partially-deployed web/API pair. Deploy the API change and the web change together.
- The email-verification approach depends on which GoTrue endpoint actually SENDS mail in this Supabase project's version — admin/generate_link generates but may not send, and /auth/v1/resend behaviour varies. The 0.5d spike is real work, not a formality, and the item may need re-scoping if neither path sends without additional SMTP setup. It also makes the project's 'Confirm email' toggle load-bearing: if someone turns it ON, every new owner is locked out at first sign-in.
- auth-session-resilience deliberately trusts an unverified JWT payload from a cookie for the web shell only. This is safe because apps/api verifies every token, but it means a server-side-revoked session keeps rendering the shell for up to 5 minutes. If anyone later moves an authorisation decision into the web layer, that assumption silently becomes a hole. The file header comment is the only thing preventing it.
- menu-stale-write-409 hinges on timestamptz(6) strings round-tripping byte-identically from Postgres through JSON to the If-Match header. Any incidental normalisation (a Date parse, a serialiser change, a trim) turns every conditional write into a spurious 409 and makes the menu editor unusable. The precision integration test is the guard; if it fails, switch to an integer version column and accept the migration.
- one-thermal-bill changes the printed output of the single-order bill as well as the session bill, via the shared component. A subtle regression there hits the counter's paper on every order, not just dine-in. Print physical test slips on the actual 80mm thermal printer for all four gstModes with and without adjustments before merging — unit tests cannot catch a layout that overflows 80mm.
- The trusted-header IP forwarding in public-rate-limit-keying is only as good as INTERNAL_PROXY_SECRET being set and kept server-only in Next. If it is accidentally prefixed NEXT_PUBLIC_ it ships to every browser and any diner can pick their own rate-limit bucket. Add a lint rule or a test asserting the variable name is never NEXT_PUBLIC_-prefixed.
- The session-bill money identity (subtotal - discount + service + packaging + tax + roundOff === total) holds because computeBillAdjustments guarantees it per order. Any future code path that writes order totals WITHOUT going through buildOrder — a manual correction, an import, an AI-console tool call — breaks the consolidated bill silently. The invariant test covers the sum, not the writes; consider a DB CHECK constraint as a follow-up.
- Nine of the thirteen items touch apps/web files that have no tests at all today (order-builder.tsx, menu-editor.tsx, diner-order.tsx, print-views.tsx, page.tsx under m/[slug]). The effort estimate includes standing up those first test files; if that is cut to save time, the plan's TDD requirement is not met and the bill-rendering changes ship unverified.
- diner-receipt widens PublicCafe with the cafe's address, GSTIN and FSSAI on an unauthenticated endpoint. That data is already on every printed bill so it is not a new disclosure, but it does make the whole platform's cafe registry cheaply scrapeable by slug enumeration. Worth a conscious decision rather than a silent one.
