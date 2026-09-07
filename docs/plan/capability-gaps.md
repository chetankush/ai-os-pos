# Capability gaps — Sangam vs a commercial Indian restaurant POS

The [gap register](gap-register.md) audits **what was built**. This document audits
**what was never started** — capabilities a commercial POS ships that are absent from
Sangam entirely, and were therefore invisible to an audit asking "is this flow wired
end to end?".

Ten domains were assessed against Petpooja, POSist, Rista, Torqus, Dotpe and UrbanPiper,
with presence in Sangam verified by reading the repo (guarding against substring false
positives — `gstr` matches `gstRateBp`, and the marketing site mentions "franchise").

**128 capabilities assessed: 108 absent, 20 partial. 28 are legally mandatory in India. 1,219 engineer-days to close them all.**

For scale: the correctness remediation plan is 187.5 days. Closing every capability gap
as well is roughly **six times that** — which is the honest measure of the distance to
incumbent parity, and the reason the tiering below matters more than the list.

---

## Verdict

### Distance to a sellable product

roughly 218 engineer-days — about 11 months for one engineer, or one solid quarter for three. That is the honest number, and it is much larger than the feature list suggests, because Sangam's problem is not breadth. It has table sessions, split tender, refunds, cash drawers, Z-reports, an audit log, two AI agents and a QR diner surface. What it does not have is the thin layer that makes any of it usable by a cafe that is not the founder.

Three clusters account for 60% of that 218 days, and they are the whole gap:

**1. Printing** — 40d. window.print() with a Chrome dialog is not a POS print path. Chrome on Android and iPad cannot silently print at all; 80mm is hardcoded in four files so a 58mm cafe gets the amounts column chopped off; and the print route is a server-rendered Next.js page, so during the daily internet drop the cashier's order goes into localStorage and the kitchen gets nothing while the cashier believes it went through. This is the gap that loses the demo before any other gap is reached.

**2. Tax Correctness** — ~50d. Sangam is printing GST invoices today that it must not print the way it prints them. buildOrder() never reads menuItems.gstRateBpOverride, so the per-item GST field is decorative and any cafe selling a bottle of water at 18% is issuing a non-compliant invoice. Refunds ship with no credit note, so output tax on every refunded bill stays payable out of the cafe's pocket. A three-month-old bill inside a filed GSTR-1 can be silently amended. And the only export is a day-end totals CSV, so a GST officer's demand for a period's invoices cannot be answered from the product at all.

**3. Identity And Messaging** — ~58d. verifyPin() exists with zero call sites, no route checks a role, and no order carries a staffId — so a cafe with three staff runs the whole shift on the owner's Supabase password and every void logs as the owner. And there is no messaging transport of any kind in the codebase; the QR checkout labels its field 'Phone (for order updates)' and never sends one.

### Distance to incumbent parity

another ~780 days on top, and Petpooja will add features faster than that. Do not attempt it. There is no version of this where a small team matches them.

### The finding that should reframe the roadmap

the four pillars are currently unbacked by the codebase, and each is cheap to back.
- **Settle** audits settlement statements for orders that do not exist in the product. orderSourceValues is literally ['counter','qr','phone'] — the aggregator, which is 40-70% of a metro cafe's covers and 70-90% of a cloud kitchen's, cannot be represented at all. Settle is a stateless CSV analyser bolted to the side. Order-level payout reconciliation (14d) is what turns it from a diagnostic into evidence, because aggregator desks issue credit notes against specific order IDs and reject aggregate arguments.
- **Pulse** cannot draw a line. Reports group by item, category or hour only — there is no 'day' grouping, so no trend and no comparison. And no cost data exists anywhere in the schema, so the demo question the founder's own analysis says a 2026 pitch must answer ('why was my food cost up 3% last week', docs/market-analysis.md:136) is unanswerable. Comparative periods (6d) plus a manual cost-per-dish field (6d) buys most of Pulse for twelve days, long before any recipe engine.
- **Sentry** has no actor. Nothing links an order to a person, the discount field is uncapped and ungated so any cashier can apply 100% off with the reason 'ok', and the audit log holds the events but nothing ranks them. Exception analytics is 6 days on a table that already exists.
- **Ai Waiter** reads dietary fields that cannot express Jain or no-onion-garlic, so it will confidently recommend food a large share of the target's customers cannot eat. Six days.

### Four dead modules

menuItemModifiers and menuModifierOptions exist in the schema with zero references anywhere in apps/api, apps/web or packages/types. inventoryRepo.decrementForOrder() has no caller. customersRepo.upsertFromOrder() has no caller, so the CRM table is empty in production. verifyPin() has no caller. The product reads as more complete than it is, including to its own author — any roadmap built from the schema rather than the call graph will underestimate the work by months.

### What to refuse, on the record

*~198 days bought back.*

- **All of** payroll — payroll runs, payslips, overtime at statutory rate, leave, labour registers, tronc (50d). Say 'we don't do payroll, use RazorpayX or Zoho Payroll.' Keep exactly one piece: the salary advance ledger (5d), because it is a cash-drawer feature — a ₹3,000 advance currently reads as an unexplained drawer shortage.
- **All of** procurement — GRN, purchase/vendor bill register, POs eventually (19-26d). Say 'your purchase side lives in Tally, we export into it.' Get cost data into Pulse via a manual rate card per raw material, which is a day, not a suite.
- ALL multi-outlet stock logistics — inter-outlet transfers, central-kitchen indent, delivery challans, e-way bills, batch production (57d). Never own an e-way-bill integration; that is a permanent compliance-maintenance commitment for the commissary operator who is not the customer.
- FRANCHISE ROYALTY (12d) — the strongest distribution channel a POS has in this market AND an enterprise motion incompatible with a ₹4k/month self-serve product. Refuse it as a feature; revisit only as a deliberate business-model change.
- **Retail Hardware** — weighing scales and sell-by-weight, EDC card-machine integration (24d). order_items.quantity is an integer, so sell-by-weight is not even expressible; the mithai counter is a different product, send it to Vyapar or Marg.
- 3PL DISPATCH, GIFT CARDS, THE AUTOMATIC OFFER RULES ENGINE (36d).

### The segment decision

cloud kitchens cannot be sold to until live aggregator ingestion lands, and that cluster is ~110 days plus Zomato/Swiggy partner onboarding, which is business development and not schedulable by engineering. Pick dine-in and counter-service cafes as the first segment, and ship only the cheap half of the aggregator work up front — the channel field (5d), the §9(5) tax treatment (9d) and manual aggregator order entry — so the Z-report is true and the cafe is not paying GST twice on Zomato sales. Then let the first paying customers fund the partner integration. Selling to cloud kitchens before ingestion exists means selling a POS that cannot see 80% of the customer's business, and 'multiple brands from one kitchen' (20d, currently parity-later) jumps straight to blocking the moment that decision reverses.

---

## Tiers

| Tier | Capabilities | Days | Meaning |
|---|---|---|---|
| 🔴 Blocks the first sale | 27 | 218 | A cafe will not buy, or cannot legally operate, without it. |
| 🟠 Blocks scale | 43 | 403 | Survivable for customer one or two; structurally broken by ~customer twenty. |
| 🟡 Parity, later | 40 | 375 | Incumbents ship it and it surfaces in deals, but it can wait. |
| ⚪ Deliberately out of scope | 17 | 198 | Refuse on the record. Point the customer elsewhere. |

### 🔴 Blocks the first sale — 218 days

A real Indian cafe cannot run a normal day of service on Sangam without these, or cannot legally issue the bills it is issuing. This is the gap between a convincing demo and a POS a cafe will pay ₹4k/month for. Note how much of it is not 'features' but wiring already-half-built things and closing legal holes the product currently opens: Sangam prints GST invoices today that it must not print the way it prints them.

- Direct ESC/POS printing over USB/LAN/Bluetooth (25d) — the single largest and most unavoidable item. window.print() with a Chrome dialog cannot run a counter at 200 covers, and Chrome on Android/iPad cannot silently print at all. This loses the demo before any other gap is reached.
- Printing when the internet is down (8d) — the print path navigates to a server-rendered Next.js route, so on an outage the cashier's order lands in localStorage and the kitchen gets NOTHING while the cashier believes it went through. Worse than having no offline mode. There is no apps/web/public, so no service worker exists to build on.
- Printer registry + 58mm/80mm format profiles (5d) — 80mm is hardcoded in four print files; a cafe on a 58mm printer gets the amounts column chopped off every bill, with no setting anywhere.
- Cash-drawer kick on settle (2d) — Sangam ships drawer sessions and a variance count with no physical control behind them. Cheapest item on this list and it makes the existing feature real.
- Rate-wise / HSN-wise tax computation and HSN summary (12d) — LEGALLY MANDATORY. Verified: buildOrder() never reads menuItems.gstRateBpOverride; the order carries one blended gstRateBp. Any cafe selling a bottle of water at 18% alongside food is printing a non-compliant tax invoice today. Blocking dependency for every other statutory item.
- Per-line GST across modifiers, combos and non-food lines — mixed vs composite supply (6d) — LEGALLY MANDATORY. Same defect at line granularity; also the gate on paid add-ons ever being priced correctly.
- GST credit notes for refunds, voids and post-sale discounts (7d) — LEGALLY MANDATORY. Sangam already ships split tender and refunds; the money goes back with no document, so output tax on the refunded bill stays payable out of the cafe's own pocket. Cheapest item relative to what it protects.
- Filed-period lock / books close (5d) — a three-month-old bill inside a filed GSTR-1 can be silently amended today. This is precisely the failure mode of the Petpooja GST episode the founder positions against, reproduced in his own product. 5 days to stop being the thing you are attacking.
- Statutory record retention: invoice-level export and tamper-evident archival (8d) — LEGALLY MANDATORY. The only export is a day-end totals CSV. A GST officer's demand for a period's invoices cannot be answered from the product, and the cafe's six-year legal record exists only as rows in Sangam's Postgres. 'Audit trail you can hand to an officer' is the chosen battleground; an append-only table with no hash chain and no export does not deliver it.
- Aggregator channel on the order data model (5d) — the enum is literally ['counter','qr','phone']. Cheap, no partner approval needed, and it is the precondition for the day-end report being true.
- Fulfilment order type on the order — dine-in / takeaway / delivery / pickup (7d) — LEGALLY MANDATORY, and every downstream operational number is blind without it.
- Section 9(5) ECO tax treatment for aggregator-channel orders (9d) — LEGALLY MANDATORY. Today keying a Zomato order in charges 5% GST on a supply the restaurant must not tax: the cafe pays tax twice, or files a GSTR-1 that will not reconcile with what Zomato reported. Ship this in the same PR as the channel field or do not ship the channel field.
- CMP-08 / GSTR-4 composition turnover statement (3d) — LEGALLY MANDATORY. Sangam already models composition correctly on the bill; it just cannot total the quarter. Three days, aimed at exactly the sub-₹1.5cr independent cafe the product targets.
- Staff terminal identity — PIN login and on-shift session (14d) — verified: verifyPin() exists at apps/api/src/lib/pin.ts with ZERO call sites, and no route checks a role. The only way a waiter can punch an order is to be handed the owner's Supabase password, which also hands over reports, pricing, expenses and void. The audit log then records the owner for actions the owner did not perform, which makes the product's differentiator a lie in production.
- Per-staff sales attribution — staffId on orders (10d) — no order, item or payment carries a person. Sentry does not exist without it, no incentive scheme is computable, and it is a schema change on the hot write path that only gets more expensive.
- Line-level discounts and comps with reason codes, role caps and discount reporting (8d) — any cashier can apply 100% off with the reason 'ok' and nothing objects. Cashier discount abuse is the most common cash leak in Indian restaurants and this is the widest-open door in the product.
- Void / cancellation / discount / comp exception analytics (6d) — the audit log already holds the events; nothing ranks them. Six days converts an existing table into the Sentry pillar and answers the most-run report in Indian POS deployments.
- Modifier groups and add-ons wired end to end (14d) — verified: menuItemModifiers and menuModifierOptions exist in the schema with ZERO references anywhere in apps/api, apps/web or packages/types. 'Extra gravy' can only go in free-text notes and adds ₹0. 8-15% of ticket, structurally uncollectable.
- Item variants / portion sizes — half/full, by weight, chai sizes (9d) — half-and-full is the default shape of an Indian menu. Without it the owner creates two unrelated items, doubling the menu and halving every top-seller row.
- Open / custom-priced counter item (3d) — anything not already on the menu cannot be billed, so cash goes off-book or the catalogue gets polluted forever. Off-book cash makes the audit trail worthless.
- Jain / no-onion-garlic and dietary tags beyond veg-vegan-egg (6d) — the AI Waiter reads these exact fields (apps/api/src/ai/waiter.ts) and will confidently recommend a dish a Jain diner cannot eat. This is wedge integrity, not menu polish, and it is six days.
- Customer recall at the point of sale — phone lookup and typeahead (5d) — verified: customersRepo.upsertFromOrder() has no caller from order creation, so the CRM table is empty in production. Nothing else in engagement works until identity does.
- Delivery address capture and customer address book (6d) — orders hold customerName and customerPhone only. A phone delivery order has literally nowhere to put an address; it goes on the KOT in pen.
- Outbound messaging: DLT-registered SMS + a WhatsApp BSP channel (16d) — verified: there is no messaging transport of any kind in the codebase, only a wa.me deep link inside Settle. The QR checkout labels its field 'Phone (for order updates)' and then never sends one — a promise broken in front of a paying diner. This is also the pipe the WhatsApp AI Waiter roadmap needs.
- Transactional customer notifications — order confirmed / ready / digital bill (7d) — for a cloud kitchen the order-ready message IS the customer interface, and the digital bill is the cheapest lawful way to build the customer database.
- Comparative periods (WoW/MoM/YoY) and a daily trend series (6d) — reports group by item, category or hour only; there is no 'day' grouping, so the product cannot draw a line of daily sales. You cannot sell a pillar called Pulse on a screen that shows one date at a time.
- Automated daily sales digest over WhatsApp (6d) — one-to-three-outlet Indian owners read WhatsApp at 11pm, they do not open dashboards. Six days on top of the messaging pipe, and it is the single cheapest defence against a ₹4k/month cancellation at renewal.

### 🟠 Blocks scale — 403 days

Survivable at customer one or two — a friendly design-partner cafe will tolerate the workaround — but structurally broken by roughly customer twenty, by the customer's second outlet, or by any cafe doing serious aggregator volume. This tier is also where the four pillars stop being claims: Settle only becomes evidence when orders match settlement lines, and Pulse only becomes an answer when cost data exists.

- Live aggregator order ingestion from Zomato/Swiggy partner APIs, into POS and KDS (32d) — 40-70% of a typical metro cafe's covers and 70-90% of a cloud kitchen's. Needs partner onboarding, which is business development, not engineering. Everything else in this cluster hangs off it.
- Item-level stock-out / auto-86 propagation across channels (8d) — the most-used aggregator integration feature in Indian restaurants; paneer runs out and Zomato keeps selling it, each rejection a penalty plus a ranking hit.
- Order accept / reject with food-prep-time commitment (8d) — missed accepts destroy in-app ranking for weeks, which costs far more than the orders.
- Outlet online/offline and rush-mode control from the POS (5d) — stopping the tap in seconds during a power cut or a 40-ticket backlog, instead of hunting a second tablet per platform.
- Consolidated multi-channel order queue and KDS channel routing (9d) — three tablets at the counter is the defining sight in an Indian cafe; the consolidated queue is usually the demo moment that closes the deal.
- Aggregator order ticket / KOT and packing-label printing with the platform's order number (5d) — a rider says 'Zomato 4821'; if the slip carries only Sangam's serial the packer hands over the wrong bag.
- Aggregator-initiated cancellation and refund handling into the POS (9d) — otherwise a cancelled order sits 'preparing' forever and stays in the day's revenue.
- Menu / catalogue push out to the aggregators (22d) — kills the triple-maintenance problem and is a genuine reason restaurants switch POS.
- Order-level payout reconciliation — POS orders matched to aggregator settlement lines (14d) — THE highest-leverage item in this tier. It upgrades Settle from a diagnostic into evidence: aggregator desks reject aggregate arguments and issue credit notes against specific order IDs. It also catches the category Settle structurally cannot see today (charged but never reached the kitchen).
- Aggregator sales as a first-class GST-classified revenue stream (10d) — LEGALLY MANDATORY once volume is real; the POS's turnover and the GSTN's view of it currently disagree by the entire delivery book.
- Channel-specific price lists — dine-in vs takeaway vs Zomato/Swiggy (10d) — one price per item means the menu is either underpriced on the aggregator or overpriced at the counter from day one. Also load-bearing for Settle: without a channel price you cannot compute what an order should have netted, so you cannot prove a deduction was wrong.
- GSTR-1 / GSTR-3B filing-ready export (14d) — LEGALLY MANDATORY. Deferred one tier only because a CA can rebuild the return from the rate-wise summary and invoice export shipped in tier one; by twenty customers, twenty CAs rebuilding it by hand is the churn mechanism.
- Tally Prime XML voucher export (10d) — 'does it talk to my Tally?' is asked on the first sales call and a 'no' ends it. The CA is the person who decides which POS the restaurant keeps. This is the first thing to build after the first sale.
- TCS / TDS credit ledger reconciled to GSTR-8 and Form 26AS (9d) — ₹8-10k/month withheld on an ₹8L/month delivery book, over a lakh a year simply never claimed. Settle currently files these lines under 'not recoverable', which is backwards: not disputable, but fully claimable. Pure on-wedge money.
- Marketing consent and opt-out ledger — DPDP + DND/NCPR (8d) — the exposure is the platform's, not just the cafe's, the moment a send button ships. Required before any campaign feature, not after.
- Raw-material / ingredient master with stock units (6d) — today a cafe can only enter '30 Paneer Tikkas', not '8 kg paneer', which is exactly why the stock module gets abandoned in week one.
- Recipe / BOM per dish, including portion variants and modifiers (10d) — the only bridge between a bill and the godown. Half-plate and 'extra butter' are most of the modifier traffic, not edge cases.
- Automatic raw-material consumption on sale (9d) — verified: inventoryRepo.decrementForOrder() exists and is never called from order creation, so even the finished-good decrement Sangam does have is dead code. Manual consumption entry is why these modules die; auto-deduction is the only version that survives a real kitchen.
- Unit conversion between purchase, stock and recipe units (5d) — tin, peti, bori, crate. A 1000x gram/kg error silently corrupts every food-cost number the AI Manager is later asked to explain.
- Wastage, spoilage, staff-meal and complimentary consumption register (4d) — LEGALLY MANDATORY (named explicitly in the CGST rules). Without a write-off path, every spoiled litre of milk reads as theft, variance becomes noise, and genuine pilferage hides inside it.
- Food cost and margin per dish, ideal vs actual (8d) — this is the demo question the founder's own market analysis says a 2026 pitch must answer ('why was my food cost up 3% last week', docs/market-analysis.md:136) and the AI Manager cannot answer it because no cost data exists anywhere in the schema.
- Item-level cost price and gross-margin reporting (6d) — build this FIRST as a manual cost-per-dish field; it delivers most of Pulse's value without waiting for the recipe engine. Today 'top items' ranks by revenue, so it recommends the ₹280 tikka at 42% food cost over the ₹120 chai at 12%.
- Recipe BOM theoretical-vs-actual stock variance (20d) — the full version; 20kg of paneer can currently walk out and nothing registers.
- Wastage / spoilage report (5d) — ₹15-20k/month leaking into the bin, currently invisible, currently blamed on 'slow sales'.
- Indic-script receipt printing — Devanagari / Tamil / Bengali (6d) — a kitchen in Indore cannot read '???? ????'. Must be DECIDED alongside the ESC/POS renderer even if shipped later, because raster mode changes the print architecture.
- Multiple kitchen printers with per-station KOT routing (8d) — one undivided KOT makes Sangam sellable only to a single-counter kiosk; tandoor, wok and chai counter are separate stations in any cafe past one hot line.
- Token / queue display for QSR and pickup windows (7d) — the standard operating model of a large slice of the target. Today the only order identifier is a gapless GST invoice serial nobody will shout across a food court.
- Label printing for packaging and delivery (6d) — prevents the wrong-item chargeback that Settle then has to claw back. Shipping the prevention is on-strategy.
- Post-meal feedback capture with review routing (10d) — Google and Zomato ratings are the top of a small cafe's acquisition funnel, and this is the only customer-side signal Pulse could ever have.
- Per-outlet user access grants with a role per outlet (18d) — the chain case: today an area manager can only be given the master account, which also lets him edit the GSTIN and see every outlet's cash.
- One login spanning outlets — in-app outlet switcher and a group home (3d) — the mechanism exists but takes six clicks per outlet during a dinner rush. Three days.
- Central master menu and price push to outlets (22d) — a missed outlet keeps selling chai at last month's price for weeks; a missed HSN or GST correction prints wrong tax on every bill until someone notices.
- Consolidated cross-outlet reporting (12d) — the 3-10 outlet chain owner is the archetype the founder's own analysis names as best-fit, and the console is the one thing not built. Today he opens three browser tabs and a notebook.
- Per-outlet invoice series and document numbering (4d) — LEGALLY MANDATORY. Two outlets on one GSTIN both mint INV/2026-27/000001 and collide at GSTR-1 upload. Four days, and it bites the day a customer opens their second shop.
- Cross-outlet customer identity (8d) — customers are keyed on (cafeId, phone), so a loyal multi-outlet diner reads as several one-time visitors and every retention number is understated.
- New-outlet setup by cloning an existing outlet (5d) — there is no menu export, so a second outlet means re-keying 120 items by hand on install morning, which is where HSN codes get dropped. Expanding is also exactly when a chain shops for a competitor.
- Cash-on-delivery reconciliation with the rider (6d) — the drawer's 'expected' figure can never reconcile while several thousand rupees are in a rider's pocket, which makes the existing variance feature meaningless for any cafe doing its own delivery.
- Employee master record — wage rate, joining date, bank, ID (5d) — name+role is not enough to pay anyone or answer a labour inspector. Prerequisite for the advance ledger.
- Salary advance ledger / staff udhaar (5d) — keep this even while refusing payroll: it is a CASH DRAWER feature, not an HR feature. A ₹3,000 advance currently shows up as an unexplained drawer shortage, and docs/plan/day-close.md:17 already names 'staff repays an advance' as a pay-in reason with no ledger behind it.
- Staff and shift performance analytics (9d) — waiter-wise sales is how Indian dine-in cafes set incentives and cashier-wise variance is how a ₹600 short gets pinned to a person instead of poisoning the team.
- Customer cohort, repeat-rate and lapsed-customer analytics (8d) — the phone numbers at QR and counter are the only first-party customer data an Indian cafe owns, and repeat rate is what tells the owner whether aggregators are renting him customers or building him a base.
- Channel P&L — dine-in vs QR vs aggregator, net of commission (10d) — 'am I actually making money on Zomato?' is the question the entire Settle wedge claims to answer, and today Settle is a stateless CSV analyser that never touches an order. This report is where the two halves finally join.
- Period P&L and prime-cost reporting (5d) — expenses live on one screen, revenue on another, joined only for today. Prime cost above ~65% means the cafe is dying, and the owner currently finds out when the rent cheque bounces.

### 🟡 Parity, later — 375 days

Petpooja/POSist/Rista have these and they will surface in competitive deals, but no cafe churns over them this quarter and none of them is load-bearing for AI Waiter, Settle, Pulse or Sentry. Build on demand, driven by a specific named prospect, not by a feature-comparison grid. Several are cheap (4-8d) and can be picked up opportunistically once their dependencies exist.

- ONDC sell-side network participant flow (25d) — the founder's own analysis calls it a table stake, but volume is thin outside a few metros. Lowest urgency in the aggregator domain by a wide margin.
- Rider / delivery-partner status tracking on aggregator orders (6d) — prevents late-dispatch penalties, but only reachable after live ingestion lands.
- Vendor / supplier master with GSTIN, credit terms and a payables ledger (8d) — 'how much do I owe the sabziwala this week' is a genuinely valuable question, but it is the CA's software's question first.
- Purchase orders to vendors (7d)
- Physical stock take with system-vs-physical variance (6d) — the instrument that actually measures theft, but pointless before recipes exist to compare against.
- Stock ledger — append-only movement history per material (7d) — the right long-term answer for the audit-trail story, but only once there are materials to move.
- Reorder levels and pushed low-stock alerts (6d) — the flag exists; the delivery transport does not. Cheap once the messaging pipe is live.
- Batch, expiry and FIFO for perishables (7d)
- GST e-invoicing — IRN via the IRP with signed QR (20d) — LEGALLY MANDATORY above ₹5cr, which is a hard ceiling on who Sangam can sell to at all. Build it the quarter you decide to move upmarket, not before; small cafes are under the threshold. Note Sangam already collects and prints customerGstin, which is exactly the invoice that will need an IRN.
- Zoho Books / cloud accounting sync (9d) — the younger cloud-kitchen operator's default. Second after Tally, not instead of it.
- B2B recipient master, place of supply and IGST (7d) — restaurant service is almost always intra-state, so the hardcoded CGST/SGST split usually holds; it breaks on corporate catering billed out of state and on the ₹50,000 unregistered-recipient rule at large party bookings.
- Combo / meal deals with component explosion (12d) — a thali bills correctly as a flat item; only stock depletion and the item-sales report suffer. Revisit when recipes exist.
- Day-parted menus and time-window item availability (8d) — the manual toggle works at 40 items. The real risk is a diner paying via Razorpay at 21:00 for a breakfast item, which is a refund and an apology.
- Happy-hour and time-based price rules (5d)
- Coupon and promo codes with redemption limits (11d)
- Coupon / promo engine with rules and redemption tracking, CRM side (11d) — same build as the line above; do it once.
- Barcode scanning at the counter (5d) — needed for the bakery/QSR-retail hybrid, which is a segment decision rather than a feature decision.
- Customer-facing / pole display (6d)
- Loyalty points programme with earn/burn and tiers (20d) — asked on the first sales call, and the honest answer for now is Reelo or EasyRewardz alongside. Twenty days is too much to spend before the customer table is even populated.
- Prepaid wallet / store credit (11d)
- Campaign manager — segment, template, schedule, send, attribution (14d) — requires the consent ledger first; without rupee attribution the owner cancels it at the first cost review anyway.
- Birthday and anniversary marketing (5d) — cheap and high-converting, but there is nowhere to store a date of birth yet.
- Table reservations with confirmation and no-show tracking (16d) — the floor plan and session model already exist, so only the forward-looking layer is missing; but small Indian cafes are walk-in dominated.
- Walk-in waitlist / queue with notify-when-ready (9d)
- Customer segmentation and RFM analytics (10d)
- Multiple brands from one kitchen — virtual cloud-kitchen brands (20d) — this is the DEFAULT operating model for Indian cloud kitchens, so it is only parity-later because the cloud-kitchen segment itself is being deferred. If that decision reverses, this and live ingestion both jump to blocks-first-sale.
- Rider assignment, dispatch board and delivery lifecycle status (12d)
- Delivery zones and distance-based delivery charges (8d)
- Rider roster with vehicle and compliance records (5d)
- Scheduled / pre-orders with delivery and pickup slots (7d)
- Packaging charge rules per channel and per item (4d) — the calculation is already sound; only the rules engine is missing, and it needs the order-type field first.
- Customer-facing delivery tracking link and status notifications (9d) — cheap once the messaging pipe exists; kills the 'where is my order' call that interrupts the counter between 8 and 10pm.
- Shift definitions and weekly duty roster (12d)
- Clock-in / clock-out attendance with manager correction (10d) — genuinely the biggest monthly argument in an Indian cafe, but a POS is not where the attendance register legally must live. Revisit only if the tip/incentive story becomes a selling point.
- Tip capture on the bill, cash and digital (7d) — a digital tip currently lands in the owner's account and is booked as revenue with no liability recorded. Worth fixing eventually; not a purchase driver.
- Labour cost as a percentage of sales (4d)
- Menu engineering matrix — stars / plough-horses / puzzles / dogs (5d) — five days once cost-per-dish exists, and a strong AI Manager talking point.
- Day-part weekday × hour demand heat map (5d) — the hour view exists for a single chosen day; making it a weekday × hour matrix is small and directly informs prep.
- Covers, APC and table turnaround analytics (6d) — APC is the number Indian restaurateurs quote to each other, and Sangam already captures party size at the table and discards it.
- Sales forecasting and prep-quantity prediction (10d) — the most credible AI feature available to attach to the positioning, but it needs a year of clean channel-complete history first. Building it on today's partial data would produce confident wrong numbers, which is worse than nothing for an AI-native brand.

### ⚪ Deliberately out of scope — 198 days

Refuse these on the record. Each is a real thing incumbents ship, and each is a distinct product with its own regulatory maintenance burden that a small team cannot carry alongside a POS. Say 'we integrate, we don't rebuild' and name the alternative in the sales call — an explicit, confident 'we don't do payroll, here is who does' reads as focus; a vague 'coming soon' reads as a hole. Roughly 200 engineer-days of refusal, which is most of a year bought back.

- Payroll run and payslip generation (20d) — USE INSTEAD: RazorpayX Payroll, Zoho Payroll or Keka. ESI/PF thresholds, statutory rate changes and payslip formats are a permanent maintenance tax on a two-person team, for a module that touches money Sangam has no other reason to touch.
- Overtime capture and computation at statutory rate (6d) — USE INSTEAD: the same payroll software. Feed it hours later if attendance is ever built; do not own the statutory-rate logic.
- Leave, weekly-off and holiday management (9d) — USE INSTEAD: payroll software, or the WhatsApp group that already runs it.
- Statutory labour register export — muster roll, wage, OT (7d) — USE INSTEAD: the payroll vendor or the CA. Tempting because 'immutable register' transfers from GST to labour, but it is downstream of three other things being refused, so the story cannot be told anyway.
- Tip pooling and distribution / tronc (8d) — USE INSTEAD: the senior waiter's split, unchanged. Real staff resentment, but eight days plus an attendance dependency for a problem eight people solve verbally at closing.
- Goods receipt (GRN) / purchase invoice entry with GST breakup (9d) — USE INSTEAD: Tally, Zoho Books or Vyapar, where the CA already sits. Get cost data into Pulse via a MANUAL RATE CARD per raw material instead — that is a day of work and delivers the food-cost number without building a procurement suite.
- Purchase / vendor bill register with GSTIN, HSN, rate and ITC eligibility (10d) — USE INSTEAD: Tally/Zoho. The inward half of the GST return is the accounting system's job, not the POS's. Sangam should export outward supplies into it, not duplicate it.
- Stock transfer between outlets / central kitchen with delivery challan (12d) — USE INSTEAD: Tally/Zoho for the challan, the GST portal for the e-way bill.
- Delivery challan and e-way bill for stock movement (12d) — USE INSTEAD: the GST portal or the CA's software. Real roadside enforcement risk, but it belongs to the multi-outlet commissary operator who is not the target customer, and building an e-way-bill integration is a compliance-maintenance commitment forever.
- Inter-outlet stock transfer and central-kitchen indent (25d) — USE INSTEAD: nothing in Sangam; the chain runs it in Tally. Twenty-five days that only pays off after the entire raw-material stack exists.
- Semi-finished / batch production, central prep (8d) — USE INSTEAD: flatten shared gravies into each dish's BOM and accept that gravy over-production stays invisible. Correct modelling is genuinely better; it is not better enough to fund.
- Franchise royalty computation and franchisee statements (12d) — USE INSTEAD: a spreadsheet, which is what franchisors use. This is the strongest distribution channel a POS has in this market AND the wrong customer for a ₹4k/month self-serve product. It is an enterprise motion with enterprise sales cycles. Revisit only as a deliberate business-model change, never as a feature.
- Automatic offer rules engine, item and bill level (14d) — USE INSTEAD: reason-coded manual discounts (funded in tier one) plus the aggregators' own offer engines, where most discounting actually happens. BOGO needs a ₹0 line that does not distort taxable value — real complexity for a marginal gain.
- Gift cards / prepaid vouchers (10d) — USE INSTEAD: Reelo/Zaggle, or paper. Seasonal revenue, fiddly GST at issuance vs redemption, and a liability the product would then have to carry on its books.
- Weighing-scale integration and sell-by-weight items (12d) — USE INSTEAD: a retail POS (Vyapar, Marg, GoFrugal) for the mithai or namkeen counter. Note the structural blocker: order_items.quantity is an integer, so 0.25 kg is not even expressible; this is a different product, not a missing feature.
- EDC card-machine integration with amount push (12d) — USE INSTEAD: the Pine Labs or Razorpay terminal as a separate device, as today. Small Indian cafes are UPI-first and card is a shrinking share of this segment's tender mix; twelve days of acquirer integration buys reconciliation for the smallest tender.
- Third-party logistics dispatch — Porter / Shadowfax / Borzo / Pidge (12d) — USE INSTEAD: the Porter app directly, with the trip fee entered as an expense. Only reconsider if own-fleet delivery becomes a segment Sangam actively sells to; today it is a per-partner integration treadmill.

---

## Legally mandatory in India

These are not competitive features. Operating without them is a compliance exposure.

| Capability | Domain | Days |
|---|---|---|
| GST e-invoicing — IRN generation via the IRP with signed QR on the invoice | Statutory compliance & accounting integration | 20 |
| Payroll run and payslip generation | Workforce: attendance, payroll, tips | 20 |
| Outbound messaging infrastructure: DLT-registered SMS and a WhatsApp BSP channel | Customer engagement: loyalty, feedback, reservations | 16 |
| GSTR-1 / GSTR-3B filing-ready export | Statutory compliance & accounting integration | 14 |
| Rate-wise / HSN-wise tax computation and HSN summary report | Statutory compliance & accounting integration | 12 |
| Delivery challan and e-way bill for stock movement | Statutory compliance & accounting integration | 12 |
| Aggregator (Zomato/Swiggy) sales as a first-class, GST-classified revenue stream | Statutory compliance & accounting integration | 10 |
| Purchase / vendor bill register with GSTIN, HSN, rate and ITC eligibility | Statutory compliance & accounting integration | 10 |
| Clock-in / clock-out attendance with manager correction | Workforce: attendance, payroll, tips | 10 |
| Section 9(5) ECO tax treatment for aggregator-channel orders | Aggregator integration | 9 |
| Automatic raw-material consumption on sale | Inventory, recipes & supply chain | 9 |
| Goods receipt (GRN) / purchase invoice entry with GST breakup | Inventory, recipes & supply chain | 9 |
| Leave, weekly-off and holiday management | Workforce: attendance, payroll, tips | 9 |
| Vendor / supplier master with GSTIN, credit terms and payables ledger | Inventory, recipes & supply chain | 8 |
| Statutory record retention and tamper-evident archival | Statutory compliance & accounting integration | 8 |
| Marketing consent and opt-out ledger (DPDP + DND/NCPR) | Customer engagement: loyalty, feedback, reservations | 8 |
| Stock ledger — append-only movement history per material | Inventory, recipes & supply chain | 7 |
| GST credit notes for refunds, voids and post-sale discounts | Statutory compliance & accounting integration | 7 |
| B2B recipient master, place of supply and IGST (inter-state) handling | Statutory compliance & accounting integration | 7 |
| Fulfilment order type on the order (dine-in / takeaway / delivery / pickup / aggregator channel) | Delivery & order fulfilment | 7 |
| Statutory labour register export (muster roll, wage register, OT register) | Workforce: attendance, payroll, tips | 7 |
| Per-line GST across modifiers, combos and non-food lines (mixed vs composite supply) | Menu merchandising: modifiers, combos, offers, pricing | 6 |
| Menu labelling: Jain / dietary tags beyond veg-non-veg, plus allergen and calorie declaration | Menu merchandising: modifiers, combos, offers, pricing | 6 |
| Overtime capture and computation at statutory rate | Workforce: attendance, payroll, tips | 6 |
| Salary advance ledger (staff 'udhaar') | Workforce: attendance, payroll, tips | 5 |
| Wastage, spoilage, staff-meal and complimentary consumption register | Inventory, recipes & supply chain | 4 |
| Per-outlet invoice series and document numbering | Multi-outlet, chain & franchise | 4 |
| Composition-dealer turnover statement for CMP-08 / GSTR-4 | Statutory compliance & accounting integration | 3 |

---

## By domain

| Domain | Capabilities | Days to close |
|---|---|---|
| [Aggregator integration (Zomato / Swiggy order flow)](#aggregator-integration-zomato-swiggy-order-flow) | 13 | 157 |
| [Inventory, recipes & supply chain](#inventory-recipes-supply-chain) | 15 | 112 |
| [Statutory compliance & accounting integration (India: GST e-invoicing, GSTR filing data, e-way bill, Tally/Zoho, TCS/TDS on aggregator payouts, HSN reporting, credit notes, record retention)](#statutory-compliance-accounting-integration-india-gst-e-invoicing-gstr-filing-data-e-way-bill-tallyzoho-tcstds-on-aggregator-payouts-hsn-reporting-credit-notes-record-retention) | 14 | 136 |
| [Menu merchandising: modifiers, combos, offers, pricing](#menu-merchandising-modifiers-combos-offers-pricing) | 12 | 106 |
| [Hardware & peripherals](#hardware-peripherals) | 12 | 102 |
| [Customer engagement: loyalty, feedback, reservations](#customer-engagement-loyalty-feedback-reservations) | 14 | 152 |
| [Multi-outlet, chain & franchise](#multi-outlet-chain-franchise) | 10 | 129 |
| [Delivery & order fulfilment](#delivery-order-fulfilment) | 11 | 101 |
| [Workforce: attendance, payroll, tips](#workforce-attendance-payroll-tips) | 13 | 117 |
| [Analytics & business intelligence depth](#analytics-business-intelligence-depth) | 14 | 107 |

## Aggregator integration (Zomato / Swiggy order flow)

Sangam has zero aggregator order-flow capability — not partial, not stubbed, absent at the schema level. `orderSourceValues = ['counter','qr','phone']` (packages/db/src/schema/orders.ts:25) means a Zomato order cannot even be represented in the database, let alone ingested. There is no webhook receiver anywhere in the API (`grep -rn "webhook" --include="*.ts" apps packages` → 0 hits), no outbound integration client beyond Razorpay and the LLM provider, no job queue or retry infrastructure (`grep -rn "bullmq|pg-boss|cron"` → 0 hits), and no external-order-id or idempotency field on orders. "Settle" is a manual paste-a-CSV analyzer of period-level aggregates (apps/api/src/routes/settle.ts:6-24 takes periodStart/periodEnd/orderCount/grossSalesRupees/deductionsCsv) — it never sees an order, so it is post-hoc statement forensics, not order flow, and it cannot produce the order-level evidence that actually wins an aggregator dispute. The sharpest illustration: apps/api/src/settle/classifier.ts:49 already classifies "Late dispatch fine" as a penalty deduction — the product diagnoses a symptom it has no rider-status or accept/reject plumbing to prevent. Strategic note: UrbanPiper is the middleware most Indian POS vendors (Petpooja, POSist among them) integrate rather than building two partner-API integrations themselves; buying that layer would collapse items 2, 3, 4, 5, 6, 9 and 10 below from roughly 73 engineer-days to something closer to 25.

### Live order ingestion from Zomato / Swiggy partner APIs

❌ absent · 32d

A signed webhook receiver plus polling fallback that accepts orders pushed by the Zomato Partner API and Swiggy Partner API, verifies the signature, dedupes replays, resolves each aggregator line item to a Sangam menu item via a mapping table, constructs the order, fires the KOT and deducts inventory — with a retry queue and a dead-letter view for orders that fail to map.

**Why it matters.** Without it, a staff member re-keys every Zomato order from a separate partner tablet into the POS by hand at peak hour, or (what actually happens) does not bother — so POS sales under-report actual sales, stock counts drift until the physical count is meaningless, and the owner cannot answer 'what did I sell today'. Manual re-keying at 40 orders/hour is also where wrong-item errors come from.

**Evidence.** `grep -rn "webhook" --include="*.ts" --include="*.tsx" apps packages` → 0 hits. Only outbound HTTP callers in the API are apps/api/src/payments/razorpay.ts:38, apps/api/src/ai/waiter.ts:73, apps/api/src/ai/agent.ts:65 and apps/api/src/routes/uploads.ts:44. `grep -rn "bullmq|pg-boss|cron|worker"` finds no job/queue infrastructure to retry a failed ingest.

**Who ships it.** Petpooja, POSist, Rista, Torqus, Ciferon, UrbanPiper (the middleware most of them actually resell)

### ONDC sell-side (network participant) order flow

❌ absent · 25d

Listing the outlet's catalogue on the ONDC network and receiving ONDC orders through a seller-app network participant, using the ONDC retail/F&B protocol (search, select, init, confirm, status, cancel).

**Why it matters.** ONDC's commission is materially below Zomato and Swiggy, so it is the only structural answer a restaurant has to a 22-28% take rate, and Indian POS vendors now advertise it as a differentiator. Order volume is still thin outside a few metros, so this is the lowest-urgency item in this domain — worth listing because the founder's own market analysis names it a table stake, not because a cafe will churn over it this quarter.

**Evidence.** `grep -rn "ONDC|ondc" --include="*.ts" --include="*.tsx" apps packages` → 0 hits in code; the only matches repo-wide are docs/market-analysis.md:127 (which lists it as a table stake) and docs/deep-research-brief.md:61.

**Who ships it.** Petpooja, Rista, Ciferon, Dotpe, magicpin (as a seller NP)

### Menu / catalogue push out to the aggregators

❌ absent · 22d

One-way publish of categories, items, prices, descriptions, veg/non-veg marker, images, variants and add-on groups from Sangam to the Zomato and Swiggy catalogues, plus the item-ID mapping table that ties an aggregator listing back to a Sangam menu item (including matching 'Paneer Butter Masala [Full]' to a Sangam item plus variant).

**Why it matters.** Today the owner maintains the same menu three times — in Sangam, in the Zomato partner portal and in the Swiggy partner portal. A price rise entered in Sangam never reaches the aggregators, so the platform keeps selling at last month's price and the restaurant absorbs the difference on every order. Menu edits made through aggregator support tickets can take 24-48 hours; a POS that publishes directly is the reason restaurants pick one POS over another.

**Evidence.** apps/api/src/menu/import.ts is CSV import INTO Sangam only (inbound, header `category,name,price,description,veg,spice`); there is no outbound counterpart. `grep -rin "zomato|swiggy" --include="*.ts" --include="*.tsx" apps packages` matches only the Settle module (apps/api/src/settle/*, apps/api/src/routes/settle.ts:8), the Settle types block (packages/types/src/domain.ts:291) and marketing copy.

**Who ships it.** Petpooja, POSist, Rista, Torqus, UrbanPiper

### Order-level payout reconciliation (POS orders matched to aggregator settlement lines)

❌ absent · 14d

Matching each ingested aggregator order to its line in the settlement file, so the system can say 'order 4821 was charged 24% commission against your contracted 22%' or 'you were charged a cancellation fee on seven orders the POS never received'. This is the order-level upgrade of the existing Settle, which today works only on period aggregates.

**Why it matters.** Aggregator support desks reject aggregate arguments — 'your take rate looks high this month' goes nowhere. What gets a credit note issued is a list of specific order IDs with the specific rupee discrepancy on each. Order-level matching also catches the deduction category Settle structurally cannot see today: orders that were charged for but never reached the kitchen. This is the highest-leverage item here because it upgrades the founder's own wedge from a diagnostic into evidence.

**Evidence.** Settle is explicitly statement-level: apps/api/src/routes/settle.ts:6-24 accepts only platform, periodStart, periodEnd, orderCount, grossSalesRupees, netPayoutRupees and a pasted `deductionsCsv`. packages/types/src/domain.ts SettleStatement carries `deductions: SettleDeduction[]` where each deduction is {category, label, amountPaise} — a bare label and amount, with no order reference anywhere in the type. `grep -rn "orderId" apps/api/src/settle/` → 0 hits.

**Who ships it.** Petpooja (Reconciliation), Rista, POSist; specialist tools Kitchen Ops and DotPe reconciliation

### Consolidated multi-channel order queue and KDS channel routing

🟡 partial · 9d

One order list and one kitchen display showing dine-in, QR, phone, Zomato and Swiggy tickets together, colour-coded and filterable by channel, with per-channel audible alerts and the ability to route an aggregator ticket to a specific kitchen station or printer.

**Why it matters.** The defining sight at an Indian cafe counter is three tablets — Zomato, Swiggy, POS — with one person's attention split between them. Orders get missed at peak precisely because nothing shows them in one place. A consolidated queue is usually the demo moment that closes the sale.

**Evidence.** The screens exist but have no channel dimension. apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:261 renders `{ticket.source}` as plain capitalised text — but source can only ever be counter/qr/phone. The order list at apps/web/src/app/cafes/[id]/orders/page.tsx:96 displays only `tableLabel` and never source, and offers no channel filter; apps/api/src/repositories/orders.ts:218 lists active orders by status alone.

**Who ships it.** Petpooja, POSist, Rista, Torqus, Ciferon

### Aggregator-initiated cancellation and refund handling into the POS

❌ absent · 9d

Ingesting platform-side cancellations and partial refunds — customer cancelled, rider unavailable, item unavailable, quality complaint — to void or amend the POS order, reverse the inventory deduction, record a structured cancellation reason, and mark whether the restaurant or the platform bears the food cost.

**Why it matters.** A Zomato order cancelled after the KOT fired stays 'preparing' on the kitchen screen forever and stays counted in the day's sales, so the Z-report overstates revenue and the physical stock count no longer matches the system. Structured cancellation reasons are also the raw material for disputing a cancellation deduction later — without them the restaurant is arguing from memory.

**Evidence.** `grep -rn "cancelReason|cancellationReason|voidReason" --include="*.ts" apps packages` → 0 hits. packages/db/src/schema/orders.ts:16-23 has a bare `cancelled` status with no reason, liability or source-of-cancellation field, and apps/api/src/repositories/orders.ts:269 `updateStatus` takes only (id, cafeId, status, paymentMethod).

**Who ships it.** Petpooja, POSist, Rista, Torqus

### Section 9(5) ECO tax treatment for aggregator-channel orders

❌ absent · 9d · **legally mandatory**

Suppressing output GST on orders supplied through an e-commerce operator (the ECO pays it under section 9(5) CGST, per Notification 17/2021-CT(R) effective 1 Jan 2022), while still capturing those sales as reportable outward supplies so they appear correctly in GSTR-1 (supplies made through an ECO u/s 9(5)) and in the GSTR-3B row for supplies on which the ECO pays tax. Threshold: applies to every GST-registered restaurant supplying restaurant service through Zomato/Swiggy — there is no turnover threshold above the ordinary GST registration limit (₹20 lakh, ₹10 lakh in special-category states).

**Why it matters.** Sangam applies the cafe's GST mode unconditionally to every order, so the moment an aggregator order is entered it computes 5% GST on a supply the restaurant must not tax — the restaurant either pays tax twice on the same sale or files a GSTR-1 that does not reconcile with what Zomato reported for the same period, which is exactly the mismatch that triggers a departmental notice. Conversely, omitting the orders entirely under-reports turnover.

**Evidence.** apps/api/src/orders/build.ts:173 does `const gstRateBp = gstRateBpFor(cafe.gstMode)` with no channel branch; `gstRateBpFor` at build.ts:117-125 switches only on regular_5 / regular_18 / composition / exempt. `grep -rn "9(5)|section 9|ECO|ecommerce operator" --include="*.ts" apps packages` → 0 hits.

**Who ships it.** Petpooja, POSist, Rista, Torqus — standard in Indian POS since Jan 2022

### Order accept / reject with food-preparation-time commitment

❌ absent · 8d

The acknowledge step both platforms require: accept the order within the platform's window (typically well under a minute before auto-cancel), confirm or extend the preparation time, or reject with a structured reason (item unavailable, kitchen at capacity, closing early) — surfaced on the POS and KDS with an audible alert and a countdown.

**Why it matters.** Unacknowledged orders are auto-cancelled by the platform and counted against the outlet's order-acceptance rate, which directly drives search ranking inside the app and triggers the cancellation and late-dispatch penalties that get deducted from the payout. An outlet that misses accepts during the 8pm rush loses ranking for weeks, which costs far more than the individual orders.

**Evidence.** `grep -rn "prepTime|prep_time|acceptOrder|rejectOrder" --include="*.ts" --include="*.tsx" apps packages` → 0 hits; the only 'accept'/'reject' matches are HTML file-input `accept` attributes (apps/web/src/components/ui/image-upload.tsx:75) and Promise rejection handling. Order status transitions in packages/db/src/schema/orders.ts:16-23 go pending→preparing→ready→completed/cancelled with no acknowledgement state.

**Who ships it.** Petpooja, POSist, Rista, Dotpe, UrbanPiper

### Item-level stock-out (auto-86) propagation across channels

🟡 partial · 8d

Toggling an item out of stock in Sangam immediately marks it unavailable on Zomato and Swiggy, and turns it back on when restocked — including automatic 86 when a tracked stock count hits zero, with per-channel state and retry so a failed push is visible rather than silent.

**Why it matters.** This is the single most-used aggregator integration feature in Indian restaurants. Paneer runs out at 8pm; staff switch it off in the POS but Zomato keeps selling it, so every subsequent order must be rejected or part-cancelled — each one a penalty deduction, a one-star rating and a ranking hit. The alternative is a staff member holding two tablets and toggling the item off in three places.

**Evidence.** The local half exists and the propagation half does not: packages/db/src/schema/menu.ts:58 has `isAvailable`, packages/db/src/schema/inventory.ts:17-25 has `menu_item_stock` with `stockQty`, but nothing consumes either to push outward — `grep -rn "webhook|sync|propagat" --include="*.ts" apps/api/src` finds no publisher, and apps/api/src/repositories/inventory.ts has no external side effect.

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe, UrbanPiper

### Rider / delivery-partner status tracking

❌ absent · 6d

Ingesting rider lifecycle events from the platform — rider assigned, rider arriving, rider at outlet, order picked up — and surfacing them on the KDS so the kitchen fires the dish against the rider's ETA rather than against order-receipt time.

**Why it matters.** Either the food sits under a heat lamp going cold while nobody comes, or the rider stands waiting twelve minutes — and rider wait time is measured by the platform and converted into late-dispatch penalties deducted from the payout. Sangam already reads those penalties on the way out and cannot prevent them on the way in.

**Evidence.** `grep -rn "rider|deliveryPartner|dispatch|pickedUp" --include="*.ts" --include="*.tsx" apps packages` returns exactly one hit — apps/api/src/settle/classifier.ts:49, a keyword list ('deliver','fulfil','logistics','rider','last mile') used to bucket settlement deduction labels after the fact. The KDS timer at kitchen-board.tsx:236 counts from `createdAt` only, with no rider ETA input.

**Who ships it.** Petpooja, POSist, Rista, UrbanPiper

### Aggregator channel on the order data model

❌ absent · 5d

An order `source`/channel that can be 'zomato' or 'swiggy', plus the fields every aggregator order carries: the platform's own order ID (the number the rider and the customer quote), platform outlet ID, prepaid-vs-COD flag, packaging/cutlery instructions, and a per-order commission snapshot. This is the schema substrate everything else in this domain sits on.

**Why it matters.** For a cloud kitchen, 60-100% of revenue arrives via Zomato and Swiggy. Today those orders cannot be recorded in Sangam at all, so the Z-report, the day-end cash-up, the inventory depletion and the GST filing all describe a fraction of the business. The owner runs the POS for counter sales and reads the aggregator tablets for the rest, and nothing reconciles.

**Evidence.** packages/db/src/schema/orders.ts:25 hardcodes `orderSourceValues = ['counter','qr','phone']`; apps/api/src/repositories/orders.ts:26 repeats the same closed union. `grep -rn "externalId|external_id|platformOrderId" --include="*.ts" apps packages` returns only apps/web/src/lib/offline-queue.ts (a client-side idempotency key, unrelated).

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe, UrbanPiper — every Indian POS with an aggregator story

### Outlet online / offline (rush mode, scheduled shutdown) control from the POS

❌ absent · 5d

Take the outlet offline on Zomato and Swiggy from inside Sangam — immediately, or for a fixed window ('offline 30 minutes'), or on a schedule for a holiday — and bring it back, with the current per-platform online state visible on the dashboard.

**Why it matters.** Power cut, gas cylinder finished, chef walked out, or the kitchen is simply 40 tickets deep — the restaurant must stop the tap in seconds. Today that means finding the right partner app on a separate tablet and logging in, per platform. Orders that land while the kitchen cannot cook them get rejected, and rejection rate is the metric that destroys in-app ranking.

**Evidence.** `grep -rn "storeStatus|isOpen|outletStatus|goOffline|holidayMode|snooze|shutdown" --include="*.ts" --include="*.tsx" apps packages` → 0 hits. packages/db/src/schema/cafes.ts has no open/closed or trading-hours state at all; the only toggles are `onlinePaymentEnabled` and `qrPrepaidRequired` (cafes.ts:41-42).

**Who ships it.** Petpooja, POSist, Rista, Dotpe, UrbanPiper

### Aggregator order ticket / KOT printing

🟡 partial · 5d

A distinct print layout for aggregator orders: platform name band, the PLATFORM's order ID in large type (the number the rider quotes), prepaid flag reading DO-NOT-COLLECT-CASH, customer's masked name and drop area, packaging and cutlery instructions, and deliberately NO customer GST invoice, because under section 9(5) the aggregator is the supplier of record and raises the invoice.

**Why it matters.** A rider walks in and says 'Zomato 4821'. If the kitchen slip and the packing label carry only Sangam's internal order number, the packer hands over the wrong bag — a wrong-order complaint, a refund deduction and a rating hit. Equally, printing a GST bill for a Zomato order and handing it to the rider creates a second tax document for a supply the restaurant did not tax.

**Evidence.** Printing infrastructure exists but has one shape only: apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:10 defines `type Mode = 'kot' | 'bill'`, with `Kot` at :150 and `Bill` at :191 — neither branches on channel, and `grep -n "Zomato|Swiggy|delivery" print-views.tsx` → 0 hits.

**Who ships it.** Petpooja, POSist, Rista, Dotpe

---

## Inventory, recipes & supply chain

Sangam has essentially not entered this domain. The entire inventory surface is one table — `menu_item_stock` (packages/db/src/schema/inventory.ts:17-37) — holding a nullable integer count and a low-stock threshold per SELLABLE MENU ITEM. There is no concept of a raw material, a unit of measure, a recipe, a vendor, a purchase, a wastage entry or a stock movement anywhere in the codebase: `grep -rniE "recipe|ingredient|bill_of_material|raw_material|vendor_|supplier_|purchase_order|goods_receipt|wastage|spoilage|stock_take|stock_transfer|uom|conversion_factor" --include=*.ts --include=*.tsx --include=*.sql apps packages` returns 0 hits, and `grep -rhn "CREATE TABLE" packages/db/drizzle/migrations/*.sql` lists 18 tables with no supply-chain table among them. The gap is strategically live, not theoretical: the founder's own market analysis names "Recipe-level BOM with auto inventory deduction" as demo table stakes (docs/market-analysis.md:129) and docs/happyspaceplan.md:260-272 scopes an Inventory Management pillar, none of which is built. Two compounding structural blockers: nothing in the repo can push a notification (no email/SMS/WhatsApp/push provider in any dependency list), and cafes have no group/parent entity (packages/db/src/schema/cafes.ts:17-54), so multi-outlet transfer has nowhere to land.

### Stock transfer between outlets / central kitchen, with delivery challan

❌ absent · 12d

Moving material from a central kitchen or one outlet to another as a documented transfer — issue, in-transit, receive-with-shortage — printing a Rule 55 delivery challan and generating e-way bill details where the consignment crosses the threshold. The transfer feature itself is not mandated, but once goods move the documents are: CGST Rule 55 requires a delivery challan for movement other than by way of supply, Rule 138 requires an e-way bill above ₹50,000 (intra-state floors vary by state), and inter-state movement between outlets with separate GSTINs is a taxable supply between distinct persons needing a tax invoice.

**Why it matters.** The standard growth path for an Indian cafe is a second outlet plus a central kitchen doing gravies and cakes, and from that day stock moves between locations daily. Untracked, the sending outlet's variance is permanently negative and the receiving outlet's permanently positive, destroying both. Undocumented movement is also the classic reason a delivery van gets stopped — without a challan the consignment can be detained and penalised.

**Evidence.** `grep -rniE "stock_transfer|outlet_transfer|delivery.challan|e-?way" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Structurally blocked as well: cafes are standalone rows with only an ownerId and no group/brand/parent (packages/db/src/schema/cafes.ts:17-54), and `grep -rniE "outlet|branch|group_id|brandId"` finds only a code comment at packages/db/src/schema/invoice-sequences.ts:11.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus (all multi-outlet/central-kitchen); Toast, Lightspeed

### Recipe / bill-of-materials per dish, including portion variants and modifiers

❌ absent · 10d

Per menu item, the quantity of each raw material one sale consumes — Paneer Butter Masala = 150 g paneer + 80 ml makhani gravy + 30 g butter + 1 foil box — defined separately for half/full plate and for priced add-ons (extra cheese, extra butter), with a yield factor for trim and cooking loss.

**Why it matters.** Without a BOM there is no bridge between a bill and the godown, so every downstream number the owner cares about — food cost %, consumption, theoretical closing stock — is unavailable and stays unavailable no matter how many other reports get built. Half-plate/full-plate and 'extra butter' are not edge cases in an Indian cafe, they are most of the modifier traffic, and a recipe engine that knows only one portion size per dish under-consumes systematically and gets switched off within a month.

**Evidence.** `grep -rniE "recipe|bill_of_material|\bbom\b|portion|half_plate" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Modifiers exist as pure price deltas with no material link: packages/db/src/schema/menu.ts:86-96 (menuModifierOptions carries only name, priceDeltaPaise, sortOrder). Named as required by the founder's own analysis at docs/market-analysis.md:129 and unbuilt.

**Who ships it.** Petpooja (Recipe Management), Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Automatic raw-material consumption on sale

❌ absent · 9d · **legally mandatory**

On order settle (or KOT fire), the system explodes each line through its recipe and decrements every constituent raw material inside the order transaction — reversing correctly on edit, void, cancellation and refund, with idempotency so a retried settle does not double-deduct. Legally: CGST Rule 56(12) requires every registered person supplying services to maintain accounts showing quantitative details of goods used in providing them, and restaurant service is a supply of service — so the consumption record (however produced) is mandatory for any GST-registered cafe above ₹20 lakh aggregate turnover (₹10 lakh in special-category states).

**Why it matters.** Manual consumption entry is why inventory modules die in Indian cafes: nobody types 400 lines a day after a 14-hour shift. Auto-deduction is the only version that survives a real kitchen, and it is what makes closing stock, variance and food cost self-maintaining. Sangam is doubly exposed — there is no recipe to explode, and even the finished-good decrement it does have is dead code.

**Evidence.** No recipe exists to explode, so raw-material depletion is absent by construction. Related and telling: `decrementForOrder` is fully implemented at apps/api/src/repositories/inventory.ts:98-116 but `grep -rn "decrementForOrder" apps packages` finds callers only in apps/api/src/routes/inventory.test.ts:72,113, and `grep -n "inventor\|Inventory\|stock" apps/api/src/routes/orders.ts` → 0 hits, so nothing decrements on sale today. (That wiring defect belongs to the correctness audit; the capability absence here is the missing BOM path.)

**Who ships it.** Petpooja (Auto Deduction), Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Goods receipt (GRN) / purchase invoice entry with GST breakup

❌ absent · 9d · **legally mandatory**

Recording what physically arrived — quantity received against the PO, short/excess, rejections, actual billed rate, vendor invoice number and date, CGST/SGST/IGST split, photo of the bill — which increases raw-material stock and updates the valuation rate. Legally: CGST Rule 56(1) requires a true and correct account of inward supplies (a purchase register) and Rule 56(2)'s stock account requires receipt particulars; applies to any GST-registered cafe (₹20 lakh aggregate turnover; ₹10 lakh special-category states). Note most standalone restaurants pay 5% without ITC, so the value is the record and the rate check, not credit.

**Why it matters.** Receipt is the only moment stock legitimately goes up, so without it stock only ever falls to zero and the module is dead. It is also where the two commonest Indian cafe leaks are caught — the vendor who bills 10 kg and delivers 9, and the rate that quietly drifts above the agreed one — and it is the first record a GST officer asks for. Sangam today can capture only the money, as an undifferentiated 'supplies' expense; the quantity, the vendor and the tax split are all lost.

**Evidence.** `grep -rniE "goods_receipt|\bgrn\b|purchase_invoice" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Only an amount-only expense row exists: packages/db/src/schema/expenses.ts:22-35 (category / amountPaise / note / incurredOn — no quantity, no vendor, no GST fields).

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Vendor / supplier master with GSTIN, credit terms and payables ledger

❌ absent · 8d · **legally mandatory**

A supplier record — name, address, GSTIN, FSSAI licence, phone, category, agreed rates, credit period — plus a running ledger of what is owed to each vendor and what has been paid. Legally: CGST Rule 56(5) requires a registered person to keep names and complete addresses of suppliers of taxable goods/services, and FSSAI Schedule 4 requires a licensed FBO to record raw-material sources. Thresholds: GST registration at ₹20 lakh aggregate turnover (₹10 lakh special-category states); FSSAI licence (as opposed to registration) above ₹12 lakh annual turnover.

**Why it matters.** Indian cafes buy on udhaar — the sabziwala, the dairy and the dry-goods distributor settle weekly or fortnightly — so the owner's real cash question is 'how much do I owe, to whom, this week'. Without a vendor ledger that lives in someone's head or a diary, and vendors routinely bill twice for the same delivery. Rate history per vendor is also the only way to catch a supplier who quietly moved paneer from ₹320 to ₹360/kg.

**Evidence.** `grep -rniE "vendor|supplier" --include=*.ts --include=*.tsx --include=*.sql apps packages` returns only GST bill-header prose (apps/web/src/lib/bill-document.ts:6, apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:202) — no entity. Nearest thing is a flat expense row with a `supplies` category and a text note: packages/db/src/schema/expenses.ts:6-35, with no payee, no GSTIN and no balance (repo interface at apps/api/src/repositories/expenses.ts:5-28).

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Semi-finished / batch production (central prep)

❌ absent · 8d

Producing an intermediate item from its own recipe — 10 litres of makhani gravy, a tray of tandoori marinade, a batch of rasgulla — consuming raw materials, adding stock of the semi-finished item, which the dish recipes then consume; with batch quantity, date and yield.

**Why it matters.** Indian kitchens run on shared base gravies: one pot of makhani feeds eight dishes on the menu. Model it as raw materials on each dish and the numbers only work if every dish repeats the whole gravy formula, which nobody maintains and which makes gravy waste invisible. Batch production is also where over-preparation shows up — 12 litres made, 7 sold, 5 dumped — the single biggest controllable loss in a cafe kitchen and otherwise unmeasurable.

**Evidence.** `grep -rniE "semi_finished|semiFinished|production|batch_no|prep_batch|\byield\b" --include=*.ts --include=*.tsx --include=*.sql apps packages` → no domain hits ('yield' matches only JS generators at apps/api/src/lib/cache.test.ts:212-214 and a comment at apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:117).

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus

### Food cost and margin per dish, ideal vs actual

❌ absent · 8d

Costing each dish from its recipe at current material rates (last purchase or weighted average), showing cost, contribution margin and food-cost % per item and category; and at period level, ideal food cost (recipe × units sold) against actual (opening + purchases − closing), with the gap as the leakage figure. Includes menu-engineering quadrants — stars, dogs, puzzles, plough-horses.

**Why it matters.** Indian cafes price by looking at the shop next door, so it is routine to find a bestseller running at 45% food cost and losing money on every plate while a low-volume item carries the business. Without recipe costing the owner cannot know which is which and reprices blind. Ideal-vs-actual is also the number that makes the whole module worth its data-entry cost. Concretely, this is the demo question the founder's own analysis says a competitive 2026 pitch must answer — 'why was my food cost up 3% last week' (docs/market-analysis.md:136) — and Sangam's AI Manager cannot answer it because no cost data exists.

**Evidence.** `grep -rniE "food_cost|foodCost|cost_price|costPrice|cogs|gross_profit|profitab" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits ('margin' matches only CSS/QR props, e.g. apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:247). Menu items carry a selling price only: packages/db/src/schema/menu.ts:45 (`basePricePaise`). The reports repo exposes only dayEnd and sales rows: apps/api/src/repositories/reports.ts:18-30. The AI console tool list has no cost tool: apps/api/src/routes/ai-console.ts:44-116.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Purchase orders to vendors

❌ absent · 7d

Raising an approved PO against a vendor with quantities, agreed rates, expected delivery date and an approval step, sending it (print / PDF / WhatsApp), and tracking it open → partially received → closed. Usually driven off reorder levels or a suggested-order list.

**Why it matters.** In a cafe the person who orders (chef) and the person who pays (owner) are different, and with no PO there is no agreed quantity or rate to check the delivery against — the vendor delivers what they like at the rate they like and the owner finds out at month end. A PO is also the only defensible basis for disputing a short delivery, which is the same recovery instinct Sangam already sells on the aggregator side with Settle.

**Evidence.** `grep -rniE "purchase_order|purchaseOrder|\bpurchase\b|\bindent\b" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 domain hits ('indent' matches only biome.json formatting keys). No purchase table in the full migration set: `grep -rhn "CREATE TABLE" packages/db/drizzle/migrations/*.sql` lists 18 tables, none purchase-related.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Stock ledger — append-only movement history per material

❌ absent · 7d · **legally mandatory**

Every quantity change written as an immutable movement row (opening / receipt / consumption / wastage / transfer in-out / adjustment) carrying quantity, rate, running balance, source document, actor and timestamp, so any closing balance can be reconstructed for any past date. Legally: CGST Rule 56(2) requires a stock account with opening balance, receipt, supply, goods lost or written off and closing balance including raw materials, finished goods and wastage, and s.36 requires retention for 72 months from the annual-return due date. Threshold: every GST-registered person other than a composition dealer.

**Why it matters.** Without a ledger the owner can see 3 kg of paneer are missing but never when or on whose shift, which makes the number unactionable and unarguable. It is also the difference between a defensible stock account and a guess — an inspector asking for the stock position on a date three months ago cannot be answered from an overwritten integer. For a product positioning on audit trail against the Petpooja GST episode, having an immutable ledger for orders but a mutable counter for goods is the weakest seam in the story.

**Evidence.** `grep -rniE "stock_movement|stock_ledger|inventory_transaction" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Stock is overwritten in place with no history: packages/db/src/schema/inventory.ts:24 (single `stockQty: integer()`), mutated by UPDATE at apps/api/src/repositories/inventory.ts:78-82, 91-95 and 104-114. Compare the audit-log pattern that does exist for orders at packages/db/src/schema/audit-logs.ts.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Batch, expiry and FIFO for perishables

❌ absent · 7d

Receiving perishable stock in batches with manufacture/expiry dates and a batch rate, consuming oldest-first, and flagging what expires within N days so it is used or written off before it turns.

**Why it matters.** Milk, curd, paneer, mayonnaise, cream and cold cuts turn in days in Indian ambient conditions, and a cafe that discovers this by taste discovers it in front of a customer. Expiry visibility converts material that would be binned into material used in a staff meal or a special. It is also the record an FSSAI inspector looks for, and expired stock on the shelf is a licence-level risk, not a bookkeeping one.

**Evidence.** `grep -rniE "expiry|expires_at|shelf_life|batch_no|fifo|lot_no" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Note the cafe row stores an `fssai` licence number (packages/db/src/schema/cafes.ts:27) purely to print on the bill — there is no FSSAI record-keeping capability behind it.

**Who ships it.** Restroworks/POSist, Rista, Torqus; Petpooja (limited); Toast, Lightspeed

### Raw-material / ingredient master with stock units

❌ absent · 6d

A catalogue of what the kitchen actually buys and consumes — paneer, refined oil, butter, tomatoes, 250ml paper cups, thermal roll — each with a stock unit (kg / g / litre / ml / piece / packet), an opening balance, a valuation rate and a storage location. This is the object every other capability in the domain hangs off; today Sangam's only stockable object is a sellable menu item.

**Why it matters.** A cafe selling 40 dishes buys around 150 distinct raw materials. Without a raw-material record the owner cannot answer the one question that decides whether the month was profitable — how much paneer did I buy versus how much did I sell — so kitchen shrinkage goes undetected indefinitely. It also makes Sangam's stock screen structurally useless for a cooked-to-order kitchen: a cafe cannot enter '8 kg paneer', only '30 Paneer Tikkas', a number nobody has and nobody maintains, which is exactly why the module gets abandoned after week one.

**Evidence.** `grep -rniE "ingredient|raw_material|rawMaterial|uom|unitOf" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. The only stock entity is packages/db/src/schema/inventory.ts:17-37, keyed on menuItemId with a unique index (line 34) so it cannot even represent a shared material; packages/types/src/domain.ts:89-102 confirms InventoryItem is a menu item, not a material.

**Who ships it.** Petpooja (Item Master), Restroworks/POSist, Rista, Torqus; Toast, Lightspeed, Square globally

### Physical stock take with system-vs-physical variance

❌ absent · 6d

A counting workflow — daily for high-value perishables, monthly full count — that freezes a snapshot, lets staff enter counted quantities on a phone, shows counted vs system quantity per material, values the shortage in rupees, requires a reason or approval on large gaps, and posts an adjustment.

**Why it matters.** Theft and over-portioning in Indian cafes show up as a gap between what the recipes say should be left and what is actually on the shelf; the count is the only instrument that measures it. A cafe losing 200 g of paneer a day is losing roughly ₹1.9 lakh a year — more than many of these businesses net — and it stays invisible until someone counts. Closing stock is also what the accountant needs at year end.

**Evidence.** `grep -rniE "stock_take|stocktake|physical_count|closing_stock" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. 'variance' matches only cash-drawer reconciliation (packages/types/src/staff.ts:101,111,115; packages/db/src/schema/cash-drawer-sessions.ts:11) — a cash concept, not stock. Stock adjustment today is a blind overwrite via PATCH /cafes/:cafeId/inventory/:menuItemId (apps/api/src/routes/inventory.ts:58-75).

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Reorder levels and pushed low-stock alerts

🟡 partial · 6d

A reorder point and reorder quantity per raw material, an auto-generated suggested-purchase list, and an alert delivered on a channel the owner or chef actually watches — WhatsApp or push — rather than a badge visible only to whoever opens the inventory screen.

**Why it matters.** Running out of paneer at 8pm on a Saturday costs a cafe an evening of its highest-margin orders and sends the customer next door. The person who needs the warning is the chef at 4pm, not the owner who might open a dashboard on Tuesday — an in-app badge on a screen nobody visits is functionally the same as no alert. Sangam has the flag but no way to deliver it, and no notification transport of any kind exists to build on.

**Evidence.** Threshold and derived flags exist for finished menu items only: packages/db/src/schema/inventory.ts:26 (`lowStockThreshold`), apps/api/src/repositories/inventory.ts:31-39 (deriveFlags → isLow/isOut), surfaced as UI badges at apps/web/src/app/cafes/[id]/inventory/inventory-view.tsx:205-207 and one AI tool `list_out_of_stock` at apps/api/src/routes/ai-console.ts:77. Absent: reorder point/quantity, suggested purchase list, and any delivery channel — `grep -rniE "notification|sendAlert|whatsapp|telegram|twilio|nodemailer|sendgrid|resend|msg91"` finds only Settle's copy-to-WhatsApp share link (apps/web/src/app/settle/settle-tool.tsx:171-175); no messaging provider appears in any package.json.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus, Dotpe; Toast, Lightspeed

### Unit conversion between purchase, stock and recipe units

❌ absent · 5d

A conversion layer so a material bought in one unit is stocked in another and consumed in a third — oil bought as a 15 kg tin, stocked in litres, consumed in ml; paneer bought per kg, consumed per gram; cups bought by the 100-piece packet, consumed per piece — with per-material density and pack factors rather than a hardcoded global table.

**Why it matters.** Indian purchasing runs on pack units nobody cooks in: a tin of oil, a peti of tomatoes, a bori of atta, a crate of soft drinks. If the system cannot convert, staff either type fractional kilos into recipes and get them wrong, or abandon the module. Getting a conversion wrong by 1000x across a gram/kg boundary silently corrupts every food-cost number the AI Manager will later be asked to explain.

**Evidence.** `grep -rniE "unit_conversion|conversion_factor|uom|\bkg\b|\bgram\b|\blitre\b" --include=*.ts --include=*.tsx --include=*.sql apps packages` → no domain hits (only CSS class substrings such as `ml-2` at apps/web/src/app/cafes/[id]/inventory/inventory-view.tsx:205). Stock is a bare dimensionless `integer()` at packages/db/src/schema/inventory.ts:24 with no unit column anywhere.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

### Wastage, spoilage, staff-meal and complimentary consumption register

❌ absent · 4d · **legally mandatory**

A reason-coded stock write-off — spoiled / expired / burnt / spilled / staff meal / complimentary / tasting — that deducts material without a sale behind it, attributed to a staff member and timestamped, with a wastage report by reason, item and shift. Legally: CGST Rule 56(2) requires the stock account to carry particulars of 'goods lost, stolen, destroyed, written off or disposed of by way of gift or free sample'. Threshold: every GST-registered person other than a composition dealer under s.10 — i.e. cafes on Sangam's regular_5 / regular_18 modes (packages/db/src/schema/cafes.ts:14), exempting composition ones.

**Why it matters.** Milk, curd, paneer and chopped vegetables spoil overnight in Indian kitchens, and staff meals are a real daily draw on the same stock. Without a write-off path every one of those units looks like theft in the variance report, so variance becomes noise and the owner stops reading it — which is exactly how genuine pilferage hides. It is also the one inventory record the CGST rules name explicitly, and audit trail is Sangam's whole positioning.

**Evidence.** `grep -rniE "wastage|spoilage|write_off|writeOff|staff_meal|complimentary" --include=*.ts --include=*.tsx --include=*.sql apps packages` → 0 hits. Scoped in the founder's plan at docs/happyspaceplan.md:267 ('wastage analytics') and unbuilt. The audit log (packages/db/src/schema/audit-logs.ts) records order/user actions, not stock write-offs.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus; Toast, Lightspeed

---

## Statutory compliance & accounting integration (India: GST e-invoicing, GSTR filing data, e-way bill, Tally/Zoho, TCS/TDS on aggregator payouts, HSN reporting, credit notes, record retention)

Sangam has the *document layer* of Indian GST compliance and almost none of the *filing layer*. It gets the hard, easily-botched basics right — a gapless per-FY invoice serial (packages/db/src/schema/invoice-sequences.ts:16), Tax Invoice vs Bill of Supply with the composition declaration (apps/web/src/lib/bill-document.ts:19-30), CGST/SGST split, HSN snapshot frozen at order time (packages/db/src/schema/orders.ts:119), customer GSTIN capture, and an append-only audit log. Past the printed bill it stops dead: zero hits for IRN/IRP/e-invoice, GSTR-1/3B, credit note, e-way bill, place of supply/IGST, Tally, Zoho, purchase register, or retention anywhere in apps/*/src or packages/*/src. Worse, tax is computed as ONE rate for the whole bill (apps/api/src/orders/build.ts:172) — the per-item gstRateBpOverride the menu editor collects is never read by the order engine — so the rate-wise taxable value that every GST return is built from does not exist in the data model, which blocks nine of the fourteen items below. The practical position today: a cafe can bill legally with Sangam, but its CA cannot file from Sangam, and no Sangam data reaches Tally.

### GST e-invoicing — IRN generation via the IRP with signed QR on the invoice

❌ absent · 20d · **legally mandatory**

Push the invoice to a government Invoice Registration Portal (directly or through a GSP such as ClearTax, Masters India or Adaequare), get back the 64-character IRN, acknowledgement number/date and the digitally-signed QR code, print that QR and IRN on the bill, and support cancellation within 24 hours. Legally mandatory for B2B supplies and exports once aggregate annual turnover crossed Rs 5 crore in ANY financial year from 2017-18 onwards; e-invoices must also be reported to the IRP within 30 days of the invoice date for taxpayers with AATO of Rs 10 crore and above. Restaurants are not in the exempt classes under Notification 13/2020. Pure B2C dine-in bills are outside it; the corporate/catering invoices are not.

**Why it matters.** The moment a cafe crosses Rs 5 crore — a two-outlet operation doing ~Rs 2 lakh a day gets there — every invoice raised on a company GSTIN must carry an IRN, and an invoice without one is legally not a valid tax invoice: the corporate customer cannot claim input credit and will refuse to pay until it is reissued. Sangam already collects customerGstin (apps/api/src/routes/orders.ts:41-45) and prints it, which produces exactly the invoice that needs an IRN and doesn't have one. It is also the single hardest ceiling on who Sangam can sell to: any prospect already above Rs 5 crore cannot adopt it at all.

**Evidence.** `grep -rniE "\birn\b|\birp\b|e-?invoic|signed.?qr|ackNo" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. `grep -rniE "cleartax|masters india|irisgst|gstn|gsp\b|suvidha|einvoice1|adaequare|vayana" apps packages` returns 0. No GSP/crypto dependency in apps/api/package.json. The bill print (apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:190-340) renders no QR at all — the only QRCodeCanvas in the app is the table-QR generator at apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:247.

**Who ships it.** Petpooja and Restroworks (POSist) both ship e-invoicing/IRN, usually via a GSP; Rista markets it too. This is the standard reason a growing chain leaves a lightweight POS.

### GSTR-1 / GSTR-3B filing-ready export

❌ absent · 14d · **legally mandatory**

A period export in the GSTN offline-utility JSON/Excel shape: B2CS aggregated by place of supply and rate, B2B invoice-level, CDNR credit/debit notes, HSN summary (Table 12), documents issued (Table 13), and ECO supplies (Table 14) — plus the GSTR-3B Table 3.1 outward-supply and 3.1.1(ii) summary, and a year-end pack for GSTR-9. Filing is legally mandatory for every regular registered taxpayer: GSTR-1 monthly above Rs 5 crore AATO and quarterly under QRMP below it, GSTR-3B alongside; GSTR-9 annual return applies above Rs 2 crore and GSTR-9C reconciliation above Rs 5 crore. The return is mandatory; a POS export is the only practical way the data gets there.

**Why it matters.** Filing happens on the 11th and 20th of every month, without exception, and late filing carries Rs 50/day late fee plus 18% interest and blocks the e-way bill facility after two missed periods. Sangam's only export is the day-end CSV (apps/web/src/app/cafes/[id]/reports/reports-view.tsx:395-437) which is a cash-up sheet, not a return: it has no rate split, no place of supply, no invoice-level B2B block. So every month the owner or their CA hand-builds the return from paper, which is exactly the manual step the product's audit-trail positioning claims to remove.

**Evidence.** `grep -rniE "gstr[-_ ]?(1|3b|4|8|9)|gstr1|gstr3b" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 2 hits, both comments about the HSN field (packages/db/src/schema/menu.ts:46, packages/types/src/domain.ts:60) — no code. Reports surface is only two endpoints, day-end and sales: apps/api/src/routes/reports.ts:41,61. No GST-return table in the migrations: `grep -hoE "CREATE TABLE[^(]*" packages/db/drizzle/migrations/*.sql` lists 18 tables, none tax-return related.

**Who ships it.** Petpooja and Restroworks both ship GSTR-1/3B-ready reports (Petpooja markets a GST report suite for the CA); Rista and Torqus ship equivalent GST summary exports.

### Rate-wise / HSN-wise tax computation and HSN summary report

🟡 partial · 12d · **legally mandatory**

Tax computed and stored per line (taxable value, rate, CGST/SGST/IGST) instead of one rate per bill, plus an HSN/SAC-wise summary of taxable value and tax for a period. Legally mandatory as the content of GSTR-1 Table 12, which every regular registered taxpayer files: 4-digit HSN reporting for aggregate annual turnover up to Rs 5 crore and 6-digit above Rs 5 crore, with Table 12 mandatory (dropdown-driven, no free text) for all taxpayers since the May-2025 return period. GST registration itself is compulsory for a restaurant above Rs 20 lakh turnover (Rs 10 lakh in special-category states).

**Why it matters.** Any cafe that sells one thing at a rate other than its default — bottled water and packaged snacks at 18%, a sweets counter at 5%, an alcohol-adjacent or non-GST line — produces a bill Sangam taxes entirely at the cafe-level rate, and produces no report the CA can use. Today the owner's accountant re-keys the whole month from printed bills or from the Zomato/Swiggy dashboards into Excel to derive rate-wise turnover, which is where the errors that trigger GST notices come from. It is also the blocking dependency for GSTR-1, GSTR-3B, credit notes, CMP-08 and every accounting export below.

**Evidence.** Fields exist but the tax engine ignores them: packages/db/src/schema/menu.ts:52 (gstRateBpOverride) and packages/db/src/schema/orders.ts:119 (hsnSnapshot) are stored, yet apps/api/src/orders/build.ts:172 computes `gstRateBp = gstRateBpFor(cafe.gstMode)` once for the whole order and apps/api/src/orders/build.ts:91 applies it to a single taxable base; `grep -rn gstRateBpOverride apps/api/src --include=*.ts | grep -v test` returns only menu CRUD (repositories/menu.ts:18,32; routes/menu.ts:37,56,160,224) — never the order builder. Reporting sums one column: apps/api/src/repositories/reports.ts:149 (`tax: sum(schema.orders.taxPaise)`), and apps/api/src/repositories/reports.ts:25-30 offers only item/category/hour grouping — no HSN or rate grouping. The team's own plan doc concedes it: docs/plan/order-amend.md:736 ("no per-HSN taxable-value split... cannot yet produce the HSN-wise summary a GSTR-1 filing wants").

**Who ships it.** Petpooja, Restroworks (POSist) and Rista all ship item-level GST with an HSN-wise tax report as standard; it is table stakes even in Vyapar and Marg at a fraction of the price.

### Delivery challan and e-way bill for stock movement

❌ absent · 12d · **legally mandatory**

A delivery challan under Rule 55 CGST for any movement of goods that is not a supply — central kitchen to outlet, outlet to outlet, goods sent for job work, catering equipment out and back — plus e-way bill generation (Part A/B, transporter and vehicle details, validity extension, cancellation) via the NIC portal or a GSP. The delivery challan is mandatory for such movement at ANY value; the e-way bill becomes mandatory when consignment value exceeds Rs 50,000 for inter-state movement, with intra-state thresholds set per state (Rs 50,000 in most, Rs 1 lakh in Delhi, Maharashtra, Madhya Pradesh, West Bengal, Tamil Nadu and others).

**Why it matters.** This is the cloud-kitchen and multi-outlet case, and it is enforced at the roadside: a van moving a day's prepped gravies and packaging from a commissary to three outlets, stopped without a challan, gets the goods detained and the operator pays a penalty of the tax plus a 100% penalty (or 50% of the goods' value) to release them. It also matters for the bulk catering order and for any cafe with a sweets/bakery counter that ships boxes. Sangam has no concept of a second location or of goods moving between them, so there is nothing to hang a challan on.

**Evidence.** `grep -rniE "e-?way|challan|stock.?transfer|consignment" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 8 hits, ALL substring false positives on 'payment_gateway' (apps/api/src/settle/classifier.ts:40-41, settle/analyzer.ts:20, packages/types/src/domain.ts:298) — no real match. Inventory is per-menu-item counts within one cafe only, with no goods/vendor/movement model: packages/db/src/schema/inventory.ts:17-37 (menu_item_stock: cafeId, menuItemId, stockQty, lowStockThreshold).

**Who ships it.** Restroworks and Rista ship central-kitchen/commissary indenting with stock transfer documents; Petpooja ships central kitchen and stock transfer. E-way bill itself is usually reached via the accounting stack (Tally, ClearTax) rather than the POS.

### Aggregator (Zomato/Swiggy) sales as a first-class, GST-classified revenue stream

❌ absent · 10d · **legally mandatory**

Order-level delivery sales pulled in (partner API or statement/CSV import) and stored with the Section 9(5) classification, so restaurant-service supplies on which the e-commerce operator discharges the GST are reported by the restaurant in GSTR-1 Table 14 and GSTR-3B Table 3.1.1(ii), while goods sold through the platform (packaged items, bakery) are reported as the restaurant's own taxable supply. Reporting these supplies is mandatory for any registered restaurant selling through an ECO, at any turnover.

**Why it matters.** For a cloud kitchen, aggregator sales ARE the business — often 70-90% of revenue — and Sangam cannot even record them: the order source enum is counter/qr/phone. So the POS's turnover and the GSTN's view of the cafe's turnover disagree by the entire delivery book, which is the number-one trigger for a GST scrutiny notice, and the day-end/Z report the owner runs is not the day's actual sales. It also cuts the other way commercially: Settle audits the aggregator statement but the orders it settles never exist inside the product, so Sangam cannot tell the owner whether the platform even paid for every order it says it delivered.

**Evidence.** packages/db/src/schema/orders.ts:25 — `orderSourceValues = ['counter','qr','phone']`; no aggregator source. `grep -rniE "'zomato'|'swiggy'|aggregator" apps/api/src apps/web/src packages/types/src` hits only the Settle statement analyzer (apps/api/src/routes/settle.ts:8, apps/api/src/settle/analyzer.ts:29) and marketing copy — never an order. Settle itself is stateless: apps/api/src/routes/settle.ts:27-54 parses a pasted CSV and returns a report, persisting nothing.

**Who ships it.** Petpooja, Restroworks, Rista, Torqus and Dotpe all ship live Zomato/Swiggy order-injection into the POS — it is the single most-cited reason Indian cafes buy a POS at all.

### Tally Prime integration (XML voucher export / sync)

❌ absent · 10d

Emit the period's sales as Tally-importable XML vouchers — Sales, Receipt, Credit Note — with a configurable ledger map (sales ledgers per GST rate, CGST/SGST/IGST duty ledgers, round-off, cash/UPI/card/aggregator receivable ledgers), plus a re-import guard so the same day is never posted twice. Not legally mandatory; commercially close to it.

**Why it matters.** Tally is where the Indian small-business CA actually lives, and the CA is the person who signs off on which POS the restaurant keeps. Without an export, someone re-types a month of daily sales into Tally by hand — typically the CA's junior, billing the owner Rs 2,000-5,000 a month for it, and introducing the transcription errors that later show up as a GST mismatch. In practice 'does it talk to my Tally?' is asked in the first sales call, and a 'no' ends it.

**Evidence.** `grep -rniE "\btally\b|\bzoho\b|xero|quickbooks" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0 (the only 'tally' string anywhere in the repo is the English word in a user story, docs/plan/user-stories.md:77). No XML emitter: `grep -rniE "ledger|voucher|journal|day.?book|chart of accounts|xml" apps/api/src apps/web/src packages/types/src` hits only the order tender ledger (apps/api/src/repositories/orders.ts:102) and a sitemap.

**Who ships it.** Petpooja, Restroworks (POSist) and Rista all advertise a Tally integration; it is a standard line on their comparison pages.

### Purchase / vendor bill register with GSTIN, HSN, rate and ITC eligibility

❌ absent · 10d · **legally mandatory**

Vendor master with GSTIN and state, purchase invoices captured line-by-line with HSN, rate, taxable value and tax, each flagged for input-tax-credit eligibility, feeding a purchase register and GSTR-3B Table 4. Section 35(1) CGST makes keeping a true and correct account of INWARD supplies mandatory for every registered person — the inward side is as compulsory as the outward side. Note the restaurant-specific twist: a cafe billing at 5% cannot claim ITC at all, so the register is for the record and for the 18% cases (restaurant in a hotel above Rs 7,500 tariff, packaged-goods sales, rent and equipment for a composition-exit).

**Why it matters.** Sangam's expenses table is a single amount with a category and a note — no vendor, no GSTIN, no tax split. That means the purchase side of the books simply does not exist in the product, so the 'daily P&L' can only ever be an estimate, the CA cannot file the inward half of the return from Sangam, and the food-cost number that Pulse is supposed to compute has no invoice-level source. For an 18% operator it is also a direct cash loss: unclaimed ITC on rent, packaging and equipment.

**Evidence.** packages/db/src/schema/expenses.ts:22-35 — expenses are (category enum, amountPaise, note, incurredOn) with no vendor, GSTIN, tax, HSN or invoice reference; apps/api/src/repositories/expenses.ts:5-17 confirms the same shape end to end. `grep -rniE "vendorGstin|supplierGstin|purchase.?invoice|purchase.?register|inputTax|itc\b" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. No vendor/purchase table in the migration table list.

**Who ships it.** Petpooja, Restroworks and Rista all ship purchase/vendor modules with GST-bearing purchase entry tied to inventory.

### TCS / TDS credit ledger on aggregator payouts, reconciled to GSTR-8 and Form 26AS

🟡 partial · 9d

Persist each aggregator payout with the tax withheld on it and track it as a claimable credit: GST TCS at 1% collected by the e-commerce operator under Section 52 CGST (on supplies other than the Section 9(5) restaurant service), which appears in the operator's GSTR-8 and lands in the restaurant's electronic cash ledger via GSTR-2X/the TCS credit table; and income-tax TDS at 0.1% under Section 194-O, which appears in Form 26AS/AIS and is set off against the year's income-tax liability. Claiming credit is not optional in the sense that failing to claim is simply money forfeited; reconciling the operator's GSTR-8 against your own books is required to defend the claim.

**Why it matters.** A cloud kitchen doing Rs 8 lakh a month on the platforms has roughly Rs 8,000-10,000 a month of TCS and TDS withheld. If nobody reconciles the payout statement against GSTR-8 and 26AS, the credit is simply never claimed — that is over a lakh a year handed to the government for nothing, and it is the same money Settle's whole pitch is about recovering. Sangam's Settle currently sees the TCS/TDS lines and files them under 'mandatory, not recoverable', which is the opposite of the truth: they are not disputable, but they are fully claimable.

**Evidence.** Recognised as statement categories only: apps/api/src/settle/classifier.ts:45-46 maps 'tcs'/'tds', and apps/api/src/settle/analyzer.ts:14 sanity-checks them at ~1% (EXPECTED_TAX_RATE), but apps/api/src/settle/analyzer.ts:16-25 puts both in MANDATORY_CATEGORIES ('not realistically recoverable'). Nothing is stored — apps/api/src/routes/settle.ts:27 is a stateless POST and there is no payout/statement table in the migration list. `grep -rniE "26as|gstr.?2b|gstr.?2a|form.?26" apps/api/src apps/web/src packages/*/src` returns 0.

**Who ships it.** Weakly covered by POS vendors; Petpooja and Rista surface payout reconciliation, and the CA-side tools (ClearTax, TaxGenie) do the GSTR-8/26AS matching. This is genuinely Sangam's strongest wedge — Settle already has the statement in hand.

### Zoho Books / cloud accounting sync

❌ absent · 9d

OAuth-connected push of invoices, credit notes, payments and daily sales summaries into Zoho Books (and ideally a generic mapping so QuickBooks/Xero/Vyapar can follow), with contact and item mapping, idempotency keys and a visible failure queue. Not legally mandatory.

**Why it matters.** The younger cloud-kitchen operator who never bought Tally is on Zoho Books — it is the default for GST-registered Indian small business now, and Zoho's CA programme has pushed accountants onto it. Without a connector, that operator's books are a monthly CSV re-entry job, and the daily P&L that Sangam's 'Pulse' pillar promises can never reconcile to the actual accounting system, so the owner ends up trusting neither number.

**Evidence.** Same search as Tally: `grep -rniE "\btally\b|\bzoho\b|xero|quickbooks" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0 ('Zoho' appears only in docs/market-analysis.md:230 as a GTM reference). No OAuth client or outbound HTTP integration layer exists in apps/api/package.json beyond Razorpay (apps/api/src/payments/razorpay.ts).

**Who ships it.** Rista and Restroworks list cloud-accounting connectors; Petpooja's integration marketplace covers accounting partners. Dotpe largely does not.

### Statutory record retention and tamper-evident archival

🟡 partial · 8d · **legally mandatory**

A durable, exportable archive of every invoice, line item, payment, credit note and audit entry, retained for the statutory window and verifiable as unaltered — plus a one-click 'give my CA/the officer the period' export. Section 36 CGST read with Rule 56 requires books and records to be retained for 72 months (six years) from the due date of furnishing the annual return for that year — longer where an appeal is pending. For companies, the Companies (Accounts) Rules audit-trail/edit-log requirement (in force since 1 April 2023) additionally requires the accounting software to record and preserve an edit log that cannot be disabled.

**Why it matters.** Today the only copy of a cafe's six-year statutory record is a row in Sangam's Postgres. If the cafe stops paying, or Sangam churns them, or a migration goes wrong, the legal record is gone and the owner has no defence at a scrutiny three years later. There is no export of invoices in any form — only a day-end CSV of totals — so a GST officer's demand for the period's invoices cannot be answered from the product. This one matters disproportionately because 'audit trail you can hand to an officer' is the exact ground Sangam has chosen to fight Petpooja on; an append-only table with no archive, no hash chain and no export does not yet deliver it.

**Evidence.** An append-only audit log exists by convention — packages/db/src/schema/audit-logs.ts:9-14 ("INSERT-only by contract: the repository exposes NO update or delete operations") — but nothing enforces it at the DB level, chains it, or exports it. `grep -rniE "retention|archive|archival|purge|legal.?hold|72 month" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. The only export in the product is the client-side day-end totals CSV: apps/web/src/app/cafes/[id]/reports/reports-view.tsx:89-94, 395-437 — no invoice-level export anywhere.

**Who ships it.** Petpooja and Restroworks retain and re-export historical bills as a matter of course; neither markets a tamper-evident archive, which is precisely the opening Sangam's positioning is aimed at.

### GST credit notes for refunds, voids and post-sale discounts

❌ absent · 7d · **legally mandatory**

A credit note document under Section 34 of the CGST Act with its own consecutive serial series, carrying the original invoice number and date, the reason, and the tax reversed — issued whenever a supply is cancelled, refunded, short-supplied or discounted after the invoice. Mandatory for every registered taxpayer whenever tax already charged has to be reduced, and it must be declared in GSTR-1 Table 9B by the November following the financial year (or the annual return date, whichever is earlier) or the tax cannot be reversed at all.

**Why it matters.** Sangam already does refunds — it writes a tender row and flips the status — but the money going back to the guest carries no document, so the GST originally charged on that bill stays on the books as output tax the cafe must pay to the government out of its own pocket. On a bill that gets refunded a couple of times a week, that is a permanent, silent leak, and at audit the cash-out has no supporting voucher. This is the cheapest item on this list relative to what it protects.

**Evidence.** `grep -rniE "credit[ _-]?note|debit[ _-]?note" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. Refunds exist but produce only a ledger row: packages/db/src/schema/order-payments.ts:26 (kind 'payment'|'refund') and apps/api/src/repositories/orders.ts:97-101 (`refund(...)`); the print view renders a refund only as a line item on the reprinted bill (apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:334). The invoice sequence table has one series per (cafe, FY) with no document type: packages/db/src/schema/invoice-sequences.ts:16-27.

**Who ships it.** Every commercial Indian POS — Petpooja, Restroworks, Rista, Torqus — issues a credit note on a refund/void; so does Vyapar.

### B2B recipient master, place of supply and IGST (inter-state) handling

❌ absent · 7d · **legally mandatory**

Capture the registered recipient's legal name, address and state code, derive the place of supply, and branch the tax heads to IGST for an inter-state supply instead of always splitting CGST/SGST. Rule 46 CGST requires name, address, GSTIN and place of supply with state code on a B2B invoice, and requires the recipient's name, address and delivery state on ANY invoice above Rs 50,000 even where the recipient is unregistered.

**Why it matters.** Sangam takes a customer GSTIN and prints it, then hardcodes the tax into half CGST and half SGST. Restaurant service is almost always intra-state so that convention usually holds — but the corporate catering order billed to a Gurgaon head office by a Delhi kitchen, or an outdoor catering contract executed in another state, is IGST, and an invoice with the wrong tax heads is one the recipient's ITC claim will bounce on. The recipient then demands a revised invoice, which without credit-note support Sangam cannot issue. The Rs 50,000 unregistered-recipient rule bites on every large party booking and every festival bulk order.

**Evidence.** `grep -rniE "place.?of.?supply|\bigst\b|stateCode|state_code|interstate|inter-state" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. The split is hardcoded on the print: apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:208-210 ("Split GST in half (intra-state convention)") and the same at apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:41-45. The order stores only a GSTIN string with no recipient address: packages/db/src/schema/orders.ts:56 (customerGstin), and the customers table has phone/name only (packages/db/src/schema/customers.ts:14-31).

**Who ships it.** Petpooja, Restroworks and Rista all support a B2B/company invoice with recipient details and IGST for catering and banquet billing.

### Filed-period lock (books close)

❌ absent · 5d

Once a GST period has been filed, freeze it: no amendment, void, refund, discount, expense edit or backdated order can touch a locked date range, and any override is a named, reasoned, audited event. Not itself a named statutory requirement, but it is what makes the Section 35/36 record and the Companies-Act edit-log requirement meaningful, and it is what a CA asks for before they will certify anything out of a POS.

**Why it matters.** Sangam lets an owner amend, void, refund or discount an order with no date boundary. So a bill from three months ago — already reported in a filed GSTR-1 and paid for in GSTR-3B — can be silently changed, and the return and the books permanently disagree with no record that they ever agreed. That is the failure mode the Petpooja GST scandal is about, and the product currently reproduces it. It is also the cheapest credibility purchase on this list.

**Evidence.** `grep -rniE "periodLock|period_lock|lockedUntil|books.?clos|freezeDate|filedUpto" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 0. The only date-boundary concept in the system is the cash-drawer session and the IST business day (apps/api/src/reports/date-range.ts:38-46), neither of which gates writes. Order mutation paths carry no date guard: apps/api/src/routes/orders.ts (amend/refund/settle handlers) and apps/api/src/repositories/orders.ts:97-101.

**Who ships it.** Petpooja and Restroworks ship a day-close/period-lock; Tally and Zoho Books both have a books-closing date, which is where the CA's expectation comes from.

### Composition-dealer turnover statement for CMP-08 / GSTR-4

❌ absent · 3d · **legally mandatory**

A quarterly turnover-and-tax-payable statement for a cafe registered under the composition scheme, matching the CMP-08 fields, plus the annual GSTR-4 pack. Legally mandatory for composition dealers: CMP-08 is due quarterly by the 18th of the month following the quarter and GSTR-4 annually by 30 June; the scheme itself is available up to Rs 1.5 crore aggregate turnover (Rs 75 lakh in special-category states), at 5% of turnover for restaurant service, with no GST charged on the bill and no ITC.

**Why it matters.** Composition is where a large share of Sangam's actual target — the small independent cafe under Rs 1.5 crore — is registered, and Sangam already models the regime correctly on the bill (no tax charged, Bill of Supply header, the Rule 5(1)(f) declaration). But the one number a composition dealer owes the government is quarterly turnover, and the product produces day-end figures the owner must add up by hand across ~90 days, four times a year. It is a small build sitting on top of work already done, for the segment the product is aimed squarely at.

**Evidence.** The regime is modelled for billing only: packages/db/src/schema/cafes.ts:14 (gstMode includes 'composition'), apps/api/src/orders/build.ts:117-127 (gstRateBpFor returns 0), apps/web/src/lib/bill-document.ts:27-30 (compositionDeclaration). No return output: `grep -rniE "cmp-?08|gstr-?4|composition.?return|turnover" --include=*.ts --include=*.tsx apps/api/src apps/web/src packages/*/src` returns 3 hits, all explanatory comments (apps/api/src/orders/build.ts:114, packages/types/src/domain.ts:14, packages/db/src/schema/cafes.ts:12). The reports repo exposes only dayEnd and sales: apps/api/src/repositories/reports.ts:18-31.

**Who ships it.** Petpooja and Vyapar both handle composition billing plus a turnover summary; Restroworks and Rista target larger, regular-scheme accounts and treat composition as an edge case — which is exactly why this is cheap differentiation in Sangam's segment.

---

## Menu merchandising: modifiers, combos, offers, pricing

Sangam's menu is a flat, single-price catalogue: one item, one `basePricePaise`, one availability boolean, no time dimension, no channel dimension, no offer layer. The only price-changing mechanism in the entire product is a free-text bill-level discount the cashier types by hand (`apps/api/src/orders/build.ts:70-79`) — there are no coupons, no promo codes, no automatic offer rules, no happy-hour or day-parting, and no per-channel prices. Two modifier tables (`menuItemModifiers`, `menuModifierOptions`) were created in migration 0001 and then abandoned: a grep across apps/api, apps/web and packages/types finds zero references outside their own definition file and the compiled `dist/`, so no API, no editor UI, and no order-line capture exists for them. The practical effect is that a very large share of real Indian menus — half/full dal, quarter/half/full biryani, chai with extra masala, thali combos, breakfast-only items, a Zomato price 25% above the dine-in price — cannot be represented at all, and the cashier's only recourse is a "notes" free-text field that carries no money.

### Modifier groups and add-on options, wired end to end

🟡 partial · 14d

Per-item option groups (single- or multi-select, required or optional, min/max choices) whose options each carry a price delta — extra cheese +₹40, tandoori roti butter +₹10, sugar level, spice level, extra gravy — selected at order time, priced into the line, printed on the KOT and itemised on the bill.

**Why it matters.** Today a waiter who takes 'paneer tikka, extra spicy, extra gravy' can only type it into the free-text `notes` field, which adds ₹0 to the bill. The kitchen makes the extra gravy, the restaurant charges nothing for it, and the loss is invisible because it never becomes a line item. Add-on revenue is typically 8-15% of a cafe's ticket and here it is structurally uncollectable.

**Evidence.** Schema stubs exist and are migrated but are dead code: packages/db/src/schema/menu.ts:73 (menuItemModifiers), :86 (menuModifierOptions, priceDeltaPaise at :92), migration packages/db/drizzle/migrations/0001_giant_luke_cage.sql:11,38. `grep -rn "menuItemModifiers|menuModifierOptions|MenuItemModifierRow" apps packages/types packages/db/src --exclude-dir=dist` returns nothing outside menu.ts itself. No modifier endpoints in apps/api/src/routes/menu.ts (routes at :85,104,128,175,246,284 are menu/category/item/import/patch/delete only); menu repo never selects them (apps/api/src/repositories/menu.ts:59-118); MenuItem type has no modifiers field (packages/types/src/domain.ts:53-77); order lines are {menuItemId, quantity, notes} only (apps/api/src/orders/build.ts:16-20, packages/types/src/api.ts:193-197); no order_item_modifiers snapshot table exists (`grep -rn "order_item_modifier|orderItemModifier"` → nothing).

**Who ships it.** Petpooja (Add-ons), POSist, Rista, Torqus, Dotpe, Square, Toast, Lightspeed — universal

### Automatic offer rules engine (item-level and bill-level)

❌ absent · 14d

Declarative rules the POS applies by itself: buy-1-get-1 on a category, 20% off starters, free dessert above ₹999, flat ₹150 off on the second order of the day, combo-price-when-bought-together — with defined stacking precedence and a preview that the counter UI and the server compute identically.

**Why it matters.** Sangam has exactly one discount mechanism — the cashier typing a number — so every offer a cafe runs depends on the cashier remembering the rule and applying it correctly at a queue-time of ten seconds. In practice offers get applied to the wrong bills, missed on the right ones, and applied at the wrong value, and a BOGO cannot be represented at all because there is no way to add a ₹0 line for the free item without distorting the taxable value of the paid one.

**Evidence.** `grep -rniE "bogo|buy one|freeQty|minBill|min order value|offerRule|ruleEngine"` → no matches. The only discount path is a hand-typed percent-or-flat value applied to the whole subtotal: apps/api/src/orders/build.ts:26-33 (BillAdjustments), :70-79 (computeBillAdjustments), duplicated client-side at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:135-163. Order items have no per-line discount column (packages/db/src/schema/orders.ts:100-127).

**Who ships it.** Petpooja (Offers), POSist, Rista, Torqus, Dotpe, Toast (promos), Square (automatic discounts), Lightspeed

### Combo / meal deals with component explosion

❌ absent · 12d

A sellable item composed of other menu items at a bundled price — thali, 'burger + fries + Coke', family pack, kids meal — where choosing the combo explodes into its component lines for the KOT and for stock depletion, while the bill shows one combo price with the discount allocated across components.

**Why it matters.** Thali is the highest-volume item on a large fraction of Indian menus and combos are the standard lunch offer. Without them an owner fakes a combo as a flat menu item, so the kitchen ticket says 'Veg Thali' with no component breakdown, per-dish stock never depletes, and the item-sales report cannot tell you that dal is your real volume driver. It also blocks the single most effective upsell the AI waiter could make.

**Evidence.** `grep -rniE "combo|bundle|meal deal|thali|set menu"` across apps/packages finds only marketing copy (apps/web/src/app/cafes/[id]/ai-waiter/waiter-chat.tsx:40 'Suggest a veg combo'), a seed-data item name (packages/db/src/seed.ts:64,68 'Veg Thali'), and a CSV-parser test fixture (apps/api/src/menu/import.test.ts:97). No composition/child-item relation exists on menuItems (packages/db/src/schema/menu.ts:36-70).

**Who ships it.** Petpooja (Combos), POSist, Rista, Torqus, Dotpe, Square (item sets), Toast, Lightspeed

### Coupon and promo codes with redemption limits

❌ absent · 11d

Named codes (WELCOME50, FLAT100, a WhatsApp campaign code) with validity dates, minimum bill value, applicable items/categories, total and per-customer redemption caps, and an atomic redemption ledger — enterable by the diner in the QR flow and by the cashier at the counter.

**Why it matters.** A cafe that prints 'FLAT ₹100 OFF, code CAFE100' on a pamphlet or sends it on WhatsApp has no way to accept it: the cashier types a manual ₹100 discount instead, which means the same customer can use it every day forever, the code has no expiry, and there is no record connecting the discount to the campaign. The owner ends up unable to answer 'did the pamphlet drop pay for itself', which is the whole point of running one.

**Evidence.** `grep -rniE "coupon|promo code|voucher|redeem" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` matches only Settle's aggregator-statement label classifier (apps/api/src/settle/classifier.ts:36 keyword list; apps/api/src/settle/classifier.test.ts:37 'Coupon funding') — i.e. parsing Zomato's deductions, not issuing offers. No coupon table in packages/db/src/schema/index.ts:1-13; CreateOrderRequest has no code field (packages/types/src/api.ts:184-205).

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe, Square Marketing, Toast promos

### Channel-specific price lists (dine-in vs takeaway vs Zomato/Swiggy)

❌ absent · 10d

Multiple price lists over one menu, selected by order channel, plus per-channel availability and per-channel packaging charges. In India this exists to absorb the 18-28% aggregator commission by marking delivery prices up, and to price takeaway below dine-in where no service is rendered.

**Why it matters.** Every cafe on Zomato/Swiggy lists a higher price there than at the counter; it is the only way the aggregator order is not loss-making after commission. Sangam has one price per item and an order `source` enum of counter/qr/phone that has no aggregator value and does not affect price, so the moment an owner starts taking delivery orders their menu is either underpriced on the aggregator or overpriced at the counter. This is also directly load-bearing for Settle: without a channel price you cannot compute what an aggregator order should have netted, so you cannot prove a deduction was wrong.

**Evidence.** `grep -rniE "channelPrice|priceList|price_list|takeawayPrice|dineInPrice|deliveryPrice"` → no matches; only marketing copy mentions 'channel' (apps/web/src/app/(marketing)/page.tsx:533). Order source has no delivery/aggregator channel: packages/db/src/schema/orders.ts:25 `['counter','qr','phone']`, and source is never consulted in pricing (apps/api/src/orders/build.ts:139-186). Aggregator names appear only inside the Settle statement parser (apps/api/src/settle/classifier.ts) and marketing pages.

**Who ships it.** Petpooja (multiple price lists + aggregator menu push), POSist, Rista, Torqus, Dotpe, UrbanPiper-integrated stacks; Toast/Square ship per-channel pricing

### Item variants / portion sizes (half–full, quarter plate, 250g/500g, 30ml/60ml)

❌ absent · 9d

A price-replacing option set on an item: the variant sets the unit price rather than adding to it, and each variant is its own sellable unit with its own price, its own stock draw, and potentially its own HSN. Distinct from add-on modifiers, which are additive.

**Why it matters.** Half/full is the default shape of an Indian menu — dal, biryani, chowmein, curries, chai sizes, sweets by weight. Without variants an owner must create 'Dal Fry (Half)' and 'Dal Fry (Full)' as two unrelated menu items, which doubles the menu, breaks item-sales reporting (top-sellers report shows two half-strength rows instead of one dish), and makes the QR menu and AI waiter present the same dish twice.

**Evidence.** `grep -rniE "variant|half plate|quarter|portion|halfPrice" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` matches only Tailwind `buttonClasses({variant})` UI props — no menu concept. Item pricing is a single scalar: packages/db/src/schema/menu.ts:45 `basePricePaise`, consumed unconditionally at apps/api/src/orders/build.ts:148,167 and mirrored client-side at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:272.

**Who ships it.** Petpooja (Variations), POSist, Rista, Torqus, Dotpe, Square (item variations), Toast, Lightspeed

### Day-parted menus and time-window item availability

❌ absent · 8d

Per-item and per-category availability windows by time-of-day and day-of-week, enforced server-side — breakfast 7:00-11:30, lunch thali 12:00-15:30, bar menu after 18:00, Tuesday no-non-veg.

**Why it matters.** Today the only availability control is a manual on/off toggle, so someone has to physically switch dozens of items twice a day. Nobody does it reliably, which means a diner scanning the QR menu at 21:00 can order and pay online for a breakfast poha the kitchen stopped making at 11:30 — the cafe then has to refund a Razorpay payment and apologise. Bar/liquor items showing before permitted service hours is worse than an inconvenience.

**Evidence.** `grep -rniE "availableFrom|availableTo|availableUntil|startTime|endTime|daypart|breakfast|timeband|availabilityWindow" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` → no matches. Availability is one boolean with no time dimension: packages/db/src/schema/menu.ts:58, filtered naively for the public menu at apps/api/src/routes/public.ts:80.

**Who ships it.** Petpooja (timed/scheduled menus), POSist, Rista, Torqus, Toast (menu scheduling), Square, Lightspeed

### Line-level discounts / complimentary items, with reason codes, role caps and discount reporting

🟡 partial · 8d

Discount or comp a single line rather than the whole bill (the dish that came out wrong, a staff meal, an on-the-house dessert), from a fixed list of reason codes, with per-role limits and manager-PIN approval above a threshold, and a discounts block in the day-end and sales reports. Note that under CGST s.15(3) a discount only reduces taxable value if it is recorded on the invoice itself.

**Why it matters.** When one dish out of six is sent back, the cashier's only option today is to discount the entire bill by an equivalent amount with a free-typed reason — so the comp is untraceable to the dish, the kitchen never learns which item is being sent back, and the discount does not reduce that line's taxable value the way GST expects. More seriously, the discount field is uncapped and ungated: any cashier can apply 100% off with the reason 'ok' and nothing in the system objects or reports it. Cashier-side discount abuse is the single most common cash leak in Indian restaurants, and this is currently the widest-open door in the product.

**Evidence.** Bill-level only, free-text reason, no cap, no role gate: packages/db/src/schema/orders.ts:63-64 (discountPaise, discountReason), apps/api/src/orders/build.ts:70-79, apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:182-184 (free-typed type/value/reason). No per-line discount column on order_items (packages/db/src/schema/orders.ts:100-127). Staff roles exist but carry no permission set to gate against (packages/db/src/schema/staff.ts:8, packages/types/src/staff.ts:11). Reporting explicitly excludes discounts — packages/types/src/reports.ts:27 'No discount data exists yet, so it is omitted'; `grep -n discount apps/api/src/repositories/reports.ts` → nothing. The audit schema names 'discount.apply' as an example action (packages/db/src/schema/audit-logs.ts:24) but the orders route emits no audit call (`grep -n "logAudit|audit\." apps/api/src/routes/orders.ts` → nothing).

**Who ships it.** Petpooja, POSist, Rista, Torqus, Square, Toast, Lightspeed — all ship reason codes + role-gated discount limits

### Per-line GST across modifiers, combos and non-food lines (mixed vs composite supply)

🟡 partial · 6d · **legally mandatory**

Resolving the tax rate per line rather than per bill, so a single invoice can carry food at 5%, packaged water/soft drinks/cigarettes at their own rates, and modifiers/combo components at the rate of what they actually are — with the bill printing a rate-wise tax summary. Required by Rule 46 of the CGST Rules for any GST-registered dealer (registration itself is mandatory above ₹20L turnover, ₹10L in special-category states) whose bills contain supplies at more than one rate.

**Why it matters.** Almost every cafe also sells sealed water bottles, packaged beverages, or bakery items that do not sit at the restaurant-service rate. Today the bill carries exactly one blended `gstRateBp` for the whole order, so such an invoice is not a compliant tax invoice and the rate-wise figures will not tie out to GSTR-1 — which is precisely the audit exposure Sangam's own positioning targets. It also blocks combos and paid add-ons from ever being priced correctly, since a combo containing an 18% item is a mixed supply.

**Evidence.** A per-item override field exists in schema, types and the editor UI — packages/db/src/schema/menu.ts:52 `gstRateBpOverride`, packages/types/src/domain.ts:66, apps/web/src/app/cafes/[id]/menu/menu-editor.tsx:595 — but the pricing engine never reads it: apps/api/src/orders/build.ts:173 sets one `gstRateBp = gstRateBpFor(cafe.gstMode)` for the whole order, stored as a single order-level column (packages/db/src/schema/orders.ts:78 gstRateBp) and applied to one blended taxable base (build.ts:86-88). order_items has no tax rate or tax amount column (packages/db/src/schema/orders.ts:100-127), so no rate-wise breakup can be produced even after the fact.

**Who ships it.** Petpooja, POSist, Rista, Torqus — per-item tax groups plus a rate-wise bill summary are table stakes in any Indian POS selling packaged goods

### Menu labelling: Jain / dietary tags beyond veg-non-veg, plus allergen and calorie declaration

🟡 partial · 6d · **legally mandatory**

Item tags the diner actually filters on — Jain, no onion-no garlic, contains nuts/dairy/gluten, bestseller, chef's special, seasonal/Navratri — plus the allergen and per-serving calorie declaration that FSSAI's Menu Labelling regulations require on menu cards and digital menus for food businesses holding a central licence or operating 10 or more outlets (not binding on a single-outlet cafe today).

**Why it matters.** Sangam models diet as veg/vegan/egg plus a spice number, which does not express the two things Indian diners ask about most: Jain (no root vegetables) and no onion-garlic during fasting periods and for large parts of the Gujarati/Marwari/Jain customer base. The QR menu therefore cannot answer the question and the AI waiter, which reads the same fields (apps/api/src/ai/waiter.ts:60), will confidently recommend a dish the diner cannot eat. Bestseller/must-try tags are also the cheapest conversion lever on a QR menu and there is nowhere to put them. The allergen/calorie half becomes a hard legal requirement the moment a customer reaches ten outlets.

**Evidence.** Basic diet flags exist — packages/db/src/schema/menu.ts:54-57 (isVegetarian, isVegan, containsEgg, spiceLevel) — but `grep -rniE "jain|no onion|onion garlic|allergen|calorie|kcal|nutrition|bestseller|chef.?special|must.?try" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` returns only a UI placeholder string ('Extra spicy, no onion…' at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:1116). No tag table and no free tag column on menuItems (packages/db/src/schema/menu.ts:36-70); the CSV importer accepts only category/name/price/description/veg/spice (apps/api/src/menu/import.ts:31-32).

**Who ships it.** Petpooja and Dotpe digital menus carry allergen/tag fields; Zomato and Swiggy require them for listing; Square and Toast ship allergen and nutrition fields

### Happy-hour and time-based price rules

❌ absent · 5d

Prices that change by clock and calendar rather than by hand — 'all beverages 30% off 16:00-19:00 Mon-Thu', 'lunch buffet ₹249 until 15:00', weekend surcharge — evaluated server-side at order time and shown on the bill as the reason for the price.

**Why it matters.** Filling the 15:00-19:00 dead zone is the standard lever a cafe has for utilisation, and today it can only be done by the cashier remembering to type a discount percentage on every bill. That is unenforceable: staff forget on some bills and over-discount on others, and there is no way afterwards to tell what the happy hour actually cost or earned.

**Evidence.** `grep -rniE "happy.?hour|timeBasedPrice|priceRule|surcharge" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` → no matches. Price resolution has no time input at all: apps/api/src/orders/build.ts:139-172 takes only (cafe, menu, lines, adjustments).

**Who ships it.** Petpooja (Happy Hours), POSist, Rista, Torqus, Toast, Lightspeed, Square

### Open / custom-priced counter item

❌ absent · 3d

A line the cashier can add with a typed name and typed price that is not on the menu — 'Extra plate ₹20', 'Party order ₹4,500', 'Cake cutting charge ₹100' — with its own HSN and tax rate so it still bills legally.

**Why it matters.** Any request that is not already a menu item currently cannot be billed at all: the cashier either takes cash off-book or invents a throwaway menu item that then pollutes the catalogue and the top-sellers report forever. Off-book cash is exactly the behaviour that makes the audit trail Sangam sells worthless.

**Evidence.** `grep -rniE "openItem|open item|custom item|customPrice|priceOverride|unitPriceOverride|miscellaneous" --include=*.ts --include=*.tsx apps packages --exclude-dir=node_modules --exclude-dir=dist` → no matches. Every line must resolve to an existing menu item id or the order is rejected: apps/api/src/orders/build.ts:158-160 (`OrderBuildError('INVALID_ITEM')`), and unit price is always taken from the menu snapshot (:148,167).

**Who ships it.** Petpooja (open item), POSist, Rista, Torqus, Square (custom amount), Toast (open item), Lightspeed

---

## Hardware & peripherals

Sangam has no hardware layer at all. Every physical output in the product is `window.print()` against 80mm-shaped HTML (apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:71,100,127), which means an OS print dialog, an installed driver, and a human clicking OK for every KOT and every bill — the single most common reason an Indian cafe rejects a browser-only POS in the first demo. There is no ESC/POS byte generation, no printer registry, no local print agent, no drawer kick, no station routing, no barcode, no scale, no customer display, no token display and no label printing anywhere in apps/ or packages/ (all confirmed by grep, not inference). Nothing in this domain is legally mandatory in India — the mandates live in the tax/invoicing domain — so every item here is a commercial-viability gap rather than a compliance one, but the first three are effectively blocking for counter-service sales.

### Direct ESC/POS printing without a browser dialog (USB / LAN / Bluetooth)

❌ absent · 25d

A local print agent (Windows tray service + Android companion) paired to the cafe, plus server-side or client-side generation of raw ESC/POS byte streams, so pressing 'Print KOT' pushes bytes straight to the device over USB (libusb/HID), raw TCP port 9100 for LAN printers, or Bluetooth SPP for Android counters. No OS driver, no print dialog, no confirmation click. Not legally required at any threshold.

**Why it matters.** A cashier at a 200-cover evening rush cannot click through a Chrome print dialog twice per order. Today every order opens a new tab (order-builder.tsx:385 window.open with ?autoprint=kot), waits for hydration, fires window.print(), and hopes the OS dialog is set to the right printer with the right paper size — and Chrome on Android and iPad cannot silently print at all. The practical consequence: the counter falls back to writing KOTs by hand, or the cafe buys a competitor. This is the gap that loses the demo.

**Evidence.** grep -rniE "escpos|esc/pos|printnode|qz-tray|navigator\.usb|navigator\.bluetooth|navigator\.serial|thermal" over apps/api/src apps/web/src packages/*/src → zero hits in source (matches occur only in docs/plan prose). No print dependency in apps/web/package.json or apps/api/package.json. The only print path is window.print(): apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:71 and :100, apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/auto-print.tsx:12, apps/web/src/app/cafes/[id]/tables/layout/layout-editor.tsx:152,881.

**Who ships it.** Petpooja (Windows POS + printer utility), POSist/Restroworks (Windows + Android), Rista (local print bridge), Torqus, Dotpe (Android thermal print in-app); Square/Toast/Lightspeed via first-party hardware.

### Weighing-scale integration and sell-by-weight items

❌ absent · 12d

Reading a live weight from a counter scale over USB/RS-232 serial (Essae, Avery India, Goldtech are the common Indian units) via the local print agent, plus a sell-by-weight unit of measure on menu items, fractional quantity through the order and the bill, tare handling, and support for price-embedded barcodes printed by a label scale. Not legally required — though the scale itself must be verified and stamped under the Legal Metrology Act 2009 regardless of the POS.

**Why it matters.** Sweet shops, bakeries, dry-fruit counters and namkeen sections sell by the 250g, and a cafe with a mithai counter at Diwali does most of its month's revenue that way. Today the cashier weighs on the scale, does the ₹/kg arithmetic mentally, and keys a rupee amount into a dummy item — which is exactly how billing errors and under-ringing happen. Worse, Sangam cannot represent it structurally: order_items.quantity is an integer, so 0.25 kg is not expressible at all.

**Evidence.** grep -rniE "weigh|scale|tare|by_weight|grams|kg|uom|unit_of_measure" over apps/api/src apps/web/src packages/*/src → no relevant hits (matches are Tailwind `size-4`, font `weight`, and Next.js cache-life typings). order_items.quantity is integer(): packages/db/src/schema/orders.ts:118. menuItemStock.stockQty is integer(): packages/db/src/schema/inventory.ts:27. No unit/UOM column on menu_items (packages/db/src/schema/menu.ts:37-71).

**Who ships it.** Petpooja (explicitly sold for sweet shops/bakeries), POSist, Rista, Torqus; Square for Retail and Lightspeed Retail globally.

### EDC card-machine integration (amount push and auto-capture)

❌ absent · 12d

Pushing the payable amount from the POS to the counter card machine — Pine Labs Plutus Smart, Paytm EDC, Ezetap, Mswipe, BharatPe — over its local/cloud API, then reading back the approval, card type, last four digits and RRN and attaching them to the order automatically. Not legally required.

**Why it matters.** Right now the cashier reads the total off Sangam's screen and retypes it into the swipe machine, then separately taps 'card' in the app. A single mistyped digit means the drawer and the bank settlement do not tie out, and at day-end the owner has a variance with no way to find which bill caused it. It also means Sangam's card figures are a self-reported tag with no acquirer evidence behind them (paymentMethodValues at the schema level), which weakens the reconciliation story the day-end/Z report is selling.

**Evidence.** grep -rniE "pine.?labs|ezetap|mswipe|\bedc\b|swipe.?machine|card.?machine|bharatpe" over apps/ packages/ docs/ → no real hits (only the `completedCount` / `cancelledCount` substrings). 'card' is a manually chosen enum tag with no acquirer reference: packages/db/src/schema/orders.ts:28 paymentMethodValues, and apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:410. Razorpay integration exists but is online QR only (packages/db/src/schema/orders.ts:88-91 providerOrderId/providerPaymentId).

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe (all market Pine Labs / Paytm EDC integration in India); Square and Toast via their own terminals.

### Multiple kitchen printers with per-station KOT routing

❌ absent · 8d

A station key on each menu item (tandoor / chinese / chai counter / shakes / dessert), snapshotted onto the order line, plus a printer-to-station mapping so one order fires three different slips to three different printers, each carrying only its own lines. Includes a per-station KDS view and per-item bumping. Not legally required.

**Why it matters.** Any cafe past one hot line runs a tandoor, a chinese wok and a beverage/chai counter as separate physical stations, often on separate floors. One combined slip printed at the counter means a runner walks it around, the chai station never sees its order until the food is plated, and drinks land after the meal. Sangam prints one undivided KOT for the whole order, so it is only sellable to a single-counter kiosk.

**Evidence.** grep -rniE "station|kitchen.?printer|printerId|printers" over apps/ packages/ (excluding .next) → zero hits. Sangam's own planning doc confirms it: docs/plan/kitchen.md:411 "Verified: `station` appears nowhere in the repo (grepped apps + packages)". The KOT renders every item of the order on one slip at apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:150-187; menu_items has no station column (packages/db/src/schema/menu.ts:37-71) and order_items has no station snapshot (packages/db/src/schema/orders.ts:105-127).

**Who ships it.** Petpooja, POSist, Rista, Torqus, Square for Restaurants, Toast, Lightspeed.

### Printing when the internet is down

🟡 partial · 8d

A local render-and-print path that survives a WAN outage: a service worker or the print agent holding the cafe's menu and the queued order so a provisional KOT and a provisional slip still come out of the printer, clearly stamped NOT SYNCED with an offline reference, and reconciled when connectivity returns. Not legally required.

**Why it matters.** Indian cafe internet drops daily. Sangam already survives the outage for order capture, but not for paper — the print path navigates to /cafes/[id]/orders/[orderId]?autoprint=kot, a server-rendered Next.js page, so with the link down the counter takes the order into localStorage and the kitchen gets nothing at all. That is worse than no offline mode, because the cashier believes the order went through. There is not even a service worker to fall back on: apps/web has no public directory.

**Evidence.** Offline order capture exists and is localStorage-backed: apps/web/src/lib/offline-queue.ts:17-40, apps/web/src/lib/use-offline-queue.ts:25-70, wired at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:190-207,403-407. But the print trigger requires the server-rendered order page: order-builder.tsx:385-386 window.open(`/cafes/${cafeId}/orders/${data.order.id}?autoprint=kot`), consumed at print-views.tsx:78-104. `ls apps/web/public` → No such file or directory; find apps/web -name "sw.js" -o -name "manifest*" -o -name "service-worker*" → zero results.

**Who ships it.** Petpooja and POSist (local Windows POS keeps billing and printing fully offline), Rista (offline-first Android), Torqus; Toast (offline mode on its own hardware).

### Token / queue display for QSR

❌ absent · 7d

A short daily token number issued per order (resets each day, distinct from the GST invoice serial), a 'Now serving / Preparing' TV display page for the dining area, an audible call and a recall button. Not legally required.

**Why it matters.** Every counter-service QSR, food court stall and cloud-kitchen pickup window in India runs on tokens: the customer pays, gets a slip with '47', and watches the board. Without a token, Sangam's only order identifier is the GST invoice serial from the gapless per-FY sequence — a long, non-memorable number that no one is going to shout across a food court. The practical effect is that staff call out customer names or wave plates, and the pickup counter jams. This is the standard operating model of a large slice of the target segment, not a nice-to-have.

**Evidence.** grep -rniE "token.?display|queue.?display|token.?number|tokenNo|now.?serving|call.?number" over apps/ packages/ → zero hits. orders has only orderNumber (packages/db/src/schema/orders.ts:44), which is the gapless per-financial-year GST invoice serial (packages/db/src/schema/invoice-sequences.ts:9-27), and no separate daily token. The kitchen board is a staff-operated board with bump buttons polling every 10s, not a public display: apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:23,31-51. grep for audio alerts ("new Audio", "beep", "chime", "buzzer") over apps/web/src → zero hits.

**Who ships it.** Petpooja (token display + KDS), POSist, Rista, Dotpe; Square (Order Ready display), Toast.

### Indic-script receipt printing (Devanagari / Tamil / Bengali item names)

❌ absent · 6d

Rendering non-Latin item names to a monochrome bitmap and sending it in ESC/POS raster mode (GS v 0), because the cheap Chinese thermal printers that 80% of Indian cafes already own only carry Latin/CP437-family codepages and print Devanagari as garbage. Includes a font-embedding and line-wrap pass sized to the chosen paper width. Not legally required.

**Why it matters.** A cafe in Indore or Nagpur whose menu is 'पनीर टिक्का' cannot use a POS that prints '???? ????' on the kitchen slip — the kitchen literally cannot read the ticket. This is not an edge case; it is the reason several cloud POS lost the tier-2 market. It also has to be decided at the same time as the ESC/POS renderer, because raster mode changes the whole print architecture (you cannot mix a text-mode bill with a raster item name cleanly).

**Evidence.** grep -rniE "devanagari|codepage|code.?page|GS v|raster|bitmap|iconv|charset" over apps/api/src apps/web/src packages/*/src → zero hits. The bill/KOT are HTML in a mono font (apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:154), which sidesteps the problem only because the browser rasterises the whole page — the moment ESC/POS lands, this becomes a required build item.

**Who ships it.** Petpooja (explicitly markets regional-language KOT printing), POSist, Rista, Dotpe. Square/Toast/Lightspeed do not solve this for India.

### Customer-facing display / pole display

❌ absent · 6d

A second screen facing the diner over the counter — a cheap HDMI monitor, a pole display, or a paired tablet — showing the cart building line by line, the running total, the payable amount and a dynamic UPI QR at settle. Driven by a shared-state channel from the counter terminal. Not legally required.

**Why it matters.** A customer who cannot see what is being rung up disputes the bill at the counter, and in Indian cafes the standard dispute is 'you charged me for two teas, I had one'. The display converts an argument into a glance. Commercially it is also the surface where the UPI QR appears — without it the cashier turns the terminal around or points at a laminated static QR taped to the counter, and static-QR payments cannot be auto-reconciled against the order.

**Evidence.** grep -rniE "customer.?facing|pole.?display|\bcfd\b|second.?screen|dual.?screen|presentation api|broadcastchannel" over apps/ packages/ → zero hits. The order builder renders a single-screen cart only: apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:590-664.

**Who ships it.** Petpooja, POSist, Rista, Dotpe; Square (Customer Display), Toast (Guest Display), Lightspeed.

### Label printing for packaging and delivery

❌ absent · 6d

A separate label document and label-printer path — 40x30mm or 50x25mm stickers via ESC/POS label mode or TSPL/ZPL — carrying order number/token, item name, customer name, veg/non-veg mark, allergen note, the FSSAI licence number and a packed-at timestamp, printed one per package. Not legally required at any threshold: FSSAI labelling obligations for pre-packaged food and the Legal Metrology Packaged Commodities Rules both exempt food packed at the point of sale on customer demand.

**Why it matters.** A cloud kitchen doing 80 Swiggy/Zomato orders an evening has to get the right bag to the right rider, and unlabelled containers are the direct cause of wrong-item delivery — which becomes a customer refund the aggregator charges back to the restaurant. Since Sangam's Settle pillar is literally about clawing back aggregator deductions, shipping the tool that prevents the deduction is on-strategy. Labels are also how a kitchen tracks prep batches and packs multi-item orders without opening every box.

**Evidence.** grep -rniE "label.?print|sticker|\bzpl\b|\btspl\b|dymo|shelf.?life|use.?by" over apps/ packages/ (excluding .next) → no real hits (only React <label> elements and the `setSplitRows` substring at apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:130). No PDF or label renderer exists either: grep -rniE "pdf|puppeteer" over apps/api apps/web/src packages → zero hits.

**Who ships it.** Petpooja (order/packaging label print), POSist, Rista, Dotpe; Toast and Square via kitchen/label printer support.

### Printer registry and paper/format profiles (58mm vs 80mm, copies, cut, logo)

❌ absent · 5d

A stored per-cafe list of printers — name, transport (USB/LAN IP/BT MAC), role (bill / KOT / label), paper width 58mm or 80mm, characters per line, number of copies, auto-cut on/off, header/footer lines and a rasterised logo. Not legally required.

**Why it matters.** 58mm is the cheaper and very common width in small cafes and tea shops; 80mm is standard at a billing counter. Sangam hardcodes 80mm in four places, so a cafe on a 58mm printer gets a bill with the right-hand column of every line — the amounts — chopped off, and there is no setting anywhere to fix it. Equally, 'print 2 copies of the KOT' (one for the pass, one for the runner) is a routine request with no answer. Without a registry there is also nowhere to point routing at, so this blocks the station-routing item.

**Evidence.** No printer/device table exists — packages/db/src/schema/ contains 13 exported schema files (packages/db/src/schema/index.ts:1-13) and none is a printer or device registry; grep -rniE "printer|device" over packages/db/drizzle/migrations/*.sql → zero hits. 80mm is hardcoded at apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:127,154,224 and apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:66,73; grep for "58mm" or "paper.?width" → zero hits.

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe, Square, Toast, Lightspeed.

### Barcode scanning at the counter

❌ absent · 5d

A barcode field on menu items plus an always-listening HID keyboard-wedge capture at the order pad, so a scanner gun adds the scanned SKU straight to the cart. Extends to scanning a printed bill's barcode to pull up an order for reprint or settlement. Not legally required.

**Why it matters.** Almost every Indian cafe also sells packaged goods over the counter — bottled water, cold drinks, chips, cigarettes, bakery packs — and a bakery or sweet-shop counter is nearly all pre-packed SKUs. Without a scanner the cashier hunts a 200-item grid for 'Bisleri 1L' on every sale, which is slower than the shop's existing paper method. It also means Sangam cannot be sold to the bakery/QSR-retail hybrid that is a large share of the target segment.

**Evidence.** grep -rniE "barcode|bar_code|ean13|ean8|upc|scanner|sku|gtin" over apps/ packages/ → zero hits. menu_items has no barcode or SKU column (packages/db/src/schema/menu.ts:37-71) and no such column appears in any migration (grep -rniE "barcode" packages/db/drizzle/migrations/*.sql → nothing).

**Who ships it.** Petpooja, POSist, Rista, Torqus; Square for Retail, Lightspeed Retail. Dotpe partially.

### Cash-drawer kick (ESC/POS pulse on bill settle)

❌ absent · 2d

Sending the ESC/POS drawer-kick pulse (ESC p 0 / 0x1B 0x70) down the printer's RJ11 port when a cash payment is settled, so the till pops open automatically and only on a recorded transaction. Not legally required.

**Why it matters.** In Indian cafes the drawer is chained to the printer precisely so it can only open when a bill prints — that is the whole anti-skimming control. Sangam already has cash-drawer sessions and a day-end variance count, but the physical till has to be opened by hand, which means it gets opened for non-transactions and the variance number the app reports has no physical control behind it. The audit-trail positioning is undermined by the one gap that makes the audit real.

**Evidence.** grep -rniE "drawer" over apps/ packages/ returns only the software cash-reconciliation session: apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx:48-315, apps/api/src/routes/cash-drawer.ts, packages/db/src/schema/cash-drawer-sessions.ts. grep for the pulse bytes ("0x1B 0x70", "ESC p", "kick", "pulse") → zero hits.

**Who ships it.** Petpooja, POSist, Rista, Torqus, Dotpe, Square, Toast, Lightspeed — universally table-stakes.

---

## Customer engagement: loyalty, feedback, reservations

Sangam has effectively not started this domain. Of the 18 tables in the schema, exactly one — `customers` — touches it, and it is a write-once-never aggregate that is never actually written: `upsertFromOrder` exists in the repo but is unreferenced outside its own test mock, so the "Customers" screen renders an empty list in production. There is zero outbound messaging capability in the codebase (no SMS/WhatsApp/email provider, no DLT template registry, no job queue), no consent record, no loyalty/wallet/gift-card ledger, no non-cash tender types (order_payments is cash/upi/card/online only), no feedback capture, and no reservation or waitlist model. The QR diner screen already asks for "Phone (for order updates)" that nothing can ever send. Meanwhile every incumbent the founder names — Petpooja, Restroworks/POSist, Rista, Torqus, Dotpe — either ships this natively or bundles Reelo/EasyRewardz, and it is the single most common up-sell line item in Indian POS pricing. The AI Waiter and Settle wedge is defensible without feature-matching, but customer engagement is the layer that turns a Settle-acquired cafe into a retained one, and none of the plumbing exists.

### Loyalty points programme with earn/burn and tiers

❌ absent · 20d

An owner-configurable programme: points accrue per rupee (or per visit) when a bill closes, a redeemable balance is held in an append-only ledger, points are redeemed at the counter or on the QR menu as a discount or a tender line, accrual reverses on refund/void, and spend tiers (e.g. Silver/Gold) change the earn rate or unlock perks.

**Why it matters.** An independent Bandra or Koramangala cafe competes with Zomato Gold and Swiggy One for the same walk-in; without a first-party reason to return, the aggregator owns the repeat relationship and takes 18-25% of it. Owners ask for this in the first sales call, and today the honest answer is that the cafe has to buy Reelo or EasyRewardz separately and reconcile two customer databases by hand.

**Evidence.** `grep -rniE "loyalt|reward.?point|redeem|redemption" apps packages --include=*.ts --include=*.tsx --include=*.sql` returns only doc/marketing prose (docs/happyspaceplan.md:287, apps/web/src/app/cafes/[id]/customers/page.tsx:46 "The foundation for loyalty") plus false positives on pricing `Tier` types (apps/web/src/app/(marketing)/pricing/page.tsx:14). No loyalty table in any of the 12 migrations (`grep -i loyalt packages/db/drizzle/migrations/*.sql` → nothing) and no loyalty tender: packages/db/src/schema/order-payments.ts:7 fixes methods to ['cash','upi','card','online'].

**Who ships it.** Petpooja (native + Reelo/EasyRewardz), Restroworks/POSist, Rista, Torqus; Square Loyalty and Toast Loyalty globally

### Outbound messaging infrastructure: DLT-registered SMS and a WhatsApp BSP channel

❌ absent · 16d · **legally mandatory**

The plumbing every other capability in this domain sits on: per-cafe provider credentials (MSG91/Gupshup/Kaleyra for SMS, a Meta BSP such as Gupshup/Wati/AiSensy/Interakt for WhatsApp), a registry of approved sender headers and content templates with their DLT template IDs, a durable send queue with retry and throttling, delivery-receipt webhooks, and per-message cost accounting. Legally: under TRAI's TCCCPR 2018 every commercial SMS to an Indian mobile — transactional included, no volume threshold — must be sent by a DLT-registered principal entity using a registered header and a pre-scrubbed template, or the operator drops it.

**Why it matters.** In India the customer relationship lives on WhatsApp, not email. A cafe that cannot send a message cannot send a bill, a booking confirmation, a feedback link or an offer — which is why Indian owners already pay ₹1,000-3,000/month to Wati or AiSensy on top of their POS. Without this, Sangam's entire engagement story is a UI with no transmitter, and this is also the pipe the founder's WhatsApp-channel AI Waiter roadmap needs.

**Evidence.** `grep -rniE "\bsms\b|twilio|msg91|gupshup|whatsapp|wati|aisensy|dlt|sender.?id" apps packages` finds only the Settle feature's `wa.me` deep link, which opens the owner's own WhatsApp client (apps/web/src/app/settle/settle-tool.tsx:171-175) and a `whatsappSummary` string field (apps/api/src/settle/analyzer.ts:230, packages/types/src/domain.ts:377-378) — no sending. apps/api/package.json dependencies contain no messaging SDK. There is also no job runner to build on: `grep -rniE "bullmq|cron|worker|queue|scheduler" apps/api/src` returns only FIFO comments in the kitchen queue and ioredis's `enableOfflineQueue:false` (apps/api/src/lib/cache.ts:18).

**Who ships it.** Petpooja (SMS credits + WhatsApp add-ons), Restroworks/POSist, Rista, Dotpe, Limetray; Reelo, Wati, AiSensy and Interakt as the standalone products cafes buy today

### Table reservations with confirmation and no-show tracking

❌ absent · 16d

A booking model over the existing floor plan: date/time slots with a turn-time assumption, party size, table assignment, a public booking page or WhatsApp/phone-entered booking, an automated confirmation and a same-day reminder, deposit capture for large parties, and a no-show flag on the customer record. On arrival the booking converts into an open table session rather than being re-keyed.

**Why it matters.** Weekend dinner at a 40-cover Indian cafe is booked over phone calls into a paper diary at the host stand; the diary is the reason two parties are seated at the same table at 8:30 and the reason the owner has no record that a party of twelve did not show. Sangam already has the floor plan and the session model, so the absent piece is the forward-looking layer — and reservation is what makes Dineout/EazyDiner an intermediary that then charges the cafe for its own regulars.

**Evidence.** `grep -rniE "reservation|waitlist|booking|book.?a.?table" apps/api/src apps/web/src packages --include=*.ts --include=*.tsx` returns nothing in this sense — matches are 'reserved for server errors' comments (apps/web/src/app/cafes/new/new-cafe-form.tsx:85) and partySize on an already-seated tab. table_sessions is strictly present-tense: openedAt defaults to now() with no future/booked state (packages/db/src/schema/tables.ts:59-69, status enum ['open','billed','closed'] at line 45). No reservations table in packages/db/drizzle/migrations/*.sql.

**Who ships it.** Restroworks/POSist Reservations, Torqus, Limetray, Petpooja (via integrations); EazyDiner, Dineout (Swiggy) and Zomato Book as the aggregator layer; OpenTable, SevenRooms, Resy, Toast Tables globally

### Campaign manager: segment → template → schedule → send → attribution

❌ absent · 14d

Pick or build an audience, choose an approved SMS or WhatsApp template, preview the cost, schedule or send now, watch delivery status per recipient, and see which orders came back attributed to that campaign via a tracked code or link.

**Why it matters.** A cafe with a slow Tuesday needs to push 300 lapsed regulars a same-day offer without exporting a CSV into a separate tool that has no idea who actually came back. Attribution is the part that makes it renewable: without a rupee number against the ₹1,200 of message credits, the owner cancels the module at the first cost review.

**Evidence.** `grep -rniE "campaign|broadcast|template.?message" apps packages --include=*.ts --include=*.tsx` finds only the partners marketing page copy (apps/web/src/app/(marketing)/partners/page.tsx:68) and the Settle classifier's aggregator label 'Marketing campaign' (apps/api/src/settle/classifier.test.ts:12). No campaign or message-log table in any migration; the cafe nav (apps/web/src/app/cafes/[id]/components/cafe-shell.tsx:52-66) lists 14 modules and none is marketing.

**Who ships it.** Reelo, Petpooja Marketing, Restroworks/POSist Campaign Manager, Rista, Limetray, Dotpe; Square Marketing and Toast Marketing globally

### Prepaid wallet / store credit

❌ absent · 11d

A per-customer cash balance the cafe can credit (customer tops up ₹5,000 and gets ₹5,500 of eating, a refund is issued as credit instead of cash, a service failure is compensated) and that is then spent as a tender against a bill, with a statement the customer can see. Note the regulatory line: a balance usable only at the issuing cafe is a closed-system instrument and is outside RBI's PPI Master Direction; the moment balances are poolable across cafes on the Sangam network it becomes a semi-closed PPI needing RBI authorisation and ₹15 crore minimum net worth.

**Why it matters.** Prepaid packs are how Indian cafes and cloud kitchens buy working capital from their own regulars at zero interest, and they are the standard tool for making a bad meal right without giving cash out of the drawer. Today a refund can only go back to a tender (cash/UPI/card), so a manager comping a customer either hands over cash — which then blows the drawer reconciliation — or writes it in a notebook.

**Evidence.** `grep -rniE "wallet|store.?credit|prepaid" apps packages --include=*.ts --include=*.tsx` hits only a Lucide `Wallet` icon for the cash-drawer nav (apps/web/src/app/cafes/[id]/components/cafe-shell.tsx:20,62) and `qrPrepaidRequired`, which is the unrelated pay-before-you-order toggle (apps/api/src/routes/cafes.ts:63, apps/web/src/app/m/[slug]/diner-order.tsx:166). No balance or ledger table in the schema (packages/db/src/schema/index.ts lists 13 modules, none financial-to-customer) and no wallet tender in packages/db/src/schema/order-payments.ts:7.

**Who ships it.** Restroworks/POSist, Petpooja, Rista, Limetray; Toast and Square ship store credit globally

### Coupon / promo code engine with rules and redemption tracking

❌ absent · 11d

Owner-created codes with enforceable rules — validity window, minimum spend, item or category scope, first-order-only, per-customer usage cap, day-part or channel restriction, stacking policy — validated server-side when the bill is built, with every redemption logged against the customer and the campaign that issued it.

**Why it matters.** Discounting is how Indian cafes fight the aggregators, and today Sangam's only mechanism is a manual bill-level rupee discount with a free-text reason that any staff member can apply at any size. That is simultaneously a leakage hole — the classic Indian POS fraud is a cashier discounting a cash bill and pocketing the difference — and a marketing dead end, because an ad-hoc discount cannot be tied back to the campaign that was supposed to have caused it. Sangam's own Settle product exists because unattributed discounts destroy margin; the counter has the same problem.

**Evidence.** What exists is a manual adjustment, not a coupon engine: discountPaise + free-text discountReason on the order (packages/db/src/schema/orders.ts:61-63) with a collapsed UI panel at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:985. `grep -rniE "coupon|promo.?code|offer\b|happy.?hour|combo|bogo" apps/api/src packages/db/src packages/types/src` finds no code, rule or redemption model — only Settle's aggregator-label keyword list (apps/api/src/settle/classifier.ts:36) and AI-waiter prompt text (apps/api/src/ai/waiter.ts:59-60).

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus, Dotpe, Reelo; Square and Toast globally

### Gift cards / prepaid vouchers

❌ absent · 10d

Issue a coded voucher (printed at the counter or sent as a link), track its balance, redeem it fully or partially as a tender, let a holder check the balance without staff help, and report outstanding liability. GST treatment matters: per Circular 243/37/2024-GST following the 55th GST Council, the sale of a voucher is neither a supply of goods nor services — GST attaches to the underlying supply at redemption — so the sale must not hit the GST output ledger, and unredeemed breakage is not taxable.

**Why it matters.** Diwali and corporate gifting is a real seasonal revenue line for cafes, and it is cash collected months before the food cost is incurred. Without it the cafe either forgoes the season or issues paper vouchers with no balance tracking, which staff then honour twice. Get the GST side wrong and the cafe pays tax at issuance and again at redemption.

**Evidence.** `grep -rniE "gift.?card|voucher" apps packages --include=*.ts --include=*.tsx --include=*.sql` returns zero hits outside node_modules and the Settle aggregator-deduction classifier's keyword list (apps/api/src/settle/classifier.ts:36, which matches 'coupon'/'promo' in Zomato statement labels — unrelated). No voucher table in packages/db/drizzle/migrations/*.sql; no gift-card tender at packages/db/src/schema/order-payments.ts:7.

**Who ships it.** Petpooja, Restroworks/POSist, Rista; Square Gift Cards, Toast, Lightspeed globally

### Post-meal feedback capture with review routing

❌ absent · 10d

After the bill closes, a short rating form reaches the customer by WhatsApp/SMS or a QR on the bill; low scores open a private ticket that alerts the owner immediately, high scores are routed onward to the cafe's Google Business or Zomato listing. Ratings tag the order, so scores can be sliced by dish, day-part and the staff member on shift.

**Why it matters.** For a small Indian cafe, Google and Zomato ratings are the top of the acquisition funnel — a slide from 4.3 to 3.9 is a measurable drop in discovery orders. The daily consequence of not having this is that the owner learns about a bad Sunday from a public one-star review a week later instead of from a private alert while the customer is still in the building. It is also the natural feed for the founder's 'Pulse' pillar, which currently has no customer-side signal at all.

**Evidence.** `grep -rniE "feedback|rating|nps|csat|google.?review" apps/api/src apps/web/src packages/db/src` returns only UI-copy uses of 'feedback' meaning form validation (apps/web/src/app/cafes/[id]/menu/csv.ts:5, apps/web/src/components/ui/button.tsx:9) and Settle's DISCOUNT_REVIEW finding code (apps/api/src/settle/analyzer.ts:122). No rating column on orders (packages/db/src/schema/orders.ts) and no public feedback endpoint — apps/api/src/routes/public.ts exposes exactly four routes (lines 70, 103, 164, 194), none of them a feedback POST.

**Who ships it.** Reelo, Petpooja Feedback, Restroworks/POSist, Limetray, Torqus; SevenRooms, Toast Guest Feedback and Square Feedback globally

### Customer segmentation and RFM analytics

❌ absent · 10d

Recency/frequency/monetary scoring over order history producing usable buckets — champions, at-risk, lapsed, one-time-only, high-value — as saved segments that feed campaigns directly, plus a repeat-rate and cohort view so the owner can see what share of this month's revenue came from returning customers.

**Why it matters.** Without segments the only campaign a cafe can run is 'message everyone', which is the fastest way to burn message credits, trip DND complaints and train customers to ignore the brand. Repeat rate is also the metric that tells a cafe owner whether the aggregators are renting them customers or actually building a base — the single most decision-relevant number in this domain, and one Sangam's reports do not compute.

**Evidence.** `grep -rniE "rfm|segment|churn|lapsed|win.?back|repeat.?customer|cohort" apps/api/src apps/web/src packages/db/src packages/types/src` matches only Next.js route-segment types and unrelated comments (apps/api/src/routes/table-sessions.ts:61). The reports repository exposes exactly two methods, dayEnd and a sales rollup (apps/api/src/repositories/reports.ts:18-30) — no customer dimension. The prerequisite data is not even collected: customers carries totalOrders/totalSpentPaise/lastOrderAt (packages/db/src/schema/customers.ts:20-23) but apps/api/src/repositories/customers.ts:16-18 flags 'DEFERRED INTEGRATION: not yet wired into order creation', and grep confirms upsertFromOrder has no caller in apps/api/src/routes, so every aggregate is zero.

**Who ships it.** Reelo (explicit RFM segments), Restroworks/POSist CRM, Petpooja, Rista, Limetray; Square Customer Directory groups and Toast globally

### Walk-in waitlist / queue with notify-when-ready

❌ absent · 9d

A host-stand queue: add a walk-in party with size and phone (or let them self-join by scanning a QR at the door), show a quoted wait, message them when the table is ready, and seat them straight into a table session — with abandonment and actual-vs-quoted wait recorded.

**Why it matters.** Indian casual dining is walk-in dominated, not reservation dominated — a Saturday evening at a popular cafe is a crowd on the pavement, a staff member shouting names, and parties silently leaving for the place next door. Every party that walks off is a lost cover the owner never even counts. It is also the cheapest reason to collect a phone number, feeding everything else in this list.

**Evidence.** `grep -rniE "waitlist|wait.?list|queue" apps/api/src apps/web/src` returns only kitchen FIFO comments (apps/api/src/repositories/orders.ts:52,221) and the web offline request queue (apps/web/src/lib/use-offline-queue.ts). The tables UI has three tabs — floor plan, sessions, history (apps/web/src/app/cafes/[id]/tables/tables-tabs.tsx) — and no queue; table_sessions can only be opened for an already-seated party (apps/api/src/repositories/table-sessions.ts:120).

**Who ships it.** Restroworks/POSist, Limetray, Torqus; Dineout and EazyDiner queue products in India; SevenRooms, Yelp Waitlist and Toast Waitlist globally

### Marketing consent and opt-out ledger (DPDP + DND/NCPR)

❌ absent · 8d · **legally mandatory**

A timestamped, purpose-scoped record of consent captured at each point the phone number is collected (QR order, counter, feedback link, reservation), an honoured opt-out — STOP keyword for SMS, block for WhatsApp — that suppresses all promotional sends, scrubbing against TRAI's DND/customer-preference registry, and the ability to export or erase a customer's data on request. Under the DPDP Act 2023 (rules notified 2025) consent-with-notice is required of every data fiduciary regardless of size for any non-transactional use of personal data; under TCCCPR 2018 promotional messages to a DND-registered number are prohibited outright.

**Why it matters.** The exposure is the vendor's, not just the cafe's: if Sangam ships a blast button with no consent record, it is the platform enabling unlawful promotional messaging across every cafe on it, and the telecom operator will strike the sender header on complaints — which kills the transactional messages too. It is also the founder's own positioning weapon: an audit-trail-first product cannot ship marketing with no audit trail.

**Evidence.** `grep -rniE "consent|opt.?in|opt.?out|unsubscribe|\bdnd\b" apps/api/src apps/web/src packages` matches only `adsConsented`, the Settle flag for whether the owner authorised Zomato ad spend (apps/api/src/routes/settle.ts:18, apps/api/src/settle/analyzer.ts:78) — nothing about customer marketing consent. The customers table (packages/db/src/schema/customers.ts:16-27) has no consent, source or opt-out column, and no OTP/phone-verification path exists (`grep -rniE "\botp\b" apps` → nothing).

**Who ships it.** Reelo, AiSensy, Wati and Interakt ship consent + STOP handling; MSG91/Gupshup/Kaleyra enforce DLT and DND scrubbing for Petpooja and Restroworks/POSist

### Transactional customer notifications (order confirmed / ready / digital bill on WhatsApp)

❌ absent · 7d

Automatic messages fired by order state changes: order accepted, food ready for a takeaway or QR order, payment receipt, and a link to the GST bill delivered to WhatsApp instead of a printed slip.

**Why it matters.** For a cloud kitchen with no dining room, the order-ready message is the entire customer interface, and staff currently have to phone each customer. The digital bill is also the cheapest lawful way to build the customer database — it is a transactional message, so it reaches customers who have not opted into marketing. Sangam's QR checkout already labels the phone field "Phone (for order updates)" and then never sends one, which is a promise the product cannot keep in front of a paying diner.

**Evidence.** The field promising updates: apps/web/src/app/m/[slug]/diner-order.tsx:571. The value is stored (apps/api/src/routes/public.ts:31,130) and never read by any sender — `grep -rniE "notification|notify|email|nodemailer|resend|sendgrid|smtp" apps/api/src` returns no messaging code (matches are Array.push and the auth plugin's email claim, apps/api/src/plugins/auth.ts:13). The only status surface is the polled public order page, apps/api/src/routes/public.ts:164.

**Who ships it.** Dotpe (WhatsApp-first ordering), Petpooja, Restroworks/POSist, Rista; Square digital receipts and Toast order-ready texts globally

### Customer recall at the point of sale (phone lookup / typeahead)

🟡 partial · 5d

Typing the first digits of a phone number on the order screen or table-open sheet surfaces the matching customer with their name, address, past orders and any loyalty/wallet balance, and attaches the order to that customer record by id rather than by a loose text field.

**Why it matters.** A counter cashier at a 40-seat cafe cannot spell a repeat regular's name back to them or pull last month's delivery address, so every order re-types the phone from scratch and the same customer accumulates as three rows with three spellings. Nothing else in this domain works without it: loyalty points cannot be redeemed, a wallet cannot be debited, and a birthday list cannot be trusted if the identity is a free-text string.

**Evidence.** Capture exists, recall does not. Counter phone field is uncontrolled free text at apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:1100-1108; QR diner equivalent at apps/web/src/app/m/[slug]/diner-order.tsx:571-581; the value lands on orders.customerPhone (packages/db/src/schema/orders.ts:52-53) and stops. The customers API exposes only list and get-by-id (apps/api/src/routes/customers.ts:31-58) — no phone-prefix search endpoint — and `grep -rn "customers" apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx` returns nothing, so the order screen never queries the customer table. `grep -rn upsertFromOrder apps/api/src` hits only the repo definition (apps/api/src/repositories/customers.ts:20,78) and a test mock, so the table is never populated at all.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus, Dotpe, Square, Toast — universally table stakes

### Birthday and anniversary marketing

❌ absent · 5d

Capture date of birth and anniversary at order or feedback time, then run a daily job that issues a personalised offer a few days ahead of the date and tracks whether it was redeemed.

**Why it matters.** Birthday parties are one of the highest-ticket covers an Indian cafe books — a table of ten with cake and beverages against a normal party of three — and it is the single most reliably converting automated message in the category. Sangam cannot run it at all today because there is nowhere to put a date of birth.

**Evidence.** `grep -rniE "birthday|anniversar|dateOfBirth|\bdob\b" apps/api apps/web/src packages/db/src packages/types/src` returns zero hits. The customers table has exactly seven columns and no date-of-birth field (packages/db/src/schema/customers.ts:16-27), mirrored in packages/types/src/customers.ts:11-21.

**Who ships it.** Reelo, Restroworks/POSist, Petpooja, Limetray; Square Marketing automations and Toast globally

---

## Multi-outlet, chain & franchise

Sangam has no chain layer at all — it is a single-outlet POS that happens to let one Supabase account own several unrelated `cafes` rows. All 18 tables in the schema are keyed by a flat `cafeId`, and every authenticated route is gated by exactly one predicate, `findByIdAndOwner(cafeId, ownerId)` (apps/api/src/routes/cafes.ts:146), so there is no organization, brand, outlet-group, or membership entity anywhere. The only multi-outlet affordance that exists is a card grid at `/cafes` listing the owner's own cafes; every capability the domain requires downstream of that — central menu push, virtual brands, consolidated reporting, stock transfer, royalty, regional-manager access — is absent, not partial. Two of these are cheap and disproportionately valuable (outlet switcher, outlet cloning); two are structurally expensive because they need a foundation Sangam does not have (per-outlet access grants require rewriting the guard in every route; stock transfer requires a raw-material inventory model that does not exist).

### Inter-outlet stock transfer and central-kitchen indent

❌ absent · 25d

An indent → dispatch → in-transit → receive-with-variance workflow moving raw materials or semi-prepared goods between a commissary and outlets, or outlet-to-outlet, with valuation posted to both ledgers. Where the two outlets hold different GSTINs, the movement is a supply between distinct persons under s.25(4) CGST Act and requires a tax invoice, and an e-way bill once consignment value crosses ₹50,000 — so the transfer document has to be invoice-grade, not a note.

**Why it matters.** Indian chains centralise prep: one commissary makes the gravy bases, marinades and dough overnight and vans them to outlets each morning. Without a transfer record the stock simply vanishes from the central kitchen's books and appears nowhere, so shrinkage between kitchen and outlet is invisible and every consumption variance is unattributable. Operators fall back to WhatsApp photos of a handwritten challan — which is also why cross-GSTIN chains routinely move goods without the invoice the law requires. Sangam cannot even represent the objects being moved: its inventory is a per-menu-item sale counter, so there is no atta, no paneer, no gravy base to transfer.

**Evidence.** grep -rniE "transfer|indent|stock.?request" over apps and packages returns nothing. The whole inventory model is packages/db/src/schema/inventory.ts:22-25 — one menu_item_stock row per menuItemId holding stockQty and lowStockThreshold, with only list/update/restock/decrementForOrder in apps/api/src/repositories/inventory.ts:65-98. grep -rniE "vendor|supplier|purchase.?order|\bgrn\b|recipe|\bbom\b|ingredient|raw.?material" over apps and packages returns only GST 'supplier' prose (apps/web/src/lib/bill-document.ts:6) — no procurement or raw-material entity exists to transfer.

**Who ships it.** Petpooja (stock transfer + central kitchen), POSist/Restroworks (indent and central-kitchen module is a flagship feature for chains), Rista, Torqus

### Central master menu and price management pushed to outlets

❌ absent · 22d

A brand-level item catalogue that outlets subscribe to: HQ edits name/price/HSN/GST rate/recipe once and publishes to selected outlets, with per-outlet price overrides (a mall outlet priced above a highway outlet), per-outlet availability, a publish log showing what changed and when, and a lock so an outlet cashier cannot edit a centrally-managed price locally.

**Why it matters.** Menu categories and items are owned by a single cafe, so a chain re-keys every change per outlet. Raising masala chai from ₹40 to ₹45 across five outlets is five separate edit sessions, and the outlet that gets missed keeps selling at ₹40 for weeks — the owner only finds out from a margin gap at month end. Worse for compliance: an HSN code or GST-rate correction applied at four outlets and forgotten at the fifth produces wrong tax on every bill that outlet prints until someone notices. Price drift between outlets of the same brand also draws customer complaints and gives cashiers cover to 'adjust' at the counter.

**Evidence.** packages/db/src/schema/menu.ts:16-71 — menuCategories and menuItems both carry a mandatory `cafeId` and nothing above it; there is no catalogue, template, price-list, or publish table among the 18 tables in packages/db/drizzle/migrations (grep 'CREATE TABLE'). grep -rniE "price.?tier|priceList|central|master.?menu" across apps and packages returns nothing. The nearest workaround is a per-cafe CSV import (apps/api/src/routes/menu.ts:176-187, apps/web/src/app/cafes/[id]/menu/menu-import.tsx) — one-way, unlinked, and with no matching export (the only download is a hardcoded sample at menu-import.tsx:13-21).

**Who ships it.** Petpooja (central menu management), POSist/Restroworks (built around HQ menu control), Rista, UrbanPiper (menu sync across outlets), Toast (multi-location menu management), Square

### Multiple brands from one kitchen (virtual/cloud-kitchen brands)

❌ absent · 20d

A brand entity distinct from the physical outlet, so one kitchen runs several menus under separate customer-facing identities. Requires per-brand menu binding, per-brand bill identity (trade name, FSSAI licence number, logo, and — where the brands are separate legal entities — GSTIN), brand tagged onto each order and KOT so the line cook knows which packaging to use, a public QR/ordering slug per brand, and per-brand sales and P&L.

**Why it matters.** This is the default operating model for Indian cloud kitchens — one 300 sq ft Gurgaon or Bengaluru kitchen running a biryani brand, a momo brand, and a healthy-bowls brand on Zomato and Swiggy simultaneously. In Sangam that operator must create three separate `cafes` rows for one physical kitchen, which then splits his stock, his staff roster, his cash drawer, and his day-end into three fictional outlets he has to reconcile by hand — and gives him no way to see combined kitchen throughput or true per-brand contribution. Bills are also wrong: FSSAI licence display is per food business operator, and each brand's declared name must appear on its own bill.

**Evidence.** grep -rniE "\b(brand|outlet)\b" across apps/api/src, apps/web/src, packages/*/src returns only marketing copy and CSS variable names (apps/web/src/app/(marketing)/pricing/page.tsx:43 'multi-outlet brands', apps/web/src/components/ui/logo.tsx:6 'brand coral', docs/*) — no brand column, table, or type. packages/db/src/schema/cafes.ts:24-46 gives one name, slug, gstin, fssai and logoUrl per cafe. packages/db/src/schema/orders.ts:25 defines the only channel dimension as orderSourceValues = ['counter','qr','phone'] — no brand axis. The public menu is one slug per cafe (apps/api/src/repositories/cafes.ts:44 findBySlug, apps/web/src/app/m/[slug]).

**Who ships it.** Petpooja (multi-brand under one outlet), Rista (explicitly cloud-kitchen oriented), POSist, UrbanPiper (the default integration layer for Indian multi-brand cloud kitchens), Toast (multi-concept)

### Per-outlet user access grants with a role per outlet (regional manager login)

❌ absent · 18d

A membership table binding an auth user to N outlets with a role scoped to each grant (e.g. regional manager: full access to Gurgaon + Noida, read-only reports for Delhi; accountant: reports only, everywhere). Includes an invite flow that provisions the second human's login, and a guard that resolves permissions from the grant rather than from cafe ownership.

**Why it matters.** Today the only credential that opens any Sangam outlet is the founder's own Supabase password. A 4-outlet NCR chain owner cannot give his area manager access without handing over the master account — which means the manager can also edit GSTIN, delete the menu, and see every other outlet's cash position. In practice the owner ends up either sharing the password (destroying the audit trail's meaning, since every action logs as him) or driving to each outlet himself. It also makes the product unsellable to any operator whose CA or ops head needs their own scoped login.

**Evidence.** grep -rniE "membership|user_?cafe|cafe_?member|permission" over apps/api/src, apps/web/src, packages/*/src returns one unrelated hit (apps/api/src/settle/classifier.ts:36, the string 'pro membership'). The only authorization primitive is ownership: apps/api/src/repositories/cafes.ts:41-45 exposes only listByOwner/findByIdAndOwner, and every route calls it (apps/api/src/routes/cafes.ts:146, reports.ts:35-36, inventory.ts:42-44, menu.ts, orders.ts, tables.ts, staff.ts, customers.ts, expenses.ts, cash-drawer.ts, audit-logs.ts, table-sessions.ts). packages/db/src/schema/staff.ts:20-24 has a role enum but no auth-user column — staff carry only an unverified pinHash, so a staff row cannot log in at all.

**Who ships it.** Petpooja (per-outlet user roles across a chain), POSist/Restroworks (enterprise role hierarchy: HQ / regional / outlet), Rista, Toast, Lightspeed, Square

### Consolidated cross-outlet reporting

❌ absent · 12d

Group-level sales, tax, payment-mix, discount and expense reporting that spans a set of outlets in one query and one screen — combined totals for a date range, side-by-side outlet comparison and ranking, same-item performance across outlets, and a consolidated day-end/Z roll-up plus export for the CA.

**Why it matters.** Every reporting call in Sangam takes exactly one cafeId, so a 3-outlet owner literally opens three browser tabs and adds the numbers in a notebook or a spreadsheet every night. He cannot answer the questions that decide his month: which outlet's discount percentage is drifting, which outlet sells the paneer tikka nobody else moves, whether the new Noida store is actually above breakeven. The 3-10 outlet chain owner is the archetype the founder's own market analysis names as the best-fit customer for the multi-outlet console — and the console is the one thing not built.

**Evidence.** apps/api/src/repositories/reports.ts:20 `dayEnd(cafeId: string, date: string)` and :25-26 `sales(cafeId: string, ...)` — both take a single scalar cafeId, and the implementations filter on eq(schema.orders.cafeId, cafeId) at :39 and :163. Routes are singular too (apps/api/src/routes/reports.ts:44-55, :64-75). grep -rniE "consolidat|rollup|cross.?outlet|all.?cafes" over apps and packages returns only unrelated hits (a per-table rollup type at packages/types/src/domain.ts:261 and a consolidated single-table-session bill at apps/web/src/app/cafes/[id]/tables/sessions/[sessionId]/print/page.tsx:14). There is no route above /cafes/:cafeId in apps/api/src/routes/index.ts other than POST/GET /cafes and /settle/analyze.

**Who ships it.** Petpooja (multi-outlet dashboard), POSist/Restroworks (consolidated chain analytics is its core enterprise pitch), Rista, Torqus, Toast, Square, Lightspeed

### Franchise royalty computation and franchisee statements

❌ absent · 12d

Royalty terms held per franchised outlet (percentage of net sales, minimum guarantee, ad-fund/marketing contribution percentage, exclusions such as taxes and aggregator commission), computed monthly from POS-audited net sales, rendered as a statement both franchisor and franchisee can see, with the royalty invoice itself carrying 18% GST as a service supply and a TDS note for the franchisee's deduction.

**Why it matters.** Franchising is how Indian F&B brands scale — and royalty is the single most disputed number between franchisor and franchisee, because the franchisee reports his own sales and the franchisor has no independent read of the POS. Without this, the franchisor's back office rebuilds every franchisee's monthly royalty in Excel from figures the franchisee emails, arguments run for weeks over whether GST and Swiggy commission come out of the base, and the collection cycle slips. It is also the one feature that makes a POS mandatory for a franchisee rather than optional — the franchisor imposes it — which is the highest-leverage distribution channel a POS in this market has.

**Evidence.** grep -rniE "royalt|franchis" across apps/api/src, apps/web/src, packages/*/src returns zero code hits — the only occurrences repo-wide are documentation and marketing prose (docs/market-analysis.md, docs/sales-pitch.md:56, docs/multi-agent-os-decision.md). No royalty, agreement, or franchisee table exists in packages/db/drizzle/migrations (18 CREATE TABLE statements, none related).

**Who ships it.** POSist/Restroworks (explicit franchise-management module), Petpooja, Rista; Toast ships franchise/multi-location reporting as the global reference point

### Cross-outlet customer identity

❌ absent · 8d

One customer record per phone number at the brand or group level rather than per outlet, with visit and spend history attributed per outlet underneath it, so a diner recognised at one outlet is recognised at all of them.

**Why it matters.** Customers are keyed uniquely on (cafeId, phone), so the same person is a brand-new stranger at the chain's second outlet: no visit history, no spend total, and — the moment loyalty or credit is built on this table — points earned at Connaught Place that cannot be redeemed in Saket. For a chain that is the customer-facing failure that makes the whole CRM look broken, and it silently corrupts the numbers too: 'repeat customer rate' and average spend are computed per outlet, so a genuinely loyal multi-outlet diner reads as several one-time visitors and the owner under-counts his own retention.

**Evidence.** packages/db/src/schema/customers.ts:18-28 — cafeId is mandatory and the uniqueness constraint is uniqueIndex('customers_cafe_phone_idx') on (cafeId, phone) at :28, with the file comment at :10 stating 'one row per (cafeId, phone)'. Repository and routes are cafe-scoped throughout (apps/api/src/routes/customers.ts:32, :45). grep -rniE "loyalt|points|group.?customer" over apps and packages returns nothing.

**Who ships it.** Petpooja (chain-wide CRM and loyalty), POSist, Rista, Toast, Square — cross-location loyalty is the standard chain expectation

### New-outlet setup by cloning an existing outlet

❌ absent · 5d

Creating outlet N+1 by copying an existing outlet's menu categories and items (with HSN and GST overrides), modifier groups, table/floor layout, tax mode and charge defaults, and staff role structure — with a preview of what will be copied and the option to copy the structure without the data.

**Why it matters.** Opening a second outlet in Sangam means starting from an empty cafe and re-entering a 120-item menu by hand or via CSV — and there is no menu export, so the CSV has to be reconstructed from scratch. That is a lost day on the outlet's install morning, and hand re-entry is exactly where HSN codes and per-item GST overrides get dropped or mistyped, which then prints wrong tax on every bill from the new outlet. It is also the moment a chain is most likely to churn to a competitor, because expanding is when they first notice the product has no chain support.

**Evidence.** grep -rniE "clone|duplicate.?(cafe|outlet)|copy.?(from|outlet)" over apps and packages returns nothing. POST /cafes (apps/api/src/routes/cafes.ts:88-137) creates a bare row from address and tax fields only — no source outlet parameter. The only bulk path is CSV import per cafe (apps/api/src/routes/menu.ts:176), and there is no corresponding export: the only download in apps/web/src/app/cafes/[id]/menu/menu-import.tsx:228-229 is a hardcoded six-line sample CSV defined at :13-21.

**Who ships it.** Petpooja (copy outlet setup), POSist, Rista, Toast, Square

### Per-outlet invoice series and document numbering

❌ absent · 4d · **legally mandatory**

A configurable invoice-series prefix per outlet, with the gapless counter keyed by (outlet, series, financial year), so outlets sharing a GSTIN issue distinct serials. CGST Rule 46(b) requires a tax invoice number to be a consecutive serial unique for a financial year within the registration — not within the outlet. The trigger is two or more outlets operating under a single GSTIN, which is the norm for a chain with several outlets in one state under one legal entity (separate states already require separate registrations under s.22/25 CGST Act).

**Why it matters.** Sangam mints `INV/2026-27/000001` per cafe with no outlet token, so a company running two Delhi cafes on one GSTIN issues two different bills numbered INV/2026-27/000001 on day one. GSTR-1 is filed per GSTIN, so those duplicate serials collide at upload, the CA has to hand-renumber, and the outward-supplies register no longer matches the physical invoices — precisely the defect that surfaces in a GST audit and precisely the audit-trail credibility Sangam is being positioned on. There is also no way to tell from a bill which outlet issued it, so a customer complaint or a refund request cannot be routed.

**Evidence.** apps/api/src/orders/build.ts:209 `buildBillNumber(fy, seq)` returns `INV/${fy}/${seq}` — no outlet or series component. The counter is keyed on (cafeId, fy) only: packages/db/src/schema/invoice-sequences.ts:26 uniqueIndex on (cafeId, fy), allocated at apps/api/src/repositories/orders.ts:117-125. grep -rniE "series|prefix" over apps/api/src for invoice numbering returns nothing configurable; packages/db/src/schema/cafes.ts:24-46 has no invoice-series field. Note the schema comment at invoice-sequences.ts:11-12 asserts the requirement is 'unique per outlet per FY', which is the wrong unit — the rule binds per registration.

**Who ships it.** Petpooja, POSist, Rista, Torqus — per-outlet invoice-series configuration is standard in every Indian POS because Indian CAs demand it

### One login spanning outlets — in-app outlet switching and a group home

🟡 partial · 3d

Switching between outlets without leaving the working screen: an outlet picker in the sidebar that keeps you on the same page (Orders at Outlet A → Orders at Outlet B), a remembered last-used outlet, and a group-level landing surface instead of a static card grid.

**Why it matters.** The mechanism exists but is unusable at the pace of service. An owner checking the 8pm rush across three outlets must, for each one, click back to /cafes, pick a card, then re-navigate four levels down to Kitchen or Orders — and the sidebar never tells him which outlet he is currently looking at except by the name in the profile chip. During a dinner rush that is the difference between glancing at all outlets and checking none.

**Evidence.** Present: GET /cafes lists the owner's cafes (apps/api/src/routes/cafes.ts:139-141 → repositories/cafes.ts:56-60) and apps/web/src/app/cafes/page.tsx:25-77 renders them as cards. Missing: grep for 'Switch|switch|href="/cafes' in apps/web/src/app/cafes/[id]/components/cafe-shell.tsx returns nothing — the 14-item nav at cafe-shell.tsx:49-64 is hardcoded to a single `base = /cafes/${cafeId}` (cafe-shell.tsx:48) with no picker and no link back to the outlet list.

**Who ships it.** Petpooja, POSist, Rista, Toast, Square, Lightspeed — universal; a location switcher is table stakes

---

## Delivery & order fulfilment

Sangam has zero delivery capability — not partial, absent. There is no fulfilment/order-type concept at all: `orderSourceValues = ['counter','qr','phone']` (packages/db/src/schema/orders.ts:25) records where the order was *typed*, not how it is *fulfilled*, so a delivery order is indistinguishable from a dine-in one. The 18-table schema contains no rider, address, zone, trip, dispatch or COD entity; `staffRoleValues` has no rider role; `customers` stores only phone/name/totals with no address. Zomato and Swiggy appear only inside the Settle CSV auditor, never as an order channel — which means aggregator sales cannot be segregated for GST §9(5), the one legally-mandated item in this domain. The single delivery-adjacent field that exists, `packagingChargePaise`, is a rupee amount a cashier types by hand per bill (apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:186). For a product whose stated target is cloud kitchens, this is the largest structural hole in the system: a cloud kitchen has no tables, no counter and no QR — every order it takes is a delivery order Sangam cannot model.

### Aggregator order ingestion (Zomato / Swiggy / ONDC orders landing in the POS and KDS)

❌ absent · 25d

A live channel that pulls Zomato/Swiggy/ONDC orders into the POS the moment they are placed — auto-accept or manual accept, ticket to the KDS, item mapping to the internal menu, menu and price push outbound, and stock-out / store-offline toggling pushed back to the platform. Delivered either via each platform's partner API or through a middleware (UrbanPiper, Petpooja's channel layer).

**Why it matters.** This is the daily reality Sangam ignores: a typical Delhi/Bengaluru cafe takes 40-70% of its covers through Zomato and Swiggy. Today the kitchen reads those tickets off two separate merchant tablets, and someone re-types them into the POS at night (or never does). The consequence is concrete — the KDS shows a false queue so the kitchen sequences wrong, the item-level stock counts Sangam already keeps go stale within an hour, the day-end Z figure understates real sales, and an item that runs out is still being sold on Swiggy because nobody remembered to toggle it there. Sangam already sells Settle to fight aggregator deductions, which makes the absence of aggregator order data especially sharp: it disputes the invoice without ever having seen the orders.

**Evidence.** `grep -rn -i "zomato\|swiggy" apps packages --include=*.ts --include=*.tsx` (excluding dist) hits only the Settle statement auditor — apps/api/src/settle/classifier.ts:9, apps/api/src/settle/analyzer.ts:29, apps/web/src/app/settle/settle-tool.tsx:66 — where they are CSV upload options, plus one layout comment at apps/web/src/app/m/[slug]/diner-order.tsx:95. `grep -rn -i "webhook" apps packages --include=*.ts` returns 0 hits, so there is no inbound order endpoint of any kind. apps/api/src/routes/index.ts:23-67 registers no integration route.

**Who ships it.** UrbanPiper (this is its core product), Petpooja, Restroworks (POSist), Rista, Dotpe, Torqus — aggregator integration is the single most-advertised feature in the Indian POS market

### Rider assignment, dispatch board and delivery lifecycle status

❌ absent · 12d

An assignment step (order -> rider, one rider carrying a batch of 2-4 orders on one trip) plus a dispatch screen showing every live delivery, and delivery-specific statuses beyond the kitchen's pending/preparing/ready: packed, assigned, out-for-delivery, delivered, failed/returned — each with a timestamp so dispatch-to-door time is measurable.

**Why it matters.** Without it the manager's answer to 'where is my order' is to phone the rider. Sangam's order lifecycle ends at 'ready' — the moment food leaves the kitchen it disappears from the system, so nobody can see which of the eleven bags on the counter is already assigned, which rider has been out for fifty minutes, or whether the 8:40pm order was ever actually handed over. Every disputed 'we never received it' call becomes a cash write-off because there is no timestamped record of who took it and when.

**Evidence.** packages/db/src/schema/orders.ts:16-22 — `orderStatusValues = ['pending','preparing','ready','completed','cancelled']`, with no dispatch states, and no assignee column on the orders table. `grep -rniE "assignedTo|driverId|out.?for.?delivery|dispatch_?board|runsheet|trip" apps packages --include=*.ts --include=*.tsx` returns 0 real hits (the 22 'trip' matches are 'TrustStrip' and 'round-trip' comments). apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:32 types the board as exactly `'pending' | 'preparing' | 'ready'`.

**Who ships it.** Petpooja (Delivery Management + rider app), Restroworks, Rista, Torqus; Toast ships a dispatch/driver view

### Third-party logistics dispatch (Porter / Shadowfax / Borzo / Pidge / Dunzo-class on-demand riders)

❌ absent · 12d

A dispatch adapter that requests a quote, books a rider, tracks the trip and cancels through an on-demand logistics provider's API, records the actual delivery cost against the order, and falls back to own fleet (or vice versa) when no rider is available or the quote exceeds a ceiling.

**Why it matters.** Most small cafes cannot justify a salaried rider for 8-15 deliveries a day, so they hire per-trip. Without integration the manager alt-tabs to the Porter app, re-types the address, copies the tracking link into WhatsApp by hand, and the Rs 55 trip fee never lands anywhere the P&L can see it — so the owner genuinely does not know whether direct delivery beats paying Swiggy 22% commission. That comparison is the exact decision Sangam's Settle pillar is meant to inform.

**Evidence.** `grep -rn -i "dunzo\|shadowfax\|borzo\|pidge\|shiprocket\|loadshare\|delhivery\|3pl" apps packages --include=*.ts --include=*.tsx` returns 0 hits; the 11 'porter' matches are all substrings of `MenuImportError` / `reporter` (packages/types/src/api.ts:145, apps/api/vitest.config.ts:17). apps/api/src/config/env.ts:1-38 declares keys only for Supabase, the LLM provider, Razorpay and Redis — no logistics provider credentials, and no outbound integration module exists under apps/api/src/.

**Who ships it.** Petpooja (bundled 3PL partners), Dotpe, Restroworks, Rista; Toast Delivery Services and Square's on-demand delivery are the global equivalents

### Customer-facing delivery tracking link and status notifications

❌ absent · 9d

A tokenised public tracking page the customer opens from their phone showing order accepted / being cooked / packed / out for delivery with the rider's name and number, plus outbound status messages over WhatsApp (BSP template) or DLT-registered SMS at the key transitions.

**Why it matters.** The 'where is my order' phone call is the single biggest interruption to a small kitchen between 8 and 10pm, and every one of those calls pulls the person running the counter away from billing. Sangam has a public diner surface already (apps/web/src/app/m/[slug]) but it stops at payment — after checkout the customer sees nothing. There is no messaging integration anywhere in the codebase to build on, only a wa.me deep link inside Settle, so even a manual 'your order has left' cannot be sent from the product.

**Evidence.** `grep -rn -i "whatsapp|twilio|gupshup|msg91|interakt" apps packages --include=*.ts --include=*.tsx` matches only the Settle WhatsApp summary feature — apps/api/src/settle/analyzer.ts:230 and apps/web/src/app/settle/settle-tool.tsx:171-175, which opens `wa.me?text=` in a browser tab; there is no messaging provider, no DLT template store, and no env credential (apps/api/src/config/env.ts:1-38). `grep -rn "tracking"` in app code resolves to Tailwind `tracking-` typography classes. The public routes (apps/api/src/routes/public.ts) expose menu and order creation only — no order-status read endpoint for a diner.

**Who ships it.** Dotpe (tracking link is core to its D2C flow), Petpooja, Restroworks, Rista; Toast and Square both ship customer-facing delivery tracking

### Delivery zones and distance-based delivery charges

❌ absent · 8d

Serviceable-area definition by pincode list or drawn polygon, with per-zone rules: delivery fee slabs, minimum order value, free-delivery threshold, and a hard block (or surcharge) on out-of-zone addresses. Distance-band pricing (e.g. free under 3 km, Rs 30 for 3-6 km) is the common Indian shape.

**Why it matters.** Delivery economics in India are decided in the last two kilometres. Without zones a cashier accepts a Rs 180 order 9 km away, and the Rs 70 the rider costs turns a Rs 40 gross-margin order into a loss — repeated twenty times a week that is the difference between a profitable and unprofitable delivery channel. There is also no way to enforce a minimum order value or to stop taking orders from an area the single evening rider cannot reach and back in time.

**Evidence.** `grep -rn "delivery_zone\|deliveryFee\|deliveryCharge\|distanceKm\|geofence\|haversine" apps packages --include=*.ts --include=*.tsx` returns 0 hits. `pincode` exists only on the cafe's own address (packages/db/src/schema/cafes.ts:38 and apps/web/src/app/cafes/new/new-cafe-form.tsx:54) — never on an order or a zone. The bill builder apps/api/src/orders/build.ts:88-90 knows only discount, service charge and packaging; there is no delivery-charge line in the total at all.

**Who ships it.** Petpooja, Restroworks, Rista, Dotpe; Square and Toast both ship delivery-zone/radius pricing

### Fulfilment order type on the order (dine-in / takeaway / delivery / pickup / aggregator channel)

❌ absent · 7d · **legally mandatory**

A first-class `orderType` (or fulfilment channel) field on every order — dine-in, takeaway, self-pickup, own-fleet delivery, and per-aggregator (Zomato / Swiggy / ONDC) — that drives tax treatment, KDS lane, charge rules and reporting. The GST piece is mandatory with no turnover threshold: since 1 Jan 2022 (Notif. 17/2017-CT(R) as amended by 17/2021-CT(R)), restaurant service supplied through an e-commerce operator is taxed by the ECO under CGST §9(5); the restaurant must NOT charge GST on those orders and must report them separately in GSTR-3B Table 3.1.1(ii) and GSTR-1 Table 14(b). The only carve-out is a restaurant in premises with declared room tariff above Rs 7,500/day.

**Why it matters.** Without it every operational decision downstream is blind. A cloud kitchen — Sangam's stated target — has no table and no counter, so 100% of its orders get filed as 'counter' and the day-end report tells the owner nothing about where revenue came from. Worse, if the owner keys a Zomato order into Sangam it computes 5% GST on it and books it as the cafe's own outward supply; that amount is already taxed by Zomato under §9(5), so the cafe's GSTR-3B overstates its taxable turnover and it pays tax twice on the same plate of food. Their CA then has to unpick it by hand every month.

**Evidence.** packages/db/src/schema/orders.ts:25 defines `orderSourceValues = ['counter','qr','phone']` and orders.ts:47 stores it as `source` — an input channel, not a fulfilment type; no `orderType`/`fulfilment`/`channel` column exists on the orders table. apps/api/src/routes/orders.ts:31 hard-codes `source: z.enum(['counter','qr','phone'])`. `grep -rniE "pickup|takeaway|dine.?in" apps packages --include=*.ts --include=*.tsx` returns only apps/web/src/app/cafes/[id]/kitchen/kitchen-board.tsx:319 ('Ready for pickup' UI copy) and apps/web/src/app/(marketing)/page.tsx:119 (a mocked 'Takeaway' row in marketing copy). apps/api/src/repositories/reports.ts:67 splits the day-end by `orders.source`, so no channel P&L is possible.

**Who ships it.** Petpooja, Restroworks (POSist), Rista, Torqus, Dotpe, UrbanPiper; Square and Toast both model order type natively

### Scheduled / pre-orders with delivery and pickup slots

❌ absent · 7d

Future-dated orders taken now and fired to the kitchen automatically at the right prep time, with configurable time slots, per-slot capacity limits, and a scheduled-orders queue the kitchen can see the day before. Covers next-day office lunch orders, party/bulk pre-orders and 'deliver at 1pm' requests.

**Why it matters.** Corporate lunch tiffins and pre-booked party orders are how a small cafe fills the dead 11am-12pm and weekday-afternoon windows, and they are all taken over WhatsApp today. Sangam can only create an order that is live right now, so a pre-order either sits in a notebook until someone remembers it, or it is punched in early and immediately clutters the kitchen display with food that must not be cooked for four hours. Missed pre-orders are the most damaging kind of miss — they are a customer who ordered for twenty people.

**Evidence.** `grep -rn "scheduledFor\|scheduled_at\|prepTime\|prep_time" apps packages --include=*.ts --include=*.tsx` returns 0 hits; `slot` matches only Next.js generated types (apps/web/.next/types/routes.d.ts). The orders table (packages/db/src/schema/orders.ts:83-88) carries createdAt/updatedAt/paidAt only — no promised or scheduled time. apps/api/src/routes/orders.ts:29-67 (createOrderBodySchema) accepts no time field.

**Who ships it.** Petpooja, Restroworks, Dotpe, Rista; Square and Toast both ship scheduled ordering

### Delivery address capture and customer address book

❌ absent · 6d

Structured delivery address on the order — flat/building, street, area, landmark, pincode, optional map pin — saved against the customer so a repeat caller's address is recalled from their phone number, with multiple saved addresses (home/office) per customer.

**Why it matters.** Indian addresses are landmark-driven and unusable as free text: 'behind Ganesh temple, opposite the SBI ATM' is the actual routing information. Sangam captures only `customerName` and `customerPhone` on an order and only phone/name on the customer record, so a phone delivery order has literally nowhere to put the address — the cashier scribbles it on the KOT or a chit. Every repeat order re-asks for the address (30-60 seconds of phone time in the dinner rush), and any address that is wrong is a rider round-trip and often a lost order.

**Evidence.** packages/db/src/schema/orders.ts:52-53 carries `customerName` and `customerPhone` only; there is no address column. packages/db/src/schema/customers.ts:19-24 stores phone, name, totalOrders, totalSpentPaise, lastOrderAt — no address. `grep -rn -i "address" apps/api/src packages/db/src packages/types/src` resolves entirely to the cafe's own `addressLine1/addressLine2` (apps/api/src/repositories/cafes.ts:11-12) and test fixtures. `grep -rniE "latitude|longitude|geocod|mapbox|google maps|olamaps"` returns 0 hits.

**Who ships it.** Petpooja, Restroworks, Rista, Dotpe, Torqus — universal; Dotpe's whole D2C ordering flow is built on it

### Cash-on-delivery reconciliation with the rider

❌ absent · 6d

A per-rider cash ledger: COD amounts owed per trip, cash handed back at shift end, running shortfall/excess per rider, and settlement of that cash into the existing cash-drawer session so the day-end Z figure balances. Includes a printed/on-screen handover sheet the rider signs off.

**Why it matters.** COD is still 30-50% of own-fleet delivery volume in most Indian neighbourhoods, and it is the biggest cash-leak point a small cafe has — the rider is walking around with several thousand rupees of the owner's money every evening. Sangam's cash-drawer session records an opening float and a counted close (packages/db/src/schema/cash-drawer-sessions.ts) but has no concept of cash that is out on the road, so a delivery cafe's drawer variance is meaningless: the 'expected' figure can never reconcile while COD money is in a rider's pocket. Shortfalls become an argument at 11pm with no ledger to point at.

**Evidence.** `grep -rniE "\bcod\b|cash on delivery" apps packages --include=*.ts --include=*.tsx` returns 0 hits. packages/db/src/schema/cash-drawer-sessions.ts:18-32 has `openedByStaffId`, `openingFloatPaise`, `closingCountedPaise`, `expectedCashPaise` — no rider link, no out-with-rider bucket, no per-rider ledger table. The full table list (`grep -h "CREATE TABLE" packages/db/drizzle/migrations/*.sql`, 18 tables) contains no rider or cash-handover table.

**Who ships it.** Petpooja (delivery-boy cash settlement report), Restroworks, Rista, Torqus

### Rider roster (delivery staff as a first-class role, with vehicle and compliance records)

❌ absent · 5d

Riders as staff with their own role and login: contact number, shift on/off duty toggle, vehicle number, driving-licence and insurance details, FSSAI food-handler medical-fitness certificate expiry (FSS Regulations Schedule 4 requires the FBO to keep annual medical records for food handlers — the record obligation is on the business, not on the POS, hence not marked mandatory here), and per-trip payout or per-day wage accrual.

**Why it matters.** You cannot assign a delivery to someone the system does not know exists. Sangam's staff roles are owner/manager/cashier/waiter, so the two boys on Splendors who do every evening's deliveries are invisible to the software — no on-duty state, so dispatch cannot know who is available; no per-trip record, so the Rs 25-30/delivery incentive that is standard in Indian own-fleet is settled from a diary; and no vehicle/DL record when an accident or a police check happens on a food run made in the restaurant's name.

**Evidence.** packages/db/src/schema/staff.ts:8 — `staffRoleValues = ['owner','manager','cashier','waiter']`; the staff table (staff.ts:17-36) has name, role, pinHash, isActive and nothing else — no phone, vehicle, licence, duty state or payout. `grep -rniE "\brider\b|delivery_?(boy|partner|agent|person)|vehicle" apps packages --include=*.ts --include=*.tsx` matches only apps/api/src/settle/classifier.ts:49, where 'rider' is a keyword used to categorise an aggregator deduction line — a false positive, not a rider entity.

**Who ships it.** Petpooja, Restroworks, Rista, Torqus (all ship a delivery-staff module with payout reporting)

### Packaging charge rules per channel and per item

🟡 partial · 4d

Packaging charge derived automatically rather than typed: a per-item packaging rate (a biryani handi costs more to pack than a roti), a per-channel default (nothing on dine-in, a set amount on delivery/takeaway), and an optional per-bill cap. GST treatment follows the restaurant service as a composite supply, so it must sit inside the taxable base — which the existing calculation already does correctly.

**Why it matters.** Today the amount is a free-text rupee box a cashier fills in during the rush, so it is inconsistent order to order and is simply forgotten on busy nights — a Rs 10-25 leak per delivery order that is pure margin, several thousand rupees a month. It is also applied nowhere automatically for takeaway or delivery, because Sangam has no order type to key it off. The calculation itself is sound; the rules engine around it does not exist.

**Evidence.** The money field and tax treatment exist: packages/db/src/schema/orders.ts:65 (`packagingChargePaise`), apps/api/src/orders/build.ts:88-90 folds it into the taxable base, and it prints at apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:306. But it is a single manual bill-level number — apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx:186 (`useState('')`) and :282 (`Math.round(Number(packagingRupees) * 100)`), and apps/api/src/routes/orders.ts:65 accepts it as a raw `packagingChargePaise` integer. There is no packaging field on menu items (packages/db/src/schema/menu.ts:36-68) and no channel to attach a rule to. The QR/diner path always passes the built default of 0 (apps/api/src/routes/public.ts:139).

**Who ships it.** Petpooja, Restroworks, Rista, Dotpe (per-item packaging charge is standard in the Indian market)

---

## Workforce: attendance, payroll, tips

Sangam has essentially nothing in this domain. The entire workforce surface is one table — `staff` (packages/db/src/schema/staff.ts) with 8 columns: id, cafeId, name, role, pinHash, isActive, createdAt, updatedAt — exposed as plain CRUD (apps/api/src/routes/staff.ts, 154 lines) and a roster screen (apps/web/src/app/cafes/[id]/staff/staff-manager.tsx). None of the 18 tables in the migration set covers attendance, shifts, leave, advances, payroll, or tips, and greps for `attendance|payroll|payslip|overtime|tip|roster|muster|EPFO|UAN|Form 16` across apps/ and packages/ return zero hits. Two structural facts make the gap wider than "a missing HR module": orders carry no staffId at all (the only staff reference anywhere in the schema is the nullable, client-supplied `opened_by_staff_id` on cash_drawer_sessions), so per-waiter sales, upsell rate and void-rate are not computable and never will be until attribution is added; and `verifyPin` (apps/api/src/lib/pin.ts:20) has zero call sites, so no staff member can actually log in to be attributed to anything. The pinHash column and the `waiter` role are decoration. A planning doc for staff identity exists (docs/plan/staff-identity.md) but nothing from it is built.

### Payroll run and payslip generation

❌ absent · 20d · **legally mandatory**

A monthly cycle that pulls attendance and leave, pro-rates for loss-of-pay days, builds the earnings/deductions structure (basic, HRA, allowances, less advances), applies EPF (mandatory at 20 or more employees, 12% on wages up to ₹15,000), ESIC (mandatory at 10 or more employees in most states, on gross up to ₹21,000), state professional tax and TDS under section 192, then issues a wage slip and a bank transfer file. A wage register and a wage slip are prescribed under the Minimum Wages (Central) Rules 1950 (Rule 26, Forms X and XI), and wages must be paid by the 7th or 10th depending on headcount under the Payment of Wages Act.

**Why it matters.** Payroll for eight to twenty people is currently a phone calculator, a WhatsApp message and a cash envelope on the 1st. Nobody gets a payslip, so a staff member cannot open a bank account or take a loan, and the owner has no defensible record of what was paid. Once the cafe crosses 10 or 20 heads the ESI and PF obligations attach automatically and a POS that already holds attendance is the only place the numbers exist — but Sangam cannot even hold the wage rate today.

**Evidence.** `grep -rniE 'payroll|payslip|salary.slip|epfo|\bUAN\b|professional.tax' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing. The word 'salary' exists only as an expense category enum: packages/db/src/schema/expenses.ts:8, apps/api/src/routes/expenses.ts:20, apps/web/src/app/cafes/[id]/expenses/expenses-view.tsx:21.

**Who ships it.** Restroworks/POSist and Rista ship payroll or a tight payroll integration; Petpooja routes it to partners. Indian restaurants otherwise run greytHR, Kredily, Keka or RazorpayX Payroll. Toast Payroll and Square Payroll are the global comps

### Staff terminal identity (PIN login + on-shift session)

🟡 partial · 14d

A lock screen on the counter tablet where a staff member taps their name and enters a PIN to take over the terminal, producing a session that stamps every order, void, discount and payment with who did it. In Indian POS this same PIN prompt is also the clock-in device.

**Why it matters.** Without it a ten-person cafe shares one owner login, so every action in the audit log says 'owner'. The manager cannot answer 'who gave that 30% discount at 9pm' or 'who cancelled the ₹1,400 table', and Sangam's own Sentry/anti-theft positioning is unenforceable because there is no actor to attribute anomalies to. It is also the hard dependency for attendance, tip pooling and per-waiter performance — none of those can be built until it exists.

**Evidence.** packages/db/src/schema/staff.ts:26 stores pinHash and the comment at :12-14 says 'PIN login enforcement comes later'. apps/api/src/lib/pin.ts:20 defines verifyPin; `grep -rn verifyPin apps packages --include=*.ts` returns only that definition — zero call sites. No login route: apps/api/src/routes/staff.ts exposes only GET/POST/PATCH/DELETE. No staff_devices or staff_sessions table in packages/db/drizzle/migrations. Audit writes hardcode the actor: apps/api/src/routes/orders.ts:339 and :430 both set actorType 'owner'.

**Who ships it.** Petpooja (staff PIN login), Restroworks/POSist, Rista (user PIN login), Torqus; Square for Restaurants and Toast both gate the terminal on a staff passcode

### Shift definitions and weekly duty roster

❌ absent · 12d

Named shifts (morning 7am–4pm, evening 4pm–midnight, and the split shift that is standard in Indian restaurants — 11am–3pm then 7pm–11pm), assigned to staff on a weekly grid, with weekly-offs, a publish step, copy-last-week, and a per-shift headcount-by-role check.

**Why it matters.** The roster today is a WhatsApp message or a whiteboard, which is why Saturday dinner regularly runs one waiter short while Tuesday lunch has three idle. Published rosters are also the denominator for everything downstream: 'scheduled vs actual' is what turns a raw punch log into a late-mark, and a shift with no roster has no expected hours to compare an overtime claim against.

**Evidence.** `grep -rniE 'roster|shift' apps packages --include=*.ts --include=*.tsx` returns only cash-drawer copy (apps/web/src/app/cafes/[id]/cash-drawer/cash-drawer-panel.tsx:102,125,350 use 'shift' to mean a till session) and docs/plan/staff-identity.md, which is an unbuilt plan. No shifts or schedules table in packages/db/drizzle/migrations.

**Who ships it.** Restroworks/POSist, Rista, Petpooja (shift scheduling); Toast Sling, Square Shifts and Lightspeed all treat scheduling as core

### Clock-in / clock-out attendance with manager correction

❌ absent · 10d · **legally mandatory**

A punch record per staff per day — in-time, out-time, break, derived hours, and a status of present / half-day / absent / late / weekly-off — captured on the POS tablet by PIN (or selfie/biometric), with a manager override for missed punches that is itself audited. Under state Shops & Establishments Acts an establishment must keep a register of employment showing each employee's hours and attendance; the threshold is the state's S&E coverage, which in most states (e.g. Karnataka) starts at the first hired employee, with Maharashtra's 2017 Act exempting establishments under 10 workers from registration but not from the Act.

**Why it matters.** Attendance is the single biggest monthly argument in an Indian cafe: the paper register is filled in on the 30th from memory, so the owner pays for days nobody worked and the staff dispute the days docked. Half-day and late-mark rules are enforced verbally and inconsistently. Without a timestamped punch there is no defensible basis for a salary deduction, and no data at all for overtime, tip hours or labour cost.

**Evidence.** `grep -rniE 'attendance|clock.?in|clock.?out|punch.?in|timesheet' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing. No attendance table among the 18 in packages/db/drizzle/migrations (grep 'CREATE TABLE' across *.sql).

**Who ships it.** Petpooja (Staff Attendance module), Restroworks/POSist, Rista; also the eSSL/Realtime biometric devices Indian restaurants wire in separately. Toast, Square and Lightspeed all ship a time clock

### Per-staff sales attribution and performance reporting

❌ absent · 10d

A staffId stamped on every order, tender and void at the moment it is written — counter, QR, table session and AI-console paths alike — and the report suite it unlocks: sales per waiter, average bill value, covers served, attach/upsell rate (what fraction of their tables took a dessert or a beverage), and the anomaly cuts that matter, namely void rate, discount rate and reprint rate by person.

**Why it matters.** The owner's two hardest questions are 'who is actually selling' and 'who is stealing', and neither is answerable. Nothing in the schema links an order to a person, so a waiter who upsells a dessert on every second table earns exactly what the one who never speaks earns, and the cashier who voids three times more than anyone else is invisible. This is not a nice-to-have report: Sangam's stated Sentry/anti-theft pillar and any incentive scheme both rest on it, and it is a schema change on the hot write paths that gets more expensive the longer it waits.

**Evidence.** packages/db/src/schema/orders.ts:38-97 — the orders table has no staffId, waiterId or createdBy column; order_items likewise (:104-127). Confirmed in the migrations: `grep -in staff packages/db/drizzle/migrations/*.sql` finds staff references only in 0007_cultured_silhouette.sql:8,48,49 (the staff table itself) and :36 ('opened_by_staff_id' on cash_drawer_sessions — nullable, and supplied unverified from the request body at apps/api/src/routes/cash-drawer.ts:18,76). ReportsRepository exposes only dayEnd and sales grouped by item/category/hour (apps/api/src/repositories/reports.ts:18-31); `grep -n staff` over reports.ts and routes/reports.ts returns nothing.

**Who ships it.** Petpooja (waiter-wise sales report), Restroworks/POSist, Rista and Torqus all ship staff sales reports; Toast and Lightspeed ship server performance including attach rate

### Leave, weekly-off and holiday management

❌ absent · 9d · **legally mandatory**

Leave types with accrual (state S&E Acts typically grant one day of earned leave per 20 days worked, plus casual/sick entitlements — Maharashtra's 2017 Act gives 8 casual plus earned leave), a running balance ledger per employee, an apply/approve flow, a holiday calendar including the three paid national holidays (26 January, 15 August, 2 October) mandated by the state National and Festival Holidays Acts, and encashment/lapse at year end. Maternity benefit (26 weeks) applies at 10 or more employees.

**Why it matters.** Leave in a small cafe is a phone call at 6am and a mental note, so nobody knows how many days a waiter has already taken, the same person is docked twice for one absence, and the roster is rebuilt in a panic. The unpaid-leave count is also the direct input to salary pro-rating — get it wrong and the whole payslip is wrong. Not paying for the three national holidays is a straightforward statutory breach that no one currently tracks.

**Evidence.** `grep -rniE 'leave.balance|holiday|weekly.off|comp.?off' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing (the only 'leave' hits are English prose — apps/api/src/repositories/staff.ts:16 'leave unchanged', apps/web/src/app/cafes/[id]/staff/staff-manager.tsx:398 'Leave blank to keep the current PIN').

**Who ships it.** Restroworks/POSist, Rista; Petpooja via its HR/attendance module. Indian restaurants otherwise use greytHR, Keka or Zoho People

### Tip pooling and distribution (tronc)

❌ absent · 8d

A pool per shift or per week, split by configurable role weights (waiter 2 points, runner 1, kitchen 0.5) prorated by hours actually clocked in that period, producing a per-staff payout sheet, a mark-as-paid step that ties to the cash drawer or the payroll run, and a per-staff statement showing exactly how their share was derived.

**Why it matters.** Today the cash tip box is split at closing by the senior waiter's memory, which is the single most reliable source of floor-staff resentment and attrition in a small restaurant. Digital tips make it worse: they sit in the owner's account with no distribution mechanism at all. A transparent, hours-weighted split that each person can see is a retention feature disguised as a finance feature, and it only works if attendance hours exist to weight against.

**Evidence.** `grep -rniE 'tip.?pool|tronc|gratuity' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing. No tip data exists to pool (see the tip-capture row).

**Who ships it.** Largely a gap in Indian POS — Petpooja, Restroworks and Rista do not ship real tronc. Toast (Tip Manager), Square (tip splitting/pooling) and Lightspeed ship it as a headline restaurant feature, so it is a proven, unclaimed lane in India

### Statutory labour register export (muster roll, wage register, OT register)

❌ absent · 7d · **legally mandatory**

One-click export of the registers a labour inspector or a Shops & Establishments licence renewal actually asks for, generated from the attendance and payroll data: the muster roll (Form V) and overtime register (Form IV) under the Minimum Wages (Central) Rules 1950, the wage register and wage slip (Forms X and XI), the register of advances under the Payment of Wages Rules, plus the state-specific register of employment. Required of any establishment covered by the state S&E Act and the Minimum Wages Act.

**Why it matters.** A labour inspection or an S&E renewal is an unannounced day where the owner either produces these registers or negotiates. Today they are fabricated the night before from memory, which is both a penalty risk and the reason nobody trusts the numbers. This is also where Sangam's existing immutable-audit-trail positioning transfers straight from GST to labour: a register that was written continuously and cannot be back-dated is a genuinely different product from one typed up on the day.

**Evidence.** `grep -rniE 'muster|form.?16|labour|minimum.wage' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing. Existing CSV export is sales-only (apps/api/src/routes/reports.ts).

**Who ships it.** Not a POS strength — greytHR, Kredily, Keka and Zoho People ship statutory register exports; Restroworks/POSist covers some via its HR module. This is an open differentiation lane for an India-native POS

### Tip capture on the bill (cash and digital)

❌ absent · 7d

An explicit tip line on the counter bill, the QR/Razorpay diner flow and the card/UPI tender — separate from the service charge Sangam already computes — recorded per order, attributable to the serving staff member, and correctly excluded from the GST taxable value (a voluntary tip is not consideration for the supply, unlike service charge, which Sangam already and correctly folds into the taxable base).

**Why it matters.** Since the CCPA's 2022 guidelines made service charge non-mandatory and removable, Indian restaurants have shifted to explicit tip prompts on the terminal and the UPI screen. A digital tip lands in the restaurant's own bank account, so unless the POS records it as a liability owed to staff it is silently absorbed into revenue — the staff never see it, and the owner has quietly booked staff money as sales. There is currently no way to answer 'how much tip money do I owe the floor this week'.

**Evidence.** `grep -rniE '\btip\b|tipPaise|tip_paise' apps/api/src apps/web/src packages/db/src packages/types/src` returns zero rows. Orders carry serviceChargePaise (packages/db/src/schema/orders.ts:66) and order_payments carries kind/method/amountPaise only (packages/db/src/schema/order-payments.ts:26-29) — no tip column on either.

**Who ships it.** Dotpe and Petpooja support tip on the digital payment flow; Rista on tender. Toast, Square and Lightspeed all ship tip capture at tender as standard

### Overtime capture and computation at statutory rate

❌ absent · 6d · **legally mandatory**

Derivation of overtime hours from actual punches against the daily (9 hours) and weekly (48 hours) statutory ceilings, priced at twice the ordinary wage rate as required by section 14 of the Minimum Wages Act 1948 and the corresponding state rules, plus a spread-over exception flag when a split shift stretches past the state cap (typically 10.5–12 hours). Applies wherever the Minimum Wages Act / state S&E Act covers the establishment — effectively any restaurant with hired workers.

**Why it matters.** Restaurant staff routinely work 11–13 hour days through festival season and Saturday nights. Today nothing records it, so overtime is either not paid (a live liability the owner does not know he is carrying, and the exact thing a labour inspection or a disgruntled ex-employee's claim surfaces) or paid as an informal cash handout that never reaches the books. Either way the owner cannot see that the November wage bill blew out because two cooks worked 14-hour days for three weeks.

**Evidence.** `grep -rniE 'overtime|spread.?over' apps/api/src apps/web/src packages/db/src packages/types/src` returns nothing. Depends on the attendance capture that also does not exist.

**Who ships it.** Restroworks/POSist and Rista compute OT from attendance; Petpooja exposes OT hours in its attendance module; greytHR/Kredily when bolted on. Toast and Square compute overtime for US thresholds

### Employee master record (wage rate, joining date, bank, ID proof)

❌ absent · 5d

The staff row a payroll can actually be run from: phone, address, date of birth, date of joining, designation, employment type (monthly-salaried cook vs daily-rated helper vs part-time), wage rate and wage basis, bank account + IFSC, PAN/Aadhaar reference, UAN/ESIC number, emergency contact, probation/confirmed status, and exit date with reason. These are exactly the particulars the statutory register of employment demands.

**Why it matters.** Indian kitchen staff turn over several times a year and half of them are daily-rated, not salaried. With only name+role, the owner cannot pay anyone from the system, cannot produce a bank transfer file, cannot answer a labour inspector asking for date of joining and wage rate, and cannot tell a departing helper what he is owed. Every other item in this domain is arithmetic over fields that do not exist yet.

**Evidence.** packages/db/src/schema/staff.ts:20-36 — the full column list is id, cafeId, name, role, pinHash, isActive, createdAt, updatedAt. No wage, phone, joining date, bank or ID field. apps/api/src/routes/staff.ts:26-31 validates only name, role, pin, isActive.

**Who ships it.** Petpooja, Restroworks/POSist, Rista, Torqus all ship an employee master; restaurants that skip it bolt on greytHR, Kredily or Zoho People

### Salary advance ledger (staff 'udhaar')

❌ absent · 5d · **legally mandatory**

A per-employee ledger of mid-month cash advances taken from the till, with the repayment schedule, the outstanding balance, automatic recovery in the next payroll run, and a hard cap so total deductions never exceed 50% of wages (section 7, Payment of Wages Act 1936, which covers employees drawing up to ₹24,000 a month; a register of advances is prescribed under the Act's rules). Each advance is a drawer pay-out and each repayment a drawer pay-in, so the cash position stays honest.

**Why it matters.** This is the most universal money flow in an Indian restaurant and it is entirely absent: staff take ₹500–₹5,000 out of the till mid-month and the cashier writes it on a diary page. The consequences are daily — the drawer shows a shortage that is really an advance, the owner cannot remember whether the tandoor cook already took ₹3,000 this month, and at salary time the deduction is disputed because there is no signed record. Sangam's own day-close plan (docs/plan/day-close.md:17) already names 'staff repays an advance' as a drawer pay-in reason, so the flow is acknowledged with no ledger behind it.

**Evidence.** `grep -rniE 'advance' apps/api/src apps/web/src packages/db/src` hits only unrelated prose — apps/web/src/app/cafes/[id]/orders/[orderId]/order-actions.tsx:458 'advance / cancel' (order status), apps/api/src/routes/ai-console.ts:118 'Advance an order'. No advances table in packages/db/drizzle/migrations. Expenses can only record a lump 'salary' category (packages/db/src/schema/expenses.ts:8) with no employee link.

**Who ships it.** Petpooja and Rista both carry staff advance/deduction entries; Restroworks/POSist in its employee module; greytHR and Kredily as the bolt-on

### Labour cost as a percentage of sales

🟡 partial · 4d

The derived operating metric the whole module exists to produce: today's and this month's wage cost (from rostered or clocked hours priced at each person's wage rate, plus overtime) shown against revenue on the dashboard and the reports page, with sales per labour hour and cost per labour hour, cut by shift so the owner can see that Tuesday lunch costs more in wages than it takes in.

**Why it matters.** Labour is the second-largest cost line in a cafe after food, and right now it is a lump-sum 'salary' expense typed in once a month with no connection to hours, headcount or sales. The owner discovers he over-staffed a slow week four weeks after it happened, when nothing can be done. Every rostering decision this module enables is worthless without the number that tells him whether the roster was right.

**Evidence.** The crudest form exists: a 'salary' expense category (packages/db/src/schema/expenses.ts:8, apps/api/src/routes/expenses.ts:20) rendered at apps/web/src/app/cafes/[id]/expenses/expenses-view.tsx:21, so a lump monthly figure can be recorded and appears in expense totals. But it has no staff link, no hours, no rate, and no ratio to sales — `grep -rniE 'labour|labor.cost|cost.per.hour|sales.per.hour' apps/api/src apps/web/src` returns nothing, and apps/api/src/repositories/reports.ts:18-31 offers no labour dimension.

**Who ships it.** Restroworks/POSist and Rista report labour cost percentage; Petpooja partially via expense heads. Toast and Lightspeed make labour-cost-versus-sales a headline dashboard tile

---

## Analytics & business intelligence depth

Sangam's entire BI surface is two endpoints — a single-day Z-report and a sales list grouped by item, category, or hour-of-day (apps/api/src/routes/reports.ts:41-89, apps/api/src/repositories/reports.ts:35-248) — rendered as tables plus a CSV download on one screen that is hard-wired to a single business day (apps/web/src/app/cafes/[id]/reports/reports-view.tsx:67). There is no cost data anywhere in the schema, so every "profitability" capability is not merely unbuilt but unbuildable on the current data model: no cost price on menu items, no recipe/BOM, no ingredient master, no purchase or supplier records, and no staff attribution on orders. There is also no charting library in apps/web at all, and no trend, comparison, forecast, cohort, or channel-margin logic of any kind. What exists is a competent till-close report; what a Petpooja or Posist customer calls "reports" — item margin, menu engineering, wastage, waiter-wise sales, APC, MoM comparison, aggregator net P&L — is entirely absent.

### Recipe / bill-of-materials with theoretical-vs-actual stock variance

❌ absent · 20d

An ingredient master with units and purchase costs, recipes mapping each menu item to raw-material quantities with a yield factor, consumption posted automatically as orders complete, and a variance report comparing theoretical consumption against physically counted stock. Not legally mandated.

**Why it matters.** Over-portioning and back-door pilferage of paneer, oil, chicken and gas cylinders is the standing daily loss in an Indian kitchen, and it is invisible in a sales report. Sangam only decrements a count of finished dishes (apps/api/src/repositories/inventory.ts:98-115), so 20 kg of paneer can walk out of the store and nothing in the system registers it. The owner discovers it months later as an unexplained gap between sales and the supplier bills.

**Evidence.** packages/db/src/schema/inventory.ts is a single menu_item_stock table of finished-good counts (lines 17-38). grep -rIEn 'recipe|bom|yield|ingredient|purchase|grn|supplier|vendor|indent|receiving' over apps/api/src apps/web/src packages/db/src packages/types/src returns only the words 'supplier' in GST bill-heading copy (apps/web/src/lib/bill-document.ts:6) and 'purchase' nowhere.

**Who ships it.** Petpooja (Recipe Management + stock variance), Posist, Rista, Torqus

### Sales forecasting and prep-quantity / indent prediction

❌ absent · 10d

A forward projection of orders and item-level demand for the coming days from historical patterns, weekday seasonality and the Indian festival calendar, turned into a suggested prep quantity and a daily purchase indent. Not legally mandated.

**Why it matters.** Prep quantity is decided every morning by the cook's memory. Over-prep means a vessel of gravy discarded at midnight; under-prep means 'sir, that is finished' at 8:30pm on a Saturday, which is exactly when the Zomato rating and the repeat customer are lost. A cafe that can be told 'you will sell 62 biryanis on Saturday, prep for 70' converts that guess into a number, and it is the most credible AI feature to attach to Sangam's AI positioning.

**Evidence.** grep -rIEn 'forecast|predict|demand|seasonal|movingAverage|trend' over apps/api/src apps/web/src packages/types/src returns a single hit in marketing copy (apps/web/src/app/(marketing)/about/page.tsx:28, 'predictable price'). The AI ops agent's tool catalogue is today-only and read/act, not predictive (apps/api/src/routes/ai-console.ts:41-129: get_today_stats, get_top_items, get_item_sales, list_out_of_stock, list_recent_orders, set_item_availability, update_order_status).

**Who ships it.** Rista and Posist market forecasting modules; Toast and Lightspeed ship it properly. Genuinely thin across the Indian mid-market — a real differentiation window rather than a catch-up item.

### Channel P&L — dine-in vs QR vs aggregator, net of commission

❌ absent · 10d

Aggregator (Zomato / Swiggy / ONDC) as a first-class order channel with its own commission rate, ad spend, platform discount share and payment-gateway fee, producing net-realised revenue and margin per channel rather than gross rupees. Not legally mandated.

**Why it matters.** A ₹500 Zomato order lands as roughly ₹280-320 after commission, ads, the restaurant's discount share, and PG charges. Sangam's day-end report shows counter / QR / phone gross and implicitly treats all rupees as equal, so a cafe whose aggregator volume is growing looks healthy in the report while its bank balance shrinks. 'Am I actually making money on Zomato?' is the question the whole Settle wedge claims to answer, and today Settle is a stateless CSV analyser that never touches an order — the two halves are not joined.

**Evidence.** orderSourceValues is ['counter','qr','phone'] with no aggregator value (packages/db/src/schema/orders.ts:25, used at :47), and SourceBreakdown reports gross only (packages/types/src/reports.ts:18-22). Settle persists nothing and takes its figures from a pasted CSV: apps/api/src/routes/settle.ts:26-53 — there is no settle table in packages/db/src/schema/index.ts:1-13 and no join between statements and orders.

**Who ships it.** Petpooja (online-order reports and aggregator reconciliation), Posist, Rista, Dotpe

### Staff and shift performance analytics

❌ absent · 9d

Sales, covers, average bill and item mix attributed to the waiter who took the order and the cashier who settled it, rolled up by shift, plus per-cashier cash-drawer variance and an upsell/attach rate on desserts and beverages. Requires a staff reference on orders, which does not exist. Not legally mandated.

**Why it matters.** Waiter-wise sales is how Indian dine-in cafes calculate monthly incentives and decide who to keep; cashier-wise variance is how a ₹600 till short gets pinned to a person instead of poisoning the whole team. Sangam has a staff roster with PINs but no order carries a staff id, so every rupee is anonymous — the roster is decorative for reporting purposes and the cash drawer's variance figure cannot be attributed to anyone.

**Evidence.** packages/db/src/schema/orders.ts:39-95 has no staffId/waiterId/cashierId column; grep -rIEn 'staffId|createdByStaff|waiterId|cashierId|salesByStaff|staffPerformance|shiftReport|byShift' over apps/api/src apps/web/src packages/db/src returns only the staff-CRUD route param (apps/api/src/routes/staff.ts:20) and cash_drawer_sessions.openedByStaffId (packages/db/src/schema/cash-drawer-sessions.ts:21), which is never used in any report.

**Who ships it.** Petpooja (waiter-wise / cashier-wise sales), Posist, Rista, Torqus; Square and Toast globally

### Customer cohort, repeat-rate and lapsed-customer analytics

❌ absent · 8d

New vs repeat split per period, monthly acquisition cohorts with retention curves, visit frequency and RFM segmentation, and a list of customers who used to come and have stopped, sized in rupees. Not legally mandated.

**Why it matters.** A neighbourhood cafe lives on the same few hundred people returning, and the phone numbers captured at QR and counter orders are the only first-party customer data an Indian cafe owns — Zomato and Swiggy withhold theirs. Without a repeat rate the owner cannot tell whether the last three months of marketing bought loyal customers or discount tourists, and without a lapsed list they cannot run the WhatsApp win-back that is the standard Indian retention play. Worse, the customers table is not even populated: the upsert is written but never called from order creation, so the CRM is empty in production.

**Evidence.** packages/db/src/schema/customers.ts:19-23 holds totalOrders / totalSpentPaise / lastOrderAt, but apps/api/src/repositories/customers.ts:16-18 states 'DEFERRED INTEGRATION: not yet wired into order creation'. The customers API is list + detail only (apps/api/src/routes/customers.ts:32,43). grep -rIEn 'cohort|retention|rfm|churn|repeatCustomers|newVsRepeat|frequency' over apps/api/src apps/web/src packages/types/src packages/db/src returns only the phrase 'foundation for loyalty' in UI copy.

**Who ships it.** Petpooja CRM reports, Posist CRM, Dotpe, Rista, Limetray

### Item-level cost price and gross-margin reporting

❌ absent · 6d

A cost per dish (manually entered per item, or rolled up from a recipe) stored alongside the selling price, driving a report that ranks items by contribution margin in rupees and margin %, not by revenue. Not legally mandated.

**Why it matters.** Without a cost figure the owner ranks the menu by the revenue table Sangam already shows and pushes the wrong dishes. A ₹280 paneer tikka at 42% food cost earns fewer rupees per plate than a ₹120 masala chai at 12%, but Sangam's 'top items' list puts the tikka on top. It also makes every aggregator discount decision blind — the owner cannot tell which dishes survive a 50% Zomato offer and which sell at a loss.

**Evidence.** grep -rIEn 'costPaise|cost_paise|recipe|foodCost|margin|profitab|contribution|grossProfit' over apps/api/src apps/web/src packages/db/src packages/types/src returns only CSS `margin` in print views (e.g. apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx:123). packages/db/src/schema/menu.ts:36-63 has basePricePaise and no cost column.

**Who ships it.** Petpooja (Food Cost report), Posist, Rista, Torqus; Toast and Lightspeed globally

### Void, cancellation, discount and complimentary (NC) exception analytics

🟡 partial · 6d

An exception report aggregating cancelled bills, voided items, bill-level discounts and no-charge/complimentary bills by amount, by reason, by staff member and by hour, with a per-person leaderboard and outlier flags. Not legally mandated.

**Why it matters.** In Indian cash-heavy cafes, till theft runs through the cancel button and the 'manager discount' — punch the order, take cash, void the bill. Sangam records the raw events (audit log) and a daily cancellation count, but nothing ranks them, so an owner cannot answer 'why was ₹18,000 discounted last month and who did it?' This is the single most-run report in Indian POS deployments and it is the natural payoff of the immutable audit log Sangam already positions as a differentiator.

**Evidence.** Raw material exists but no analytics on it: packages/db/src/schema/audit-logs.ts:16-38 (append-only events keyed 'order.void', 'discount.apply'), packages/db/src/schema/orders.ts:62-63 (discountPaise, discountReason), and apps/api/src/repositories/reports.ts:152-153 (cancelledCount, cancelledValuePaise only). grep for 'discount' in apps/api/src/repositories/reports.ts, apps/api/src/routes/reports.ts and packages/types/src/reports.ts returns only the comment at packages/types/src/reports.ts:27 ('No discount data exists yet, so it is omitted').

**Who ships it.** Petpooja (NC bills / cancelled bills / discount reports), Posist, Rista, Torqus — universally shipped in India

### Covers, APC and table turnaround analytics

❌ absent · 6d

Covers (guests served) per day-part and per section, average per cover (APC = revenue ÷ covers), seat occupancy, and median table turn time derived from table-session open-to-close duration. Not legally mandated.

**Why it matters.** APC is the number Indian restaurateurs actually quote to each other, to landlords and to investors — 'we do ₹450 APC' — and it is the metric that tells them whether an upsell push or a price rise worked, in a way total revenue cannot. Turnaround time decides whether a 24-seat cafe adds tables, changes the menu to faster dishes, or stops seating two-tops at 8pm on a Saturday. Sangam already asks for party size at the table and then discards it.

**Evidence.** partySize, openedAt and closedAt are captured at packages/db/src/schema/tables.ts:63-65 and shown in the UI at apps/web/src/app/cafes/[id]/tables/history-view.tsx:195-197, but grep -rIEn 'covers|guestCount|seatCount|turnTime|turnaround|dwell|occupancy|avgTicket|averageTicket|apc' over apps/api/src apps/web/src packages/types/src finds no aggregation — partySize appears only in table-session CRUD, and apps/api/src/repositories/reports.ts never joins table_sessions.

**Who ships it.** Posist (APC / covers), Rista, Torqus; Toast and Lightspeed globally

### Comparative periods (WoW / MoM / YoY) and daily trend series

❌ absent · 6d

A revenue/orders/APC time series by day and by month, with a chosen period automatically compared against the previous period and the same period last year, showing absolute and percentage deltas per metric and per item. Not legally mandated.

**Why it matters.** An Indian cafe's month swings hard with festivals, exam season, monsoon, and a new competitor opening down the road. Without a comparison the owner cannot distinguish an ordinary slow Tuesday from a business that has been declining for six weeks, and finds out only when the month's rent is short. Sangam cannot even draw a line of daily sales — there is no 'day' grouping and the report screen shows exactly one date at a time.

**Evidence.** SalesGroupBy is 'item' | 'category' | 'hour' only (packages/types/src/reports.ts:56; enforced at apps/api/src/routes/reports.ts:25) — there is no 'day' or 'month' bucket. grep -rIEn 'yoy|MoM|WoW|previousPeriod|compareTo|lastWeek|growth|trend' over apps/api/src apps/web/src packages/types/src returns only an unrelated comment in a repo test and marketing copy.

**Who ships it.** Petpooja (comparative sales), Posist, Rista dashboards, Dotpe; Square and Toast

### Automated daily sales digest over WhatsApp / email

❌ absent · 6d

A scheduled close-of-day summary — sales, orders, APC, cash vs UPI, top items, cancellations and discounts, versus yesterday and last week — pushed to the owner's WhatsApp or email without them opening the app. Not legally mandated.

**Why it matters.** Owners of one to three Indian outlets do not sit at a laptop; they read WhatsApp at 11pm. The nightly digest is how a POS is actually consumed in this market, and it is what keeps an owner emotionally attached to the product between visits. Without it every report Sangam builds is a screen nobody opens, and the product feels absent from the owner's day — which is exactly how a ₹4k/month subscription gets cancelled at renewal.

**Evidence.** grep -rIEn 'cron|schedule|digest|emailReport|nodemailer|resend|sendgrid|whatsapp' over apps/api/src apps/web/src packages returns only Next.js error `digest` fields (apps/web/src/app/cafes/[id]/error.tsx:14) and HMAC `.digest('hex')` in Razorpay signature verification (apps/api/src/payments/razorpay.ts:66). There is no scheduler, job queue, or outbound message transport in the API.

**Who ships it.** Petpooja (daily WhatsApp/email summary), Dotpe (WhatsApp reports), Posist (email digest) — table stakes in India

### Menu engineering matrix (stars / plough-horses / puzzles / dogs)

❌ absent · 5d

A quadrant classification of every dish on popularity (units sold vs menu-average) against contribution margin, with per-item actions — promote, reprice, reposition, remove — over a chosen period. Not legally mandated.

**Why it matters.** Indian cafes reprint and reprice the menu two or three times a year and cut items on the manager's gut feel. Without the matrix the high-margin low-visibility items (the 'puzzles' — mocktails, desserts, chaas) never get repositioned to the top of the card, and low-margin 'dogs' survive because a regular orders them, dragging the whole kitchen's prep and stock complexity with them.

**Evidence.** grep -rIEn 'menu engineering|plough|puzzle|starItem|dogItem|quadrant' over apps/api/src apps/web/src packages/db/src packages/types/src returns nothing. The only item-level analytic is ItemSalesRow (packages/types/src/reports.ts:60-64: name, qty, revenuePaise).

**Who ships it.** Posist (Menu Engineering report), Rista, Torqus; Toast (Menu Performance)

### Wastage / spoilage register and report

❌ absent · 5d

A logged entry when food is thrown, spoiled, burnt, returned, or eaten as staff meal — item, quantity, reason, shift, who logged it — and a report valuing that at cost, per item and per reason, over a period. Not legally mandated.

**Why it matters.** Curd and milk spoil in an Indian summer, cut fruit and unsold sweets are discarded at close, and staff meals eat real inventory every day. None of it currently enters the numbers at all, so food cost % is understated and the owner blames a bad month on 'slow sales' rather than the ₹15-20k a month leaking out of the kitchen bin. It is also the only way to prove to staff that discards are being counted.

**Evidence.** grep -rIEn 'wastage|waste|spoilage|shrinkage|stockAdjust|stock_adjust' over apps/api/src apps/web/src packages/db/src packages/types/src returns nothing (only TypeScript `void` types match a naive 'void' grep). The inventory routes are get/patch/restock only (apps/api/src/routes/inventory.ts:48-78) — there is no negative adjustment with a reason.

**Who ships it.** Petpooja (wastage entry + wastage report), Posist, Torqus, Rista

### Day-part and weekday × hour demand heat map

🟡 partial · 5d

A weekday-by-hour grid of orders and revenue across a multi-week range, with named day-parts (breakfast / lunch / evening chai / dinner / late night) rather than a flat 0-23 list for a single day. Not legally mandated.

**Why it matters.** Indian cafes run a dead 3-5pm and a hard 7-9:30pm evening spike, and the shape differs completely between a Tuesday and a Saturday. That difference decides how many rotis and how much gravy are pre-prepped and whether a second waiter is rostered — over-prep goes in the bin, under-prep means 'not available' at 8:30pm on a Saturday. The current hour view answers this for one chosen day only, so no pattern is ever visible.

**Evidence.** Hour-of-day bucketing exists but only within one report call and with no weekday dimension: apps/api/src/repositories/reports.ts:220-247, packages/types/src/reports.ts:72-77 (HourSalesRow), and the UI requests a single day (apps/web/src/app/cafes/[id]/reports/reports-view.tsx:67 sends from=${date}&to=${date}). grep -rIEn 'heatmap|heat map|daypart|day-part' returns nothing, and apps/web/package.json declares no charting library.

**Who ships it.** Petpooja (hourly sales), Posist (day-part analysis), Rista, Torqus; Toast and Square

### Period P&L and prime-cost reporting

🟡 partial · 5d

A monthly statement joining revenue, COGS and operating expenses into gross profit, prime cost (COGS + labour) as a % of sales, and net profit, with expenses spread across the period rather than a single day. Not legally mandated (statutory books are a separate accounting obligation).

**Why it matters.** Rent plus salaries runs 25-35% of revenue in Indian metros, and a cafe whose prime cost crosses roughly 65% is dying whether or not sales look fine. Sangam holds expenses on one screen and revenue on another and joins them only for today, so the owner never sees the one number their accountant and any prospective investor will ask for, and finds out the month was loss-making when the rent cheque bounces.

**Evidence.** Expenses have a per-category range summary (apps/api/src/routes/expenses.ts:81-102, apps/api/src/repositories/expenses.ts:110-126) and a hand-rolled net figure in the UI, but the code itself notes the limit: apps/web/src/app/cafes/[id]/expenses/expenses-view.tsx:146-150 — "Today's P&L snapshot — revenue is today-only (API limitation)". No endpoint returns revenue and expenses over the same range, and grep for 'primeCost|grossProfit|netProfit' returns nothing.

**Who ships it.** Posist and Rista in higher tiers; Petpooja partially via its expense module. Weaker across Indian POS than the sales reports, so a credible place to lead.

---

