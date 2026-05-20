# Testing Sangam — Easy Guide

A plain-English walkthrough to run the app locally and test every feature with
realistic pre-seeded data.

---

## Step 1 — Start the app (2 terminals)

The local database (Postgres + Redis) runs in Docker. If it isn't running yet:

```bash
cd /Users/chetankushwah/Desktop/personal/Happyspace
docker compose up -d
```

**Terminal 1 — backend:**
```bash
cd /Users/chetankushwah/Desktop/personal/Happyspace
pnpm --filter @sangam/api dev
```
Wait until it says it's listening on port **3001**.

**Terminal 2 — frontend:**
```bash
cd /Users/chetankushwah/Desktop/personal/Happyspace
pnpm --filter @sangam/web dev
```
Wait until it says **http://localhost:3000**.

---

## Step 2 — Log in

1. Open **http://localhost:3000**
2. Email: **admin@testpos.com**
3. Password: **Test@1234**
4. Click **Sign in** → you land on the dashboard.

---

## Step 3 — What you'll see

You're the owner of **Tapri Central** (a pre-seeded Noida cafe): **25 menu items**
and **9 orders** across every status. Everything below already has data.

---

## Step 4 — Try each feature

### Dashboard (first screen)
Today's revenue, order counts by status, and recent orders. Click any order to open it.

### Menu (Tapri Central → Menu)
- Browse 4 categories: Chai & Coffee, Snacks, Mains, Desserts.
- Flip an item's **availability toggle** → a "saved" toast appears.
- **Add item** to create one; delete one (it asks to confirm).

### Orders (Orders tab)
- See all 9 orders with colored status tags.
- Open a **Pending** order → **Start preparing** → **Mark ready** → **Mark completed**. Watch it move through the stages.
- Open another and try **Cancel order**.

### New order (tabletop POS — "New order")
- Search an item, tap to add to cart, use **− / +** for quantity.
- Total + GST update live.
- Optionally add a table/customer, then **Place order** → it appears in the orders list.

### Settle (http://localhost:3000/settle)
- Click **Fill sample data** → **Find disputable money**.
- See the disputable total + a ready-to-send WhatsApp message (Copy / Send).

### Sign-up flow (optional)
- Sign out (top right), create a new account + a new cafe to see the empty-state experience.

---

## Login

| | |
|---|---|
| URL | http://localhost:3000 |
| Email | `admin@testpos.com` |
| Password | `Test@1234` |

---

## Troubleshooting

- **"Failed to load" / blank data** → make sure *both* terminals are still running (api on 3001, web on 3000).
- **Login fails** → the backend (Terminal 1) probably isn't up yet; wait for it.
- **Reset to fresh seed data:**
  ```bash
  DATABASE_URL='postgresql://sangam:sangam@localhost:5434/sangam' pnpm --filter @sangam/db db:seed
  ```
- **Database not running** (e.g. after a reboot):
  ```bash
  cd /Users/chetankushwah/Desktop/personal/Happyspace && docker compose up -d
  ```

---

## What's seeded

- **Cafe:** Tapri Central — Sector 18, Noida (AC, 18% GST), owned by `admin@testpos.com`.
- **Menu:** 25 items in 4 categories, with veg/non-veg/egg markers and spice levels.
- **Orders:** 9 across all statuses (4 completed = today's revenue, 1 ready, 2 preparing, 1 pending, 1 cancelled) with tables, customers, and realistic times.

Re-running the seed is safe (idempotent) — it replaces the seed cafe and its data.
