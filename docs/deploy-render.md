# Deploying the Sangam backend to Render

The backend is `apps/api` — a Fastify server that compiles to plain JS in
`apps/api/dist` and boots with `node dist/server.js`. It needs Postgres, and
optionally Redis for caching.

The frontend (`apps/web`, Next.js) is **not** deployed here. Put it on Vercel
and point it at this API. Render can host it too, but Next.js on Vercel is
cheaper and faster.

---

## What the API needs to run

| Thing | Why | Where it comes from |
|---|---|---|
| Postgres | all app data | Render Postgres (created by the blueprint) |
| Redis | menu/report caching | Render Key Value (optional but recommended) |
| Supabase project | login + JWT verification | your existing Supabase project |
| Razorpay keys | pay-at-table | Razorpay dashboard (use live keys only when you go live) |

---

## Step 1 — Push the repo to GitHub

Render deploys from a Git remote. This repo already has one:

```
origin  https://github.com/chetankush/ai-os-pos.git
```

Render deploys what is **committed and pushed**, not what's on your laptop.
There are ~40 uncommitted files right now (inventory, expenses, customers,
auth routes, the offline queue, migration `0011`). Commit and push them first,
or the deployed API will be missing those routes and its schema will be one
migration behind:

```bash
git add -A && git commit -m "…" && git push origin main
```

## Step 2 — Create the services from the blueprint

`render.yaml` at the repo root declares everything: the API web service, a
Postgres database, and a Redis instance, all in the **Singapore** region
(lowest latency to India).

1. Render dashboard → **New** → **Blueprint**
2. Pick the repo → Render reads `render.yaml` → **Apply**

`DATABASE_URL` and `REDIS_URL` get wired in automatically. You do **not** set
them by hand.

## Step 3 — Set the secrets

Every var marked `sync: false` in the blueprint must be filled in by hand:
Render dashboard → `sangam-api` → **Environment**.

```
SUPABASE_URL          https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET   Supabase → Project Settings → API → JWT Secret ("Reveal")
SUPABASE_SECRET_KEY   Supabase → Project Settings → API → service/secret key
CORS_ORIGINS          https://your-web-domain.com     ← comma-separated, no trailing slash
RAZORPAY_KEY_ID       rzp_live_… (or rzp_test_… while testing)
RAZORPAY_KEY_SECRET   …
DEEPSEEK_API_KEY      your OpenRouter key
```

**`CORS_ORIGINS` is the one people get wrong.** It must be the exact origin the
browser sends — `https://app.sangam.in`, not `app.sangam.in`, and no trailing
slash. If it's wrong, every browser call fails CORS while `curl` still works.

**Do not reuse the `.env` values in `apps/api/.env` as-is.** That file has a
DeepSeek key pointed at the China-hosted `api.deepseek.com`, which your own
`docs/market-analysis.md` says must not see customer data. The blueprint
defaults `DEEPSEEK_BASE_URL` to OpenRouter instead.

## Step 4 — Run the database migrations

The blueprint sets `preDeployCommand`, so migrations run automatically before
each new version takes traffic:

```
pnpm --filter @sangam/db db:migrate:prod
```

`preDeployCommand` needs a **paid** instance type. On the free plan, delete
that line from `render.yaml` and run migrations yourself from the service Shell
(Render dashboard → `sangam-api` → **Shell**):

```bash
pnpm --filter @sangam/db db:migrate:prod
```

Or from your laptop against the **External** database URL:

```bash
DATABASE_URL='postgres://…?sslmode=require' pnpm --filter @sangam/db db:migrate:prod
```

Note the `?sslmode=require` — Render's *external* connections require SSL. The
*internal* URL the blueprint wires in does not, which is why the app itself
needs no SSL config.

## Step 5 — Point the frontend at it

On Vercel, set:

```
NEXT_PUBLIC_API_URL            https://sangam-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL       https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  sb_publishable_…
```

Then add that Vercel URL to `CORS_ORIGINS` on Render and redeploy the API.

`NEXT_PUBLIC_*` vars are baked in at **build** time, so changing them means
redeploying the frontend, not just restarting it.

## Step 6 — Verify

```bash
curl https://sangam-api.onrender.com/health
# {"status":"ok","uptime":…,"version":"0.0.1","timestamp":"…"}

# should be 401, NOT 500 — proves auth is wired and DB routes registered
curl -o /dev/null -w '%{http_code}\n' https://sangam-api.onrender.com/cafes
```

Then check the deploy logs. If you see either of these warnings, the service is
running but **half its routes are silently missing**:

```
DATABASE_URL not set — db-backed routes will not work
No SUPABASE_URL or SUPABASE_JWT_SECRET set — auth-protected routes will not work
```

`apps/api/src/routes/index.ts` skips whole route groups when those are absent
rather than crashing, so the server looks healthy while `/cafes`, `/orders` and
everything else 404s. Always read the startup logs after a deploy.

---

## Things that will bite you

**Don't use the free web-service plan.** It sleeps after 15 minutes of
inactivity and takes ~30s to wake. A café's counter tablet hitting a sleeping
POS mid-rush is not survivable. `starter` is the floor.

**Rate limiting is per-instance.** `@fastify/rate-limit` is configured with
in-memory storage in `apps/api/src/app.ts`. Scale to 2+ instances and each one
keeps its own counter, so the real limit becomes N×600/min. Redis is already
provisioned — pass it to the rate limiter before scaling out.

**Region matters more than plan.** Singapore adds ~60–90 ms for Indian users;
Oregon adds ~250 ms. Every POS tap pays that.

**Plan names change.** Render renames tiers periodically. If `Apply` rejects
the blueprint, check current names against Render's pricing page and edit
`render.yaml`.

**Back up before you have customers, not after.** Render's `basic-256mb`
Postgres includes daily backups; verify the retention window covers a full
GST filing cycle, because `invoice_sequences` must never regress.
