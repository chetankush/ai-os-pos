# Settle — Wedge Brief

*The first product to sell. Validated with real-data research, 2026-05-20. Keep this short and honest.*

---

## What Settle is

A service that audits a cafe's Zomato/Swiggy settlement reports, flags money wrongly deducted (unauthorized ads, auto-applied discounts, wrong commissions, refund deductions), and **pursues the dispute to recover it** — delivered over WhatsApp.

**The one-line pitch:**
> *"Give me your last Zomato/Swiggy statement. I'll show you free how much they overcharged you. You only pay when I recover it."*

---

## Why it's the wedge (not the whole company)

- **Real, on-record pain.** Named owners losing lakhs; front-page news in 2026 (Swiggy ran ads without consent for 6 months, ₹20L deductions for one chain). Swiggy's own policy: *"if there's no consent trail, we reverse the amount."* That admission is the wedge.
- **Genuine white space for independents.** Every incumbent stops at *reporting* the error and leaves the owner to fight. Nobody pursues the dispute for a single cafe.
- **But it can't be the whole business.** Recovery shrinks its own market (you fix the leak → value drops). It's the *hook* that gets you in the door; the POS + payments platform is the *retention engine*.

---

## The honest numbers (use these, not the myths)

| Claim | Reality |
|---|---|
| "53% Zomato take rate" | **Unverified.** Real: 25-35%. Only a single-digit slice is *disputable*. |
| "72% of restaurants have payout errors" | **Fabricated** — it's Cointab marketing, no survey. Don't cite it. |
| Recoverable per cafe | **~₹2,000-₹10,000/month** (disputable slice only). |
| Real dispute net-recovery rate | **~20%** industry-wide (not the 80% vendors claim). Be conservative. |
| Proof it works | **GetMyRefund recovered ~70% of a ₹16L claim** (10% contingency). One real case. |

---

## Competitors (real data)

| Player | Real status | The gap to exploit |
|---|---|---|
| **Optipro AI** (direct rival) | Bengaluru, recon+recovery+WhatsApp, 800→2,500 outlets, seed 2025. All numbers self-published. | Leads with *operations* (ratings/penalties), not forensic ad/discount audit. Doesn't pursue full recovery. |
| **Voosh.ai** (US blueprint) | >80% win rate, $183K+ recovered, **flat-fee pricing**. | US-only. |
| **Cointab** | ₹2.53 Cr revenue, 16 staff, 0 reviews, ₹12.5k/mo. | Enterprise-priced, generic — not a threat to cafes. |
| **UrbanPiper / Petpooja** | Free recon bundled in POS. | Report-only, POS-locked. UrbanPiper is *funded by Swiggy/Zomato* (conflict). |

**No funded, independent-cafe-focused, dispute-pursuing recovery tool exists in India.** That's the opening.

---

## Where competitors are losing — and what Settle learns (detailed)

### Direct Indian players — the 7 mistakes

**1. They report the error but never fight the dispute.** *(The biggest, most exploitable gap.)*
- Petpooja literally says: *"when reconciled… you can ask for reimbursement from the third-party."* UrbanPiper says *"mark orders as missing… track the status"* — **the owner still has to contact the aggregator.** Today, recovery only happens "after public pressure, like when an issue goes viral on Twitter."
- **Learn:** Own the dispute end-to-end — file the ticket, escalate, follow up, report the recovered ₹. Be the one who *fights*, not the one who *flags*.

**2. They only serve chains; the single cafe is invisible.**
- UrbanPiper's reference customers are McDonald's / KFC / 45,000 outlets. Cointab's showcase case is Paradise (45 outlets, 6,000 txns/day). Nothing is built for a one-location Sector-18 cafe.
- **Learn:** Build *only* for the independent cafe — no multi-outlet assumptions, no enterprise onboarding. Own the segment everyone ignores.

**3. Their pricing is absurd for a small cafe.**
- Cointab entry is ₹12,500/mo. A single cafe's recoverable leak is often a few thousand rupees — paying ₹12.5k to recover ₹5k is a non-starter.
- **Learn:** Flat ₹1,000-1,500/mo. Make the price obviously smaller than what you recover.

**4. Manual export/import friction.**
- Petpooja/UrbanPiper make the owner upload payout reports. Pre-automation, Paradise needed *5 days to reconcile a single day's orders*.
- **Learn:** Zero-friction — you ingest the statement for them. The owner forwards one file (or nothing, once integrated).

**5. No proof it works — empty trust.**
- Cointab, the most-cited name, has **0 reviews on G2, Capterra, PeerSpot, and Shopify**, ₹2.53 Cr revenue, 16 staff. Optipro's wins are all self-published, funding undisclosed.
- **Learn:** Lead with verifiable, real recovered-rupee receipts and named cafe testimonials. The whole field has none — credibility is cheap to win here.

**6. They reconcile *after* the payout — they can't stop the bleed.**
- The biggest losses are silent: ₹16L deducted "in small amounts, no email, no notification." Owner quote: *"If we don't approve them, they auto-approve it from their backend."* A tool that checks the statement after the fact can't stop a silent ad toggle.
- **Learn:** Prevention + alerting *before* the payout — flag a silently-activated ad/discount the day it appears, not 30 days later.

**7. Recon is a deprioritized, conflicted POS bolt-on.**
- For UrbanPiper/Petpooja it exists to retain POS subscribers — UrbanPiper literally gave it away free. And UrbanPiper is **funded by Swiggy and Zomato** — a structural conflict: it's auditing its own investors.
- **Learn:** Be focused and independent. Recovery is your *main* product and you have no conflict — say so loudly.

### Category-level traps (from recovery/audit businesses worldwide)

**8. You destroy your own market by succeeding.**
- PRGX (40-yr recovery-audit leader) revenue *fell 16% YoY*. Telecom bill-audit firms run finite 12-60 month contracts because the savings deplete. Otter's own goal — "cut refunds 50% in a year" — halves its own recovery base.
- **Learn:** Recovery is a depleting well. Plan from day one to convert the saved cafe into a recurring platform customer (POS, payments, GST recon, cash flow) — before the recovery TAM shrinks.

**9. One-time value → weak retention (painkiller becomes vitamin).**
- First reconciliation finds a big backlog (painkiller); after that it's a small monthly drip (vitamin). Without a second product, churn follows the leak being plugged.
- **Learn:** Bundle ongoing value (daily P&L, prevention alerts, GST) so the cafe stays after the backlog clears.

**10. Inflated win-rate claims collapse on contact.**
- Vendors advertise 80% win rates; independent data shows real merchant net-recovery is ~20%. Cafes can check your math against their own bank statement.
- **Learn:** Under-promise. Quote conservative recovery, then beat it. In a tight-knit restaurant community, one caught exaggeration kills referrals.

**11. Services/contingency motions don't scale like software.**
- Telecom/utility bill auditors have run "% of what we find" for decades and stay small and people-heavy. Even Vendr (a $1B "savings" SaaS) laid off 25% when the savings narrative met budget reality.
- **Learn:** Don't let Settle become a manual recovery agency. Automate the audit; keep humans only on escalation. And don't price purely on % (it depletes *and* doesn't earn SaaS multiples).

### The validation pattern this implies

The biggest recon outcomes — **Recko → Stripe, Midigator → Equifax, Cuboh → ChowNow** — were all *features absorbed into bigger money-movement/ordering platforms*, never standalone IPOs. Durable scale (Chargebee $3.5B, Ramp $32B, AppZen $2.1B saved) lives in always-on transaction flow. **So: Settle is the wedge that proves demand and earns trust; the platform is what you actually build a company on.**

## How Settle must be different (summary)

1. **Pursue the dispute end-to-end** — file, escalate, follow up. The gap every competitor shares.
2. **Flat low fee (₹1,000-1,500/mo)**, not 20-25% of recovery. A % model pays only ₹200-1,000/mo per cafe *and* collapses as recoveries deplete. (Voosh, the closest analog, chose flat deliberately.) Optional success fee on large one-time backlogs.
3. **Prevention + reconciliation + recovery bundled** — real-time alert when an ad is silently toggled, *before* the payout. Detection-only churns once the backlog clears.
4. **Zero-friction onboarding** — ingest the statement for them; don't make them export/upload.
5. **Lead with verifiable proof** — real recovered-rupee receipts. Incumbents have none.
6. **Plan the expansion now** — recovery depletes; convert saved cafes to a recurring platform before the TAM shrinks.

---

## Pricing

- **Flat ₹1,000-1,500/month**, all-in. Undercuts Cointab (₹12.5k) cleanly, predictable for the cafe.
- Optional: **success fee** (e.g., 10%) only on large one-time backlog recoveries.
- Do **not** lead with pure % — the recoverable pool is small and shrinking.

---

## The biggest risk

**The recoverable pool is shrinking by design.** Swiggy/Zomato are adding consent tooling that closes the "no consent trail = we reverse it" loophole — the entire basis of recoverability. Plus you destroy your own TAM as you fix each cafe's leaks. **Mitigation: treat Settle as the land; expand to the platform (POS + payments + GST recon + cash flow) before the recovery TAM closes.**

Secondary risk: **retaliation fear.** One owner delisted after a ₹13L fight. No documented case of delisting *for disputing*, but the fear is real and may slow adoption. Position as "we handle it quietly," not "fight Zomato."

---

## 60-Day Validation Plan

**Goal:** prove cafes will pay for recovered money before building any software.

**Weeks 1-2 — Manual, zero code**
- List 40 cafes in walkable East Delhi + Noida border (Sector 15/16/18, Mayur Vihar, Patparganj).
- Send the WhatsApp pitch to 10. Walk in to 5 at 3-5 PM.
- Get 3 settlement statements. Audit manually (you + DeepSeek V4 Flash). Find the disputable money.

**Weeks 3-4 — First recovery**
- For the 3 cafes, draft and file the actual disputes (in-app grievance → ticket number → 15-day timeline under IT Rules).
- Track: does the money actually come back? How much, how long?

**Weeks 5-8 — First paying customers**
- Convert cafes where you recovered money to flat ₹1,000-1,500/mo.
- Target: **5 paying cafes.**

**Weeks 9-10 — Decide**
- **Green light** if: recovery actually works (money returned), cafes pay willingly, and per-cafe recoverable holds at ₹2k+/mo.
- If recoveries stall or owners won't pay → the wedge is weaker than hoped; pivot the entry feature (e.g., lead with the AI waiter or the GST audit trail instead).

**Success metric:** 10 paying cafes on recovered money within 60 days. If that holds against Optipro, build the software and expand to the platform.

---

## Reusable audit prompt

> **Data-safety note:** This statement is the cafe's financial data. Do **not** paste real statements into the China-hosted DeepSeek consumer app / `api.deepseek.com`. Use **Gemini 2.5 Flash**, **Sarvam**, or DeepSeek **open weights on non-China infra** (OpenRouter provider-routing / Together / Fireworks / self-host). For the very first manual tests you can redact the cafe name. "Your data never leaves India" is also a selling point — practice it from day one.

```
This is a Zomato/Swiggy settlement statement for a restaurant. 
1. List every deduction line item and total them.
2. Flag any ad/marketing charges, auto-applied discounts, or refund 
   deductions that could be unauthorized (no clear consent).
3. Flag any commission charged above [X]% contracted rate.
4. Calculate the effective take rate on gross order value.
5. Output a short WhatsApp-ready summary: "₹X deducted, ₹Y looks 
   disputable, here's why."
```
