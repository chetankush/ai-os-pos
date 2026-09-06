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

---

## Step 5 — Tables & floor plan (dine-in)

This is how a restaurant tracks **which guest is sitting at which table** and bills
a table as **one combined bill**, even if the guest ordered several times.

> The seed does **not** create tables — that's intentional, so you experience the
> real first-run flow of building your floor. Create a few first (takes ~1 min),
> or use the SQL snippet at the bottom to seed 5 tables instantly.

### A. Build the floor (Tapri Central → **Tables** → **Edit layout**)
1. Open **Tables** in the sidebar, then **Edit layout**.
2. **Add table** a few times. For each one set a **label** (T1, T2, W1…), an
   **area** (Main Hall, Near Window, Patio), **shape** (round/square) and **seats**.
3. **Drag** the tables around the canvas to match your real floor. Positions save
   on drop (on a phone, tap a table then use the arrow nudges).
4. Each table has a **QR** — **Print QR** gives a sheet you'd stick on the table.

### B. Live floor + run a table (Tables)
1. Back on **Tables**, every table shows its live status:
   **Free → Occupied → Ready → Billed**, with the guest name and running ₹ total.
   It auto-refreshes every ~20s.
2. Click a **Free** table → **Seat guest** → enter a name (e.g. *Asha*) and party
   size → the table turns **Occupied**.
3. Open that table → **Add items** → you land in the POS with an
   *"Adding to Table T1 tab"* banner. Add a Masala Chai → **Place order**. You
   return to the floor; the table now shows the running total.
4. **Add items again** to prove multiple rounds stack onto the same tab.
5. Open the table → review the **running tab** (all rounds, Subtotal / GST / Total)
   → **Settle** (UPI is the default; Cash / Card also there) → the table goes back
   to **Free** with a *"Table T1 settled"* toast.

✅ **What "good" looks like:** one settle closes the whole session and marks every
order in it `completed / paid`. The floor returns the table to **Free**.

---

## Step 6 — QR ordering + pay-at-table (the diner's phone)

This is what a guest sees after scanning the QR (no login, no app install).

1. Open the diner menu directly: **http://localhost:3000/m/tapri-central**
   (this is the page the table QR points to).
2. Browse the menu, **add items**, open the cart, and **Place order**.
3. **Pay-at-table:** if Razorpay test keys are set in `apps/api/.env`
   (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), you'll get a **Pay now** button
   that opens Razorpay Checkout. Use test UPI **success@razorpay** (or a
   [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/)).
   If no keys are set, the diner flow still works — it just shows "pay at counter".
4. **Your orders:** the diner's past orders for this restaurant are remembered on
   the phone (localStorage) and shown under **Your orders** — no account needed.
   Reload the page; the list is still there. Status updates live as the kitchen
   moves the order along.

✅ **What "good" looks like:** the order shows up in the owner's **Orders** tab in
real time, and a paid order reads `paid / online`.

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
- **Tables screen is empty** → that's expected on a fresh seed. Add tables via
  **Tables → Edit layout**, or run the "seed 5 tables instantly" snippet above.
- **No "Pay now" on the diner page** → Razorpay keys aren't set in `apps/api/.env`.
  Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test keys) and restart the API.

---

## What's seeded

- **Cafe:** Tapri Central — Sector 18, Noida (AC · 5% GST under the Sept-2025 reform), owned by `admin@testpos.com`.
- **Menu:** 25 items in 4 categories, with veg/non-veg/egg markers and spice levels.
- **Orders:** 9 across all statuses (4 completed = today's revenue, 1 ready, 2 preparing, 1 pending, 1 cancelled) with tables, customers, and realistic times.

Re-running the seed is safe (idempotent) — it replaces the seed cafe and its data.

---

## Shortcut — seed 5 tables instantly

If you'd rather not click through **Edit layout**, this adds T1/T2/T3 (Main Hall),
W1 (Near Window) and P1 (Patio) to the seed cafe in one go:

```bash
docker compose exec -T postgres psql -U sangam -d sangam <<'SQL'
INSERT INTO restaurant_tables (cafe_id, label, area, shape, seats, x, y, sort_order)
SELECT c.id, t.label, t.area, t.shape, t.seats, t.x, t.y, t.sort_order
FROM cafes c
CROSS JOIN (VALUES
  ('T1','Main Hall','square',4,120,120,0),
  ('T2','Main Hall','square',4,300,120,1),
  ('T3','Main Hall','round', 2,480,120,2),
  ('W1','Near Window','round',2,120,320,3),
  ('P1','Patio','square',6,300,320,4)
) AS t(label, area, shape, seats, x, y, sort_order)
WHERE c.slug = 'tapri-central'
ON CONFLICT (cafe_id, label) DO NOTHING;
SQL
```

Refresh the **Tables** screen and they'll appear.

---

## Automated tests (API)

The backend has a full test suite (routes + repositories, including tables and
table sessions). It runs against mocked repositories, so **no database is needed**:

```bash
pnpm --filter @sangam/api test
```

Type-check everything (web + api + shared packages):

```bash
pnpm -r typecheck
```
