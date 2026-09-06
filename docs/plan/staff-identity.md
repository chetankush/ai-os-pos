# Staff identity, roles & account recovery

**Estimated effort: 14 engineer-days · 5 work items**

Today the entire POS runs on one Supabase account: the owner's email+password is the only credential in the product, so a waiter, cashier or cook can only work by holding the owner's login — which also hands them refunds, reports, expenses and menu pricing — and every void, reprint and drawer session is stamped 'owner' in the audit log regardless of who did it. There is also no password reset, so one forgotten password stops billing for the day. This theme adds real staff identity: a device-pairing handover, a PIN sign-in that mints a short-lived scoped staff token, a role-capability matrix enforced server-side on every cafe route, correct actor attribution on the audit trail and cash drawer, and self-service password/email recovery for the owner account. The cafe outcome: the kitchen tablet holds no owner password, a waiter can 86 the paneer but not reprice it, a cashier can settle but not refund, and 'who refunded this' finally has an answer.

---

<a id="owner-account-recovery"></a>

## 🔴 `owner-account-recovery` — Password reset, password change, email change (owner account)

### Approach

Verified: apps/web/src/lib/supabase/middleware.ts:35-43 is the isPublic list, apps/web/src/app/(auth)/login/page.tsx:14 is the <LoginForm /> mount, and there is no forgot/reset route anywhere. Supabase does the crypto; this is web routing + config.

Flow (PKCE — the @supabase/ssr browser client defaults to flowType 'pkce', so the recovery email carries ?code=, NOT a #access_token fragment; building the fragment version is the classic wasted afternoon here):
1. /forgot-password (client form) calls supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` }). ALWAYS render the same neutral confirmation regardless of Supabase's answer — no user enumeration.
2. Supabase mails <SITE_URL>/auth/callback?code=...&next=/reset-password.
3. apps/web/src/app/auth/callback/route.ts (GET Route Handler): reads code + next, createSupabaseServerClient(), exchangeCodeForSession(code) (this sets the session cookies), redirect to safeNextPath(next). On error redirect to /login?error=link_expired.
4. /reset-password (client form, session now present) calls supabase.auth.updateUser({ password }), then router.replace('/cafes').
5. /account: change password re-authenticates first — signInWithPassword({ email: user.email, password: current }) then updateUser({ password: next }). Supabase's updateUser does NOT require the old password, so this re-auth step is the only thing stopping a walk-up attacker on an unlocked counter machine from taking the account.
6. /account: change email calls updateUser({ email }); Supabase mails a confirm link to the new address (and, with 'Secure email change' on, the old one too) which lands on /auth/callback?next=/account. Show a pending-confirmation state; do not optimistically update the displayed email.

Middleware: add '/forgot-password', '/reset-password' and path.startsWith('/auth/') to isPublic. CRITICAL: /reset-password must NOT join isAuthRoute — after exchangeCodeForSession the user IS authenticated, and isAuthRoute bounces authenticated users to /cafes, which turns every reset link into a no-op loop. isAuthRoute stays login|signup only.

Root-cause fix for the fat-fingered signup email: apps/api/src/routes/auth.ts sets email_confirm: true, so the address is never proved reachable and a typo is unrecoverable. Keep auto-confirm (onboarding friction is real) and instead add a 'Confirm email' second field to the signup form that must match, with paste disabled. That catches the typo at the source; the /account email-change path only helps someone who can still log in.

OPS PREREQUISITE, not code: Supabase Auth → URL Configuration must allow-list https://<domain>/auth/callback and http://localhost:3000/auth/callback, AND a real SMTP provider must be configured. Supabase's built-in sender is capped at a handful of messages per hour project-wide and silently drops the rest — with the default sender this feature looks fine in dev and fails in production. Treat 'SMTP configured + one end-to-end reset received in a real inbox' as the definition of done.

### API

none (no new API routes; POST /auth/signup unchanged)

### Web

NEW apps/web/src/app/(auth)/forgot-password/page.tsx; NEW apps/web/src/app/(auth)/forgot-password/forgot-password-form.tsx (client); NEW apps/web/src/app/(auth)/reset-password/page.tsx; NEW apps/web/src/app/(auth)/reset-password/reset-password-form.tsx (client); NEW apps/web/src/app/auth/callback/route.ts (GET); NEW apps/web/src/app/account/page.tsx (RSC, reads the Supabase user); NEW apps/web/src/app/account/account-form.tsx (client: change password + change email); NEW apps/web/src/lib/auth-redirect.ts (pure safeNextPath helper). MODIFY apps/web/src/app/(auth)/login/login-form.tsx — add a right-aligned 'Forgot password?' Link to /forgot-password in the Password Field label row. MODIFY apps/web/src/app/(auth)/signup/signup-form.tsx — add the confirm-email field. MODIFY apps/web/src/lib/supabase/middleware.ts — isPublic additions. MODIFY apps/web/src/app/cafes/[id]/components/cafe-shell.tsx — link the profile card area to /account. Reuse existing primitives: components/ui/input.tsx, password-input.tsx, label.tsx (Field), button.tsx.

### Tests

apps/web/src/lib/auth-redirect.test.ts: 'safeNextPath returns /cafes for null'; 'safeNextPath rejects an absolute URL (https://evil.example)'; 'safeNextPath rejects a protocol-relative path (//evil.example)'; 'safeNextPath rejects a path not starting with /'; 'safeNextPath passes through /reset-password'.
apps/web/src/app/(auth)/forgot-password/forgot-password-form.test.tsx: 'shows a validation error for an empty email without calling Supabase'; 'calls resetPasswordForEmail with redirectTo /auth/callback?next=/reset-password'; 'renders the same neutral confirmation when Supabase reports the user does not exist'; 'renders a form-level error when the network call throws'.
apps/web/src/app/(auth)/reset-password/reset-password-form.test.tsx: 'requires the two password fields to match'; 'rejects a password shorter than 8 characters before calling updateUser'; 'calls updateUser with the new password and redirects to /cafes'; 'shows link-expired guidance when updateUser returns AuthSessionMissingError'.
apps/web/src/app/account/account-form.test.tsx: 're-authenticates with the current password before calling updateUser'; 'does not call updateUser when the current password is wrong'; 'email change shows the pending-confirmation notice and leaves the displayed email unchanged'.
apps/web/src/app/(auth)/signup/signup-form.test.tsx: 'blocks submit when the email confirmation field does not match'.

### Files

- `apps/web/src/app/(auth)/forgot-password/page.tsx`
- `apps/web/src/app/(auth)/forgot-password/forgot-password-form.tsx`
- `apps/web/src/app/(auth)/reset-password/page.tsx`
- `apps/web/src/app/(auth)/reset-password/reset-password-form.tsx`
- `apps/web/src/app/auth/callback/route.ts`
- `apps/web/src/app/account/page.tsx`
- `apps/web/src/app/account/account-form.tsx`
- `apps/web/src/lib/auth-redirect.ts`
- `apps/web/src/lib/auth-redirect.test.ts`
- `apps/web/src/lib/supabase/middleware.ts`
- `apps/web/src/app/(auth)/login/login-form.tsx`
- `apps/web/src/app/(auth)/signup/signup-form.tsx`

---

<a id="staff-session-tokens"></a>

## 🔴 `staff-session-tokens` — Device pairing + staff PIN sign-in minting a scoped staff token

### Approach

Verified: apps/api/src/lib/pin.ts:20 verifyPin has zero call sites; staff.pinHash is written at apps/api/src/routes/staff.ts:74 and read by nothing; apps/api/src/plugins/auth.ts:78-127 only ever produces a Supabase user.

WHY DEVICE PAIRING IS NOT OPTIONAL: a bare POST /cafes/:cafeId/staff/login with a 4-digit PIN is a 10^4 search space against a cafeId that appears in every owner URL. Binding login to a provisioned device gives us (a) a safe place to serve the staff roster the lock screen needs, (b) a rate-limit and lockout scope, (c) 'lost tablet' revocation. The handover is also the natural UX: the owner signs in once on the tablet, taps 'Set up this device', and the owner session is then dropped.

TOKEN. New apps/api/src/lib/staff-token.ts using jose (already a dependency):
  const STAFF_KID = 'sangam-staff-v1';
  signStaffToken(secret, { staffId, cafeId, role, name, deviceId, ttlHours }): SignJWT with setProtectedHeader({ alg: 'HS256', kid: STAFF_KID }), setIssuer('sangam'), setAudience('sangam-staff'), claims { sub: staffId, cafe: cafeId, role, name, did: deviceId }.
  verifyStaffToken(secret, token): jwtVerify with { issuer: 'sangam', audience: 'sangam-staff', algorithms: ['HS256'] }.
Why a kid: apps/api/src/plugins/auth.ts already calls decodeProtectedHeader(token) and branches on alg, and legacy Supabase tokens are ALSO HS256, so alg cannot discriminate. kid is read before any verification, and a kid-marked token is only ever verified against STAFF_JWT_SECRET — forging the kid buys nothing.

ENV (apps/api/src/config/env.ts): STAFF_JWT_SECRET: z.string().min(32).optional() and STAFF_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(12). A separate secret is required, not optional cleverness: SUPABASE_JWT_SECRET is itself optional in production (this project verifies Supabase tokens via JWKS), so there is no shared secret to borrow. Follow the house pattern in apps/api/src/routes/index.ts — if STAFF_JWT_SECRET is absent, log a warn, skip registering the staff-session routes, and have the auth plugin 401 any kid-marked token.

AUTH PLUGIN (apps/api/src/plugins/auth.ts). Introduce the actor model:
  export type Actor =
    | { type: 'owner'; userId: string; email: string | null }
    | { type: 'staff'; staffId: string; cafeId: string; role: StaffRole; name: string; deviceId: string };
  declare module 'fastify' { interface FastifyRequest { actor: Actor } }
Inside authenticate, after extracting the bearer token: decodeProtectedHeader; if kid === STAFF_KID verify with the staff secret and set request.actor = {type:'staff',...} leaving request.user UNSET; otherwise run the existing Supabase paths unchanged and additionally set request.actor = {type:'owner', userId: payload.sub, email}. request.user keeps its exact current shape so nothing breaks today — but note that any handler still reading request.user.id directly will now throw on a staff token, which is precisely why work item role-authz-guard must convert every cafe route.

DEVICE AUTH is deliberately NOT a plugin decorator: plugins/auth.ts is repo-free by design. Implement it as a local preHandler inside the route files that already have the devices repo injected (house pattern). It reads the x-sangam-device header, sha256-hexes it, calls devicesRepo.findActiveByTokenHash, sets request.device = { id, cafeId }, else 401 DEVICE_UNAUTHORIZED.

TIMING ORACLE: on POST /staff/login, when the staffId is unknown or the member has no PIN, still run verifyPin against a fixed dummy scrypt hash. scrypt is deliberately slow; skipping it makes 'unknown staff id' measurably faster than 'wrong PIN' and leaks the roster.

REPOSITORIES. New apps/api/src/repositories/staff-devices.ts (StaffDevicesRepository: create, list, findActiveByTokenHash, revoke, touch). Extend apps/api/src/repositories/staff.ts with listForLogin(cafeId), findWithPinHash(id, cafeId), registerPinFailure(id, cafeId, lockUntil), registerPinSuccess(id, cafeId), and findSessionContext(staffId, cafeId, deviceId) — ONE joined SELECT over staff ⋈ cafes ⋈ staff_devices filtered on staff.is_active AND staff.cafe_id = $cafe AND staff_devices.id = $device AND staff_devices.cafe_id = $cafe AND staff_devices.revoked_at IS NULL, returning { staff, cafe }. Single round trip, so a staff-authenticated request costs the same as today's owner request and revocation (deactivate a member, revoke a device) takes effect on the very next request rather than waiting out the 12h TTL. Add findById(id) to CafesRepository in apps/api/src/repositories/cafes.ts for the non-owner path.

BREAKING (compile-time): apps/api/src/routes/staff.test.ts builds its mock with `satisfies StaffRepository`, so adding methods to the interface breaks that file until the new vi.fn() entries are added. Same for any mock using satisfies on CafesRepository.

### Schema

NEW FILE packages/db/src/schema/staff-devices.ts:
  staffDevices = pgTable('staff_devices', {
    id uuid PK default gen_random_uuid(),
    cafeId uuid NOT NULL,
    label text NOT NULL,
    tokenHash text NOT NULL,            -- sha256 hex of the opaque device token; the raw token is never stored
    provisionedByUserId text NOT NULL,  -- Supabase user id of the owner who paired it
    lastSeenAt timestamptz NULL,
    revokedAt timestamptz NULL,         -- soft revoke, so audit rows referencing the device keep meaning
    createdAt timestamptz NOT NULL DEFAULT now()
  }, indexes: uniqueIndex('staff_devices_token_hash_idx').on(tokenHash), index('staff_devices_cafe_idx').on(cafeId))

MODIFY packages/db/src/schema/staff.ts — add:
  failedPinAttempts integer NOT NULL DEFAULT 0
  lockedUntil timestamptz NULL
  lastLoginAt timestamptz NULL

Migration 0013 via `pnpm --filter @sangam/db db:generate`, then hand-add the FK the way every other migration in this repo does:
  ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_cafe_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE;
All additive, no backfill (existing staff rows take failed_pin_attempts = 0).

GOTCHA: packages/db/drizzle.config.ts uses an EXPLICIT schema file list, not a glob. Add './src/schema/staff-devices.ts' to it or drizzle-kit generates nothing and reports no diff. Also export it from packages/db/src/schema/index.ts.

### API

POST /cafes/:cafeId/devices — owner Supabase token. Req { "label": string(1..60) }. 201 { "device": { id, label, createdAt, lastSeenAt: null, revokedAt: null }, "deviceToken": "<43-char base64url>" } — the raw token is returned ONCE and never again. 404 NOT_FOUND (not the caller's cafe), 400 VALIDATION_ERROR. Writes audit device.provisioned.
GET /cafes/:cafeId/devices — owner. 200 { "devices": [{ id, label, createdAt, lastSeenAt, revokedAt }] }. tokenHash is never serialised.
DELETE /cafes/:cafeId/devices/:deviceId — owner. Sets revokedAt = now(). 204, or 404. Writes audit device.revoked.
GET /cafes/:cafeId/staff/roster — DEVICE auth only, no Bearer. Header x-sangam-device: <deviceToken>. 200 { "staff": [{ id, name, role }] } — active members that have a PIN set; names and roles only. 401 DEVICE_UNAUTHORIZED when the header is missing, unknown, revoked, or the device belongs to a different cafe than :cafeId. Route rate limit { max: 60, timeWindow: '1 minute' }.
POST /cafes/:cafeId/staff/login — DEVICE auth (the auditor's suggested path, kept). Header x-sangam-device. Req { "staffId": uuid, "pin": "^[0-9]{4,8}$" }. 200 { "token": "<jwt>", "expiresAt": iso, "staff": { id, name, role, cafeId } }. 401 INVALID_PIN — ONE code and ONE message ("Wrong PIN") for wrong PIN, unknown staffId, inactive member and no-PIN-set alike, so the endpoint never confirms which staff ids are real. 401 DEVICE_UNAUTHORIZED. 423 PIN_LOCKED { error: { code: 'PIN_LOCKED', message: 'Too many wrong PINs. Try again in N minutes.' } } after 5 consecutive failures; lockedUntil = now + 15 min, cleared on success or expiry; a correct PIN during the lock window still returns 423. Route rate limit override { max: 20, timeWindow: '5 minutes', keyGenerator: req => req.headers['x-sangam-device'] ?? req.ip } as a coarse second gate above the per-staff lockout. Writes audit staff.login / staff.login_failed.
GET /staff/me — staff token. 200 { "staff": { id, name, role, cafeId }, "cafe": { id, name, gstMode }, "expiresAt": iso }.
POST /staff/logout — staff token. 204. Client-side only; there is no server denylist, the 12h TTL bounds exposure. Documented, not hidden.

### Web

none in this item (the web half is staff-web-shell)

### Tests

apps/api/src/lib/pin.test.ts (NEW — verifyPin has no test file at all today): 'hashPin produces a scrypt$salt$key triple'; 'verifyPin accepts the correct PIN'; 'verifyPin rejects a wrong PIN'; 'verifyPin returns false for a malformed stored hash'; 'verifyPin returns false for an empty stored string'.
apps/api/src/lib/staff-token.test.ts (NEW): 'signStaffToken stamps kid=sangam-staff-v1 in the protected header'; 'verifyStaffToken round-trips sub, cafe, role, name and did'; 'verifyStaffToken rejects a token signed with a different secret'; 'verifyStaffToken rejects an expired token'; 'verifyStaffToken rejects a token whose aud is not sangam-staff'.
apps/api/src/plugins/auth.test.ts (EXTEND): 'accepts a staff token and populates request.actor with type staff'; 'leaves request.user undefined for a staff token'; 'rejects a kid=sangam-staff-v1 token signed with the Supabase secret'; 'populates request.actor type owner for a Supabase token'; 'returns 401 for a staff token when STAFF_JWT_SECRET is not configured'.
apps/api/src/config/env.test.ts (EXTEND): 'rejects a STAFF_JWT_SECRET shorter than 32 characters'; 'defaults STAFF_SESSION_TTL_HOURS to 12'.
apps/api/src/routes/staff-devices.test.ts (NEW): 'POST /devices returns the raw device token exactly once and stores only its hash'; 'POST /devices returns 404 for a cafe the caller does not own'; 'GET /devices never includes tokenHash in the response'; 'DELETE /devices/:id soft-revokes by setting revokedAt and returns 204'; 'DELETE /devices/:id returns 404 for another cafe device'; 'provisioning writes a device.provisioned audit entry'.
apps/api/src/routes/staff-login.test.ts (NEW): 'GET /staff/roster returns active staff with a PIN, name and role only'; 'GET /staff/roster omits staff without a PIN and inactive staff'; 'GET /staff/roster returns 401 DEVICE_UNAUTHORIZED without the device header'; 'GET /staff/roster returns 401 when the device belongs to another cafe'; 'POST /staff/login returns a token whose claims carry staffId, cafeId, role and deviceId'; 'POST /staff/login returns 401 INVALID_PIN for a wrong PIN'; 'POST /staff/login returns an identical 401 INVALID_PIN body for an unknown staffId'; 'POST /staff/login returns 401 INVALID_PIN for an inactive staff member'; 'POST /staff/login returns 401 INVALID_PIN when the member has no PIN set'; 'POST /staff/login returns 423 PIN_LOCKED after 5 consecutive failures'; 'POST /staff/login returns 423 during the lock window even when the PIN is correct'; 'POST /staff/login clears failedPinAttempts and sets lastLoginAt on success'; 'POST /staff/login writes a staff.login audit entry with actorType staff'; 'POST /staff/login writes a staff.login_failed audit entry on a wrong PIN'; 'GET /staff/me returns the staff and cafe for a valid staff token'; 'GET /staff/me returns 401 when the device has been revoked'.
apps/api/src/routes/staff.test.ts (FIX): extend the `satisfies StaffRepository` mock with the new methods.

### Files

- `packages/db/src/schema/staff-devices.ts`
- `packages/db/src/schema/staff.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/drizzle/migrations/0013_staff_devices.sql`
- `packages/types/src/staff.ts`
- `apps/api/src/lib/staff-token.ts`
- `apps/api/src/lib/pin.test.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/repositories/staff-devices.ts`
- `apps/api/src/repositories/staff.ts`
- `apps/api/src/repositories/cafes.ts`
- `apps/api/src/routes/staff-devices.ts`
- `apps/api/src/routes/staff.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/app.ts`

---

<a id="role-authz-guard"></a>

## 🔴 `role-authz-guard` — Role-capability matrix + a cafe-membership guard replacing findByIdAndOwner on every route

### Approach

Verified: apps/api/src/routes/menu.ts:76-79 assertCafeOwnedBy, orders.ts:116-118 getOwnedCafe (used at :201-205 for the KDS feed), tables.ts:51-53 and table-sessions.ts:46-48 ownsCafe, plus the same helper in cash-drawer.ts:35, staff.ts:50, expenses.ts:62, inventory.ts:43, customers.ts:27, audit-logs.ts:30 and reports.ts. ~60 call sites, all resolving the cafe through findByIdAndOwner.

SHARED MATRIX. Put the capability set in packages/types/src/authz.ts so the API and the web nav read ONE source of truth (the web copy in staff-web-shell imports it):
  export type Capability = 'order.create'|'order.read'|'order.status'|'order.settle'|'order.refund'|'order.discount'|'order.reprint'|'kitchen.read'|'kitchen.bump'|'menu.read'|'menu.availability'|'menu.write'|'table.read'|'table.session'|'table.write'|'drawer.open'|'drawer.close'|'reports.read'|'expenses.write'|'inventory.write'|'customer.read'|'staff.manage'|'device.manage'|'audit.read'|'cafe.write';
  export const ROLE_CAPABILITIES: Record<StaffRole, ReadonlySet<Capability>>;
apps/api/src/lib/authz.ts re-exports it plus `can(role, cap)`.

THE MATRIX (decide it here so nobody re-derives it):
  waiter  : order.create/read/status, kitchen.read/bump, menu.read, menu.availability, table.read, table.session
  cashier : waiter + order.settle, order.discount, order.reprint, drawer.open, drawer.close, customer.read
  manager : cashier + menu.write, table.write, order.refund, reports.read, expenses.write, inventory.write
  staff role 'owner' (a co-owner on the floor): manager + audit.read
  the Supabase account holder: everything, including staff.manage, device.manage, cafe.write
Note the deliberate ceiling: a staff row with role 'owner' does NOT get staff.manage / device.manage / cafe.write. Those change who can log in and must stay with the account holder — otherwise a PIN holder can mint themselves a device and a new PIN, and the whole boundary is decorative.

GUARD. New apps/api/src/lib/require-cafe.ts:
  export interface CafeAccess { cafe: Cafe; actor: Actor; role: StaffRole }
  export function makeCafeGuard(deps: { cafesRepo: CafesRepository; staffRepo: StaffRepository }):
    (request, reply, cafeId: string, cap: Capability) => Promise<CafeAccess | null>
Behaviour:
  - owner actor  → cafesRepo.findByIdAndOwner(cafeId, userId); null ⇒ 404 NOT_FOUND 'Cafe not found' (house rule preserved).
  - staff actor  → token's `cafe` claim must equal the URL cafeId, else 404. Then staffRepo.findSessionContext(staffId, cafeId, deviceId); null (member deactivated or device revoked) ⇒ 401 SESSION_REVOKED, so the tablet drops to the lock screen instead of showing a bogus 'cafe not found'.
  - then can(role, cap) === false ⇒ 403 FORBIDDEN with a role-specific message.
  - returns { cafe, actor, role } so callers reuse the already-fetched Cafe row — POST /orders needs it for buildOrder, so this is one query, not two.
DELIBERATE 403/404 ASYMMETRY, and it is NOT a violation of the house rule: cross-owner access still 404s (never confirm another owner's cafe exists). Right-tenant-wrong-role returns 403, because the caller IS a member of this cafe and a 404 would send a waiter chasing a page that is genuinely there. Write this in the guard's docstring or a reviewer will 'fix' it.

APPLICATION, route by route (replace ownsCafe/getOwnedCafe/assertCafeOwnedBy with `const access = await requireCafe(request, reply, cafeId, CAP); if (!access) return;`):
  orders.ts — POST /orders 'order.create', and ADDITIONALLY require 'order.discount' when the body carries discount / serviceChargeBp / packagingChargePaise (a waiter posting a discount gets 403); GET list, GET :orderId, GET /orders/stats, GET :orderId/payments 'order.read'; GET /kitchen/tickets 'kitchen.read'; PATCH :orderId/status 'kitchen.bump'; POST :orderId/bill-printed 'order.reprint'; POST :orderId/settle 'order.settle'; POST :orderId/refund 'order.refund'.
  menu.ts — GET 'menu.read'; POST categories, POST items, POST import, DELETE item 'menu.write'; PATCH :itemId is CAPABILITY-SPLIT — const availabilityOnly = Object.keys(patch).length === 1 && 'isAvailable' in patch; then require availabilityOnly ? 'menu.availability' : 'menu.write'. This is exactly gap 3: the waiter can 86 the paneer at 8pm and cannot reprice it. A patch of { isAvailable, basePricePaise } is menu.write — do not let a mixed patch through on the availability cap.
  tables.ts — GET 'table.read'; POST/PATCH/DELETE 'table.write'.
  table-sessions.ts — GET /floor, /history, /:sessionId 'table.read'; POST open/settle/close 'table.session'.
  cash-drawer.ts — GET /current and POST /open 'drawer.open'; POST /close 'drawer.close'.
  reports.ts 'reports.read'; expenses.ts GET 'reports.read' / mutations 'expenses.write'; inventory.ts GET 'reports.read' / mutations 'inventory.write'; customers.ts 'customer.read'; audit-logs.ts 'audit.read'; staff.ts CRUD 'staff.manage'; staff-devices.ts 'device.manage'.
  cafes.ts — GET /cafes/:id must accept a staff actor (the workspace layout calls it to render the shell) ⇒ requireCafe(..., 'menu.read'). GET /cafes (list by owner) and POST /cafes stay owner-account-only via a small requireOwner(request, reply) that 403s any staff actor. PATCH /cafes/:id ⇒ 'cafe.write' (account holder only).
  ai.ts, ai-console.ts — owner-account-only via requireOwner. The manager agent has tool access to money and menu; do not delegate it on the first pass.
  settle.ts, uploads.ts — no cafeId in the path; leave on plain app.authenticate but add requireOwner so a staff token cannot reach them.

No HTTP-level breaking change for existing owner clients: an owner token hits the same routes with the same results and the same 404 semantics. The break is internal — request.user.id is no longer safe to read directly in any cafe handler, which is why every one must be converted in this item rather than incrementally.

### API

No new routes. Behaviour added to every existing /cafes/:cafeId/* route: a staff bearer token is now accepted; 403 FORBIDDEN { error: { code: 'FORBIDDEN', message } } is a NEW status on these routes for an in-cafe actor lacking the capability; 401 SESSION_REVOKED { error: { code: 'SESSION_REVOKED', message: 'Your session has ended. Sign in again.' } } is new for a deactivated member or a revoked device. Cross-owner access is unchanged at 404 NOT_FOUND.

### Web

none in this item (web nav filtering lives in staff-web-shell)

### Tests

apps/api/src/lib/authz.test.ts (NEW): 'waiter can menu.availability but not menu.write'; 'cashier can order.settle but not order.refund'; 'manager can order.refund but not audit.read'; 'manager cannot staff.manage or device.manage'; "staff role 'owner' gets audit.read but not staff.manage"; 'every Capability appears in at least one role set' (catches a typo'd capability that would silently deny everyone).
apps/api/src/lib/require-cafe.test.ts (NEW): 'returns 404 when an owner token targets another owner cafe'; "returns 404 when a staff token's cafe claim does not match the URL cafeId"; 'returns 401 SESSION_REVOKED when the staff member was deactivated'; 'returns 401 SESSION_REVOKED when the device was revoked'; 'returns 403 FORBIDDEN when the role lacks the capability'; 'returns the cafe row so the caller needs no second query'.
apps/api/src/routes/menu.test.ts (EXTEND): 'waiter PATCH { isAvailable: false } succeeds'; 'waiter PATCH { basePricePaise } returns 403'; 'waiter PATCH { isAvailable, basePricePaise } returns 403'; 'cashier POST /menu/items returns 403'; 'manager POST /menu/items succeeds'; 'manager POST /menu/import succeeds'; 'staff token for another cafe returns 404 on GET /menu'.
apps/api/src/routes/orders.test.ts (EXTEND): 'waiter can create an order'; 'waiter creating an order with a discount returns 403'; 'cashier creating an order with a discount succeeds'; 'waiter PATCH status pending→preparing succeeds'; 'waiter GET /kitchen/tickets succeeds'; 'cashier POST /settle succeeds'; 'cashier POST /refund returns 403'; 'manager POST /refund succeeds'; 'waiter POST /bill-printed returns 403'; 'staff token for another cafe returns 404 on GET /orders'.
apps/api/src/routes/table-sessions.test.ts (EXTEND): 'waiter can open a table session'; 'waiter can settle a table session'; 'waiter can close a table session'.
apps/api/src/routes/tables.test.ts (EXTEND): 'waiter DELETE /tables/:id returns 403'; 'manager PATCH /tables/:id succeeds'.
apps/api/src/routes/cash-drawer.test.ts (EXTEND): 'cashier can open the drawer'; 'waiter opening the drawer returns 403'.
apps/api/src/routes/reports.test.ts (EXTEND): 'cashier GET /reports returns 403'; 'manager GET /reports succeeds'.
apps/api/src/routes/audit-logs.test.ts (EXTEND): 'manager GET /audit-logs returns 403'; 'owner GET /audit-logs succeeds'.
apps/api/src/routes/staff.test.ts (EXTEND): 'manager POST /staff returns 403'.
apps/api/src/routes/cafes.test.ts (EXTEND): 'a staff token can GET /cafes/:id'; 'a staff token PATCH /cafes/:id returns 403'; 'a staff token GET /cafes returns 403'.

### Files

- `packages/types/src/authz.ts`
- `packages/types/src/index.ts`
- `apps/api/src/lib/authz.ts`
- `apps/api/src/lib/require-cafe.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/tables.ts`
- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/routes/expenses.ts`
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/routes/customers.ts`
- `apps/api/src/routes/audit-logs.ts`
- `apps/api/src/routes/staff.ts`
- `apps/api/src/routes/cafes.ts`
- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/ai-console.ts`
- `apps/api/src/routes/settle.ts`
- `apps/api/src/routes/uploads.ts`

---

<a id="staff-actor-audit"></a>

## 🔴 `staff-actor-audit` — Real actor on the audit trail, the cash drawer and table sessions

### Approach

Verified: apps/api/src/routes/orders.ts:339-341 (bill reprint) and :430-431 (refund) hardcode actorType 'owner' + request.user.id; those are the ONLY two audit call sites in the whole API. packages/db/src/schema/cash-drawer-sessions.ts:20 has openedByStaffId and apps/api/src/routes/cash-drawer.ts:18 accepts it from the request body, but apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx:83 never sends it. table_sessions has no actor column at all.

HELPER. New apps/api/src/lib/audit-actor.ts:
  export function auditActor(access: CafeAccess): Pick<RecordAuditInput,'actorType'|'actorId'|'actorName'|'actorRole'> {
    return access.actor.type === 'owner'
      ? { actorType: 'owner', actorId: access.actor.userId, actorName: access.actor.email, actorRole: 'owner' }
      : { actorType: 'staff', actorId: access.actor.staffId, actorName: access.actor.name, actorRole: access.role };
  }
Replace both hardcoded blocks with `...auditActor(access)`.

EXTEND COVERAGE. Two recorded actions cannot answer 'who did what' — add entries, all via auditActor(access): order.settle (POST /settle, metadata { payments: [{ method, amountPaise }], totalPaise }); order.discount (POST /orders when the body carries a discount, metadata { discountPaise, discountReason, subtotalPaise, totalPaise } taken from the buildOrder result); table_session.settle; drawer.open (metadata { openingFloatPaise }); drawer.close (metadata { closingCountedPaise, expectedCashPaise, variancePaise }); menu.availability (86'ing, metadata { itemId, isAvailable }); menu.price_change (metadata { itemId, fromPaise, toPaise }); staff.create / staff.update / staff.delete.

MONEY RULE, standing for this codebase: audit metadata carries INTEGER PAISE ONLY — never a rupee float, never a percent that has to be re-derived. The discount entry stores the discountPaise integer the server already computed in apps/api/src/orders/build.ts, so re-reading the log never re-runs a rounding and never disagrees with the bill. drawer variancePaise = closingCountedPaise − expectedCashPaise, both integers, so the difference is exact by construction. There is no apportionment across lines in this work item, so no remainder rule is needed here. Small existing bug to fix while in the file: the two summary strings interpolate `body.amountPaise / 100`, which prints ₹1234.5 for 123450 paise — replace with (paise/100).toFixed(2).

STOP TRUSTING THE CLIENT FOR ATTRIBUTION. POST /cash-drawer/open currently accepts openedByStaffId from the body, so today ANY authenticated caller can attribute a drawer to an arbitrary UUID. New rule, applied to drawer open/close and table-session open: when the actor is staff, the staff id is taken from access.actor.staffId and the body field is IGNORED; when the actor is the account holder, the body field is honoured (a back-office owner can attribute a drawer to a named member) but must pass staffRepo.findByIdAndCafe, else 400 INVALID_STAFF.

CORRECTION TO THE AUDITOR'S POINTER: they suggested populating openedByStaffId from the session in cash-drawer-panel.tsx:83. The right fix is the opposite direction — a staff device should stop sending the field entirely and let the server derive it from the token (a client-supplied actor id is not an audit trail). The panel change is: drop openedByStaffId from the staff-device request body, and render an optional 'Opened by' select (fed by GET /cafes/:id/staff) only when the owner account is driving.

The audit UI at apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx:99-102 renders only actorType today, so all this new data would be invisible — render actorName + actorRole beside the badge and add an actor filter.

### Schema

MODIFY packages/db/src/schema/audit-logs.ts — add: actorRole text NULL (nullable; historic rows stay null and the UI falls back to actorType — NO backfill).
MODIFY packages/db/src/schema/cash-drawer-sessions.ts — add: closedByStaffId uuid NULL.
MODIFY packages/db/src/schema/tables.ts (tableSessions) — add: openedByStaffId uuid NULL, closedByStaffId uuid NULL.
Migration 0014 (or fold into 0013 if staff-session-tokens has not landed yet), plus hand-written FKs matching house style:
  ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_closed_by_staff_id_fk" FOREIGN KEY ("closed_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;
  ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_staff_id_fk" FOREIGN KEY ("opened_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;
  ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_staff_id_fk" FOREIGN KEY ("closed_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;
All additive and nullable. ON DELETE SET NULL, not CASCADE — deleting a staff member must never delete a shift or a tab. Note the audit_logs table stays untouched by deletes: actorId is a plain text column with no FK, deliberately, so the immutable trail survives a staff row being removed.

### API

No new routes. Contract changes:
POST /cafes/:cafeId/cash-drawer/open — openedByStaffId in the body is now IGNORED for a staff token (derived from the token) and VALIDATED for an owner token; 400 INVALID_STAFF { error: { code: 'INVALID_STAFF', message: 'That staff member does not belong to this cafe' } } is a new response.
POST /cafes/:cafeId/cash-drawer/close — response session now carries closedByStaffId: string | null.
POST /cafes/:cafeId/table-sessions — response session now carries openedByStaffId: string | null; close adds closedByStaffId.
GET /cafes/:cafeId/audit-logs — each log now carries actorRole: StaffRole | 'owner' | null (null on rows written before this migration). Additive; existing clients ignore it.

### Web

MODIFY apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx — drop openedByStaffId from the staff-device open body; add an owner-only 'Opened by' select; show 'Opened by <name>' and 'Closed by <name>' on the session card. MODIFY apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx — render actorName + actorRole next to the ACTOR_STYLE badge (lines 99-102), fall back to actorType when actorName is null, add an actor filter control. MODIFY apps/web/src/app/cafes/[id]/tables/table-session-sheet.tsx and history-view.tsx — show who opened/closed the tab.

### Tests

apps/api/src/lib/audit-actor.test.ts (NEW): 'maps an owner actor to actorType owner with the Supabase user id and email'; 'maps a staff actor to actorType staff with staffId, name and role'.
apps/api/src/routes/orders.test.ts (EXTEND): 'a staff refund writes actorType staff with the staff id, name and role'; 'an owner refund still writes actorType owner'; 'a staff bill reprint writes actorType staff'; 'settling an order writes an order.settle audit entry naming the actor'; 'creating an order with a discount writes an order.discount entry carrying discountPaise as an integer'; 'the refund summary formats 123450 paise as ₹1234.50'.
apps/api/src/routes/cash-drawer.test.ts (EXTEND): 'a staff-token open ignores a body openedByStaffId and uses the token staffId'; "an owner-token open with an openedByStaffId from another cafe returns 400 INVALID_STAFF"; 'close records closedByStaffId from the staff token'; 'close writes a drawer.close audit entry carrying closingCountedPaise, expectedCashPaise and variancePaise as integers'.
apps/api/src/routes/menu.test.ts (EXTEND): "86'ing an item writes a menu.availability audit entry"; 'changing basePricePaise writes menu.price_change with fromPaise and toPaise'.
apps/api/src/routes/table-sessions.test.ts (EXTEND): 'opening a session records openedByStaffId from the staff token'; 'settling a session writes a table_session.settle audit entry'.
apps/web/src/app/cafes/[id]/audit/audit-log-view.test.tsx (NEW): 'renders actorName and role for a staff entry'; 'falls back to the actor type when actorName is null (historic rows)'.

### Files

- `packages/db/src/schema/audit-logs.ts`
- `packages/db/src/schema/cash-drawer-sessions.ts`
- `packages/db/src/schema/tables.ts`
- `packages/db/drizzle/migrations/0014_actor_attribution.sql`
- `packages/types/src/staff.ts`
- `packages/types/src/domain.ts`
- `apps/api/src/lib/audit-actor.ts`
- `apps/api/src/repositories/audit-logs.ts`
- `apps/api/src/repositories/cash-drawer.ts`
- `apps/api/src/repositories/table-sessions.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/cash-drawer.ts`
- `apps/api/src/routes/table-sessions.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/staff.ts`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`
- `apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx`

---

<a id="staff-web-shell"></a>

## 🔴 `staff-web-shell` — Device handover, PIN lock screen, role-filtered nav, chrome-free KDS

### Approach

TOKEN TRANSPORT. Staff tokens must be readable by Server Components (serverFetch) and by client fetches, survive a reload, and NOT be readable by JS on a shared floor tablet. So: HttpOnly cookies set by Next Route Handlers.
  sangam_device      — HttpOnly, Secure, SameSite=Lax, Max-Age 1y, path / — the opaque device token.
  sangam_staff       — HttpOnly, Secure, SameSite=Lax, Max-Age = STAFF_SESSION_TTL_HOURS, path / — the staff JWT.
  sangam_device_cafe — NOT HttpOnly, Max-Age 1y — just the cafeId, because the lock screen must know which roster to fetch before any auth exists.

ROUTE HANDLERS under apps/web/src/app/api/staff/:
  POST /api/staff/pair    { cafeId, label } — requires the OWNER Supabase session; calls POST /cafes/:cafeId/devices via serverFetch; sets sangam_device + sangam_device_cafe. The raw device token never touches client JS. This IS the handover: the owner signs in once on the tablet, taps 'Set up this device', then signs out of Supabase.
  POST /api/staff/login   { cafeId, staffId, pin } — forwards to the API with x-sangam-device from the cookie; on 200 sets sangam_staff; passes 401/423 bodies through unchanged so the lock screen can render the lockout countdown.
  POST /api/staff/logout  — clears sangam_staff ONLY, keeping sangam_device, so shift change is just the next PIN.
  POST /api/staff/unpair  — clears all three.

THE BIG ONE — 21 client fetch call sites. Every client component builds its own authorization header from supabase.auth.getSession(): menu-editor.tsx (x2), order-builder.tsx, kitchen-board.tsx, cash-drawer-panel.tsx, staff-manager.tsx, order-actions.tsx, print-views.tsx, tables-tool.tsx, layout/layout-editor.tsx, expenses-view.tsx, inventory-view.tsx, customers-list.tsx, audit-log-view.tsx, edit-cafe-form.tsx, manager-chat.tsx, ai-waiter/waiter-chat.tsx, cafes/new/new-cafe-form.tsx, settle/settle-tool.tsx, components/ui/image-upload.tsx. On a staff device every one of these sends an owner token or nothing. Fix with ONE same-origin proxy rather than 21 edits to header logic:
  NEW apps/web/src/app/api/proxy/[...path]/route.ts exporting GET/POST/PATCH/DELETE. It reads sangam_staff (preferred) or the Supabase access token, attaches authorization + x-sangam-device server-side, forwards method/body/content-type, and streams the API response through with its status intact. Guard the path: only forward when it matches ^/(cafes|staff|settle|uploads)(/|$).
  NEW apps/web/src/lib/authed-fetch.ts — `authedFetch(path, init)` posting to /api/proxy<path>. Delete the local authedFetch copy in each of the files above and point them at it.
This keeps the staff JWT HttpOnly (the entire point on a shared tablet), removes a supabase.auth.getSession() round-trip from every button press, and collapses 21 near-identical helpers. It is a real refactor across the whole owner POS with real regression risk — budget it separately; do not fold it into 'the PIN screen'.

MODIFY apps/web/src/lib/api-server.ts — getServerToken() reads sangam_staff from cookies() FIRST and only falls back to the Supabase session. A paired device with a live staff session must never fall back to a lingering owner session. Forward x-sangam-device when the device cookie is present.

MIDDLEWARE (apps/web/src/lib/supabase/middleware.ts). Today `!user && !isPublic → /login`; a staff device has no Supabase user, so every POS page would bounce to /login. New gate: const hasStaff = request.cookies.has('sangam_staff'); const hasDevice = request.cookies.has('sangam_device'); if (!user && !hasStaff) redirect to hasDevice ? `/lock?returnTo=${path}` : '/login'. Add '/lock' to isPublic ('/api/' is already covered, which handles /api/staff/*).

LOCK SCREEN — NEW apps/web/src/app/lock/page.tsx + lock-screen.tsx (client). Reads cafeId from sangam_device_cafe, fetches /api/proxy/cafes/:cafeId/staff/roster, renders a name grid plus a numeric keypad with ≥56px touch targets (used with wet hands, one-handed, on a greasy tablet), posts /api/staff/login, on success router.replace(safeNextPath(returnTo)). Renders 'Wrong PIN' for 401 without revealing whether the staff id exists, and a minutes countdown for 423. Also offers 'Sign in as owner instead' → /login, which is the escape hatch when the roster is empty.

CAFE SHELL (apps/web/src/app/cafes/[id]/components/cafe-shell.tsx). New prop `actor: { type: 'owner'|'staff'; name: string; role: StaffRole }`, supplied by apps/web/src/app/cafes/[id]/layout.tsx from GET /staff/me (staff) or supabase.auth.getUser() (owner). Filter the `items` array through the SAME capability matrix by importing ROLE_CAPABILITIES from @sangam/types — one source of truth with the API, not a hand-copied list that drifts. A waiter sees Dashboard, New order, Orders, Kitchen, Menu, Tables & QR; no Reports, Expenses, Cash drawer, Customers, Staff, Audit log, AI Manager. Replace the profile card's owner email with the staff name + role and add a LOCK button (posts /api/staff/logout, routes to /lock) — the shift-change gesture. This is presentation only; the server-side 403s from role-authz-guard are the actual boundary, and the code comment should say so.

CHROME-FREE KDS — CORRECTION TO THE AUDITOR'S POINTER. They suggested giving the kitchen route its own layout instead of cafe-shell.tsx:52-67. In the App Router a nested layout.tsx under kitchen/ renders INSIDE cafes/[id]/layout.tsx; it cannot remove the shell. The only clean fix is to move the route out of the [id] segment: NEW apps/web/src/app/kds/[cafeId]/page.tsx (the current kitchen/page.tsx body) + kds/[cafeId]/kitchen-board.tsx (moved) + apps/web/src/app/kds/layout.tsx rendering full-bleed with no sidebar and no profile card. Keep apps/web/src/app/cafes/[id]/kitchen/page.tsx as a redirect('/kds/'+id) so bookmarks and the sidebar link keep working.

STAFF PAGE. apps/web/src/app/cafes/[id]/staff/page.tsx:46 says 'PINs are stored securely and never shown again' — a promise the product did not keep until now. Update the copy to say what a PIN does ('Staff sign in on a paired device with their PIN') and add a Devices section (list, 'Set up this device', revoke) backed by the /devices routes.

OFFLINE QUEUE. apps/web/src/lib/offline-queue.ts replays order POSTs; a replay after the 12h staff token expires will 401 and the order is silently lost or retried forever. On a 401 during flush, keep the item queued, stop the flush, and route to /lock — then the order posts under the next staff session.

### API

none new on the Fastify side. New Next.js Route Handlers (same-origin, cookie-scoped): POST /api/staff/pair { cafeId, label } → 200 { ok: true } | 401 | 404, sets sangam_device + sangam_device_cafe; POST /api/staff/login { cafeId, staffId, pin } → 200 { staff: { id, name, role } } setting sangam_staff, or the API's 401 INVALID_PIN / 401 DEVICE_UNAUTHORIZED / 423 PIN_LOCKED body verbatim; POST /api/staff/logout → 204, clears sangam_staff; POST /api/staff/unpair → 204, clears all three cookies; ALL /api/proxy/<apiPath> (GET/POST/PATCH/DELETE) → transparent pass-through of the Fastify response and status, with authorization + x-sangam-device attached server-side, restricted to paths matching ^/(cafes|staff|settle|uploads)(/|$).

### Web

NEW apps/web/src/app/lock/page.tsx; NEW apps/web/src/app/lock/lock-screen.tsx; NEW apps/web/src/app/api/staff/pair/route.ts; NEW apps/web/src/app/api/staff/login/route.ts; NEW apps/web/src/app/api/staff/logout/route.ts; NEW apps/web/src/app/api/staff/unpair/route.ts; NEW apps/web/src/app/api/proxy/[...path]/route.ts; NEW apps/web/src/lib/authed-fetch.ts; NEW apps/web/src/lib/staff-session.ts (cookie names + read helpers, server-only); NEW apps/web/src/app/kds/layout.tsx; NEW apps/web/src/app/kds/[cafeId]/page.tsx; MOVED apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx → apps/web/src/app/kds/[cafeId]/kitchen-board.tsx. MODIFY: apps/web/src/app/cafes/[id]/kitchen/page.tsx (redirect), apps/web/src/app/cafes/[id]/layout.tsx (resolve the actor, pass to the shell), apps/web/src/app/cafes/[id]/components/cafe-shell.tsx (actor prop, capability-filtered nav, Lock button), apps/web/src/lib/api-server.ts, apps/web/src/lib/supabase/middleware.ts, apps/web/src/lib/offline-queue.ts (401 handling), apps/web/src/app/cafes/[id]/staff/page.tsx (copy + Devices section), apps/web/src/app/cafes/[id]/staff/staff-manager.tsx, and the 19 files listed in the approach that each carry a private authedFetch/getSession header block.

### Tests

apps/web/src/lib/authed-fetch.test.ts (NEW): 'posts to the same-origin /api/proxy path'; 'propagates a non-2xx status and the API error envelope'; 'does not attach an Authorization header client-side'.
apps/web/src/lib/capabilities.test.ts (NEW): 'waiter nav excludes Reports, Expenses, Cash drawer, Customers, Staff and Audit log'; 'cashier nav includes Cash drawer but excludes Reports'; 'manager nav includes Reports but excludes Audit log and Staff'; 'owner nav includes every item'.
apps/web/src/app/lock/lock-screen.test.tsx (NEW): 'renders one button per roster member'; 'requires at least 4 digits before enabling Sign in'; "shows 'Wrong PIN' on a 401 without revealing whether the staff id exists"; 'shows the lockout countdown on a 423'; 'redirects to the returnTo path on success'; 'offers Sign in as owner when the roster is empty'.
apps/web/src/app/cafes/[id]/components/cafe-shell.test.tsx (NEW): 'renders the staff name and role instead of the owner email for a staff actor'; 'renders a Lock button for a staff actor'; 'renders no Lock button for an owner actor'; 'hides Reports and Audit log for a waiter actor'.
apps/web/src/lib/api-server.test.ts (NEW): 'prefers the sangam_staff cookie over the Supabase session'; 'falls back to the Supabase access token when no staff cookie is set'; 'forwards x-sangam-device when the device cookie is present'.
apps/web/src/lib/offline-queue.test.ts (EXTEND): 'keeps a queued order and stops the flush when the replay returns 401'.

### Files

- `apps/web/src/app/lock/page.tsx`
- `apps/web/src/app/lock/lock-screen.tsx`
- `apps/web/src/app/api/staff/pair/route.ts`
- `apps/web/src/app/api/staff/login/route.ts`
- `apps/web/src/app/api/staff/logout/route.ts`
- `apps/web/src/app/api/staff/unpair/route.ts`
- `apps/web/src/app/api/proxy/[...path]/route.ts`
- `apps/web/src/lib/authed-fetch.ts`
- `apps/web/src/lib/staff-session.ts`
- `apps/web/src/lib/api-server.ts`
- `apps/web/src/lib/supabase/middleware.ts`
- `apps/web/src/lib/offline-queue.ts`
- `apps/web/src/app/kds/layout.tsx`
- `apps/web/src/app/kds/[cafeId]/page.tsx`
- `apps/web/src/app/kds/[cafeId]/kitchen-board.tsx`
- `apps/web/src/app/cafes/[id]/kitchen/page.tsx`
- `apps/web/src/app/cafes/[id]/layout.tsx`
- `apps/web/src/app/cafes/[id]/components/cafe-shell.tsx`
- `apps/web/src/app/cafes/[id]/staff/page.tsx`
- `apps/web/src/app/cafes/[id]/staff/staff-manager.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx`
- `apps/web/src/app/cafes/[id]/tables/tables-tool.tsx`
- `apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx`
- `apps/web/src/app/cafes/[id]/expenses/expenses-view.tsx`
- `apps/web/src/app/cafes/[id]/inventory/inventory-view.tsx`
- `apps/web/src/app/cafes/[id]/customers/customers-list.tsx`
- `apps/web/src/app/cafes/[id]/audit/audit-log-view.tsx`
- `apps/web/src/app/cafes/[id]/edit/edit-cafe-form.tsx`
- `apps/web/src/app/cafes/[id]/manager/manager-chat.tsx`
- `apps/web/src/app/cafes/[id]/ai-waiter/waiter-chat.tsx`
- `apps/web/src/components/ui/image-upload.tsx`
- `apps/web/src/app/settle/settle-tool.tsx`

---

## Order of work

1. 1. owner-account-recovery FIRST and standalone. It touches nothing else in this theme, it is a same-day outage fix, and it can ship behind no flag. Gate 'done' on receiving a real reset email through a configured SMTP provider, not on the tests passing.
2. 2. staff-session-tokens, part A — schema. Add packages/db/src/schema/staff-devices.ts and the three staff columns, register the new file in packages/db/drizzle.config.ts (explicit list, not a glob), generate migration 0013, hand-add the FK, run db:migrate. Additive only, so this can land on production ahead of the code.
3. 3. staff-session-tokens, part B — apps/api/src/lib/staff-token.ts + apps/api/src/lib/pin.test.ts + the env vars + the actor model in apps/api/src/plugins/auth.ts. Land with request.user still populated for owner tokens so nothing breaks yet.
4. 4. staff-session-tokens, part C — the repositories (staff-devices, staff.findSessionContext, cafes.findById) and the routes: /devices CRUD, /staff/roster, /staff/login, /staff/me, /staff/logout. Fix the `satisfies StaffRepository` mock in staff.test.ts in the same commit or the suite will not compile.
5. 5. FREEZE the API contracts here. From this point staff-web-shell can proceed in parallel with role-authz-guard.
6. 6. role-authz-guard, part A — packages/types/src/authz.ts (the matrix), apps/api/src/lib/authz.ts, apps/api/src/lib/require-cafe.ts, with their unit tests. No routes converted yet.
7. 7. role-authz-guard, part B — convert routes in this order, one PR per group, each with its role tests: orders.ts (highest traffic, most caps) → menu.ts (the availability/write split) → tables.ts + table-sessions.ts → cash-drawer.ts → reports/expenses/inventory/customers → audit-logs/staff/staff-devices → cafes.ts + requireOwner on ai.ts, ai-console.ts, settle.ts, uploads.ts. Do not leave any cafe route reading request.user.id directly.
8. 8. staff-actor-audit — migration 0014, then apps/api/src/lib/audit-actor.ts, then the orders.ts:339 and :430 replacements, then the new audit call sites and the server-derived openedByStaffId/closedByStaffId. Depends on CafeAccess from step 6.
9. 9. staff-web-shell, part A — the proxy route and apps/web/src/lib/authed-fetch.ts, then migrate all 19 client fetch call sites off their private authedFetch helpers. Ship and soak this on the OWNER path alone before any staff cookie exists; it is a pure refactor at that point and any regression is attributable.
10. 10. staff-web-shell, part B — cookie route handlers, api-server.ts precedence, the middleware gate, /lock, the actor-aware cafe-shell, the /kds route-group move, and the Devices section on the staff page.
11. 11. End-to-end on real hardware: pair a tablet from the owner account, sign out of Supabase, sign in as a waiter by PIN, confirm the sidebar has no Reports/Refund, confirm a price edit 403s, confirm 86'ing works, refund as manager, then read the audit log and check every row names the right person.

## Risks

- SMTP is the hidden blocker on password reset. Supabase's built-in email sender is capped at a handful of messages per hour project-wide and drops the rest without an error. With the default sender this ships, passes tests, demos fine and then fails for the first cafe that needs it. A real SMTP provider plus one verified end-to-end reset is part of done, not a follow-up.
- The 19-file client-fetch refactor in staff-web-shell is the largest regression surface in the whole theme and touches every screen of the owner POS (menu editor, order builder, KDS, drawer, expenses, inventory, AI console, settle, image upload). It is easy to under-plan as 'plumbing'. Ship it alone, on the owner path, before any staff cookie exists, so any breakage is attributable.
- Adding methods to StaffRepository and CafesRepository breaks the `satisfies StaffRepository` mock in apps/api/src/routes/staff.test.ts at compile time, and any other mock using satisfies. Expect a red suite the moment the interface changes; fix the mocks in the same commit.
- The 403-for-wrong-role / 404-for-wrong-tenant asymmetry looks like a violation of the house rule 'return 404, never 403'. It is not — cross-owner access still 404s — but a reviewer will flag it. Document it in the guard's docstring or it will get 'fixed' back to a 404 and waiters will chase pages that exist.
- PIN entropy is 4 digits against a roster of maybe ten people. Device binding plus the 5-attempt lockout plus the per-device rate limit are what make that acceptable. Shipping POST /staff/login without the device requirement — the shortest path, and what the auditor's pointer literally reads as — turns a login route into an open brute-force target on a cafeId that appears in every owner URL. Do not ship the login route unbound.
- A staff token is valid for up to 12h with no server-side denylist. Revocation is nonetheless immediate BECAUSE the guard re-reads staff.is_active and staff_devices.revoked_at on every request via findSessionContext. If anyone later 'optimises' that join away by trusting the token claims, revocation silently degrades to a 12-hour window. Guard it with the require-cafe.test.ts SESSION_REVOKED cases.
- Existing production cafes have staff rows with no PINs. listForLogin returns nothing, the lock screen shows an empty roster, and a paired tablet is bricked. Mitigate on both sides: the pairing flow warns hard when the cafe has zero PIN-bearing staff, and the lock screen always offers 'Sign in as owner instead'.
- findSessionContext adds a three-table join to every staff-authenticated request where the owner path does a single PK lookup. It is one round trip and every column is indexed, but it is on the hot path for the KDS poll and the order rush. Measure it against the p95 target before assuming it is free; if it bites, cache the cafe row (not the staff row) in the existing lib/cache.ts with invalidation on PATCH /cafes/:id.
- The offline order queue replays POSTs that will 401 once a staff token expires. Without the 401 handling in step 10, a cafe that loses WiFi over a shift change silently loses the queued orders. Test it explicitly.
- Moving the kitchen to /kds/[cafeId] changes a URL that may already be bookmarked on a kitchen tablet's home screen. The redirect from /cafes/[id]/kitchen covers it, but a PWA-installed shortcut pinned to the old path will now take an extra hop; tell the pilot cafes to re-pin.
