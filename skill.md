---
name: ui-audit
description: |
  Enterprise-grade UI quality audit + design-system enforcement that
  ADAPTS to whatever project it runs in. It does not ship a fixed
  palette — it discovers the host project's design system first
  (tokens, spacing/radius/type scales, component recipes, dark-mode
  strategy, breakpoints) and audits every surface against THAT.

  Catches spacing/overflow/contrast/layout/state/a11y defects in one
  pass so iteration loops stay short.

  Four modes:

  1. IMAGE mode — a UI screenshot is attached: run the systematic
     14-category visual audit and report every defect (not just one).
  2. CODE mode — reading/writing a UI file (.tsx/.jsx/.vue/.svelte/
     .astro/.html/CSS): check class strings, layout primitives, and
     state transitions against the discovered design system.
  3. GUIDANCE mode — user asks "how should I build this", "what's the
     right pattern", "is this OK?": apply the system BEFORE writing code.
  4. BROWSER mode — user asks to "audit/check/verify" a running URL:
     drive the agent-browser CLI to screenshot at mobile/tablet/desktop,
     then feed each into IMAGE mode. No screenshots from the user needed.

  Use any time the user is working on UI, even without a screenshot.
  Goal: ship UI that's professional, consistent, and accessible in the
  first pass.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*), Read, Grep, Glob
metadata:
  type: review
---

# UI Audit (project-adaptive)

## When this skill runs

- A UI screenshot / image / path to a `.png`/`.jpg` is shared (IMAGE).
- A `.tsx`/`.jsx`/`.vue`/`.svelte`/`.astro`/`.html`/CSS file is being
  edited or reviewed (CODE).
- The user asks how to build/style/fix any UI element, even with no
  image (GUIDANCE). Triggers: "how should I build this", "what's the
  right pattern", "is this UI OK", "does this look right", "review my
  component", "before I implement", "design for me".
- The user names a running URL/route to check (BROWSER). Triggers:
  "audit the X modal on localhost:3000", "check the settings page at
  /app/settings", "verify the drawer renders right", "screenshot and
  review X across breakpoints", "check the overall site".
- A single complaint ("the date is cut") still triggers a FULL audit
  of all visible elements — single-issue framing is rarely complete.

## Step 0 — Establish the project's design system (ALWAYS run first)

Never audit against assumptions. Before the first audit in a session,
establish a **Design System Profile (DSP)** to audit against, in this
strict priority order, and cache it for the session.

**0a. Look for an explicit design-system doc first — use it as the base.**
Search the repo for a written design system / style guide:
`design.md`, `design-system.md`, `DESIGN.md`, `STYLEGUIDE.md`,
`design-system/MASTER.md`, `docs/design*.md`, `tokens.md`, `BRAND.md`
(glob `**/*design*.md`, `**/*style*guide*.md`, `**/tokens.*`). If one
exists, **READ it and treat it as the authoritative DSP** — its tokens,
scales, components, and rules override anything inferred. Still spot-check
that the code matches the doc, and **flag any drift** between the
documented system and the implementation.

**0b. If no doc, infer the DSP from the codebase** — read the following
and extract the values:

1. **Color tokens & theming** — look in (in priority order):
   - Tailwind v4 `@theme` blocks / CSS custom properties in
     `globals.css` / `app.css` / `*.css` (e.g. `--color-accent`,
     `--color-bg`, `--color-fg`, `--color-muted`, `--color-border`).
   - `tailwind.config.{js,ts}` `theme.extend.colors`.
   - A design-tokens file (`tokens.*`, `theme.*`).
   Extract the **semantic roles**: surface/background, foreground/text,
   muted/secondary text, border, the **brand/accent**, danger, success,
   warning. Note whether colors are referenced as `bg-accent` (semantic)
   or raw palette (`bg-blue-600`) — flag raw palette as a smell unless
   it's a status color.

2. **Dark mode strategy** — class-based (`.dark` / `@custom-variant
   dark`) vs `media`. Note it; the audit must check BOTH themes.

3. **Spacing & radius scales** — infer from frequency of use across
   components (which `gap-*`, `p-*`, `rounded-*` values recur). The
   recurring set IS the scale; outliers are smells.

4. **Component library** — locate the canonical primitives (commonly
   `components/ui/*`: `button`, `card`, `input`, `label`, `dialog`/
   `modal`, `badge`). Read them and extract the **real recipes**:
   variant names, the exact classes for primary/secondary/ghost/danger
   buttons, the input ring + focus-ring, the card padding/ring, the
   modal frame. THESE become the "correct" reference — findings cite
   the project's own primitive ("Button has `variant=primary`; this
   hand-rolled `bg-blue-600` button bypasses it — use `<Button>`").

5. **Typography** — base font(s), heading scale, mono usage,
   `tabular-nums` for numerics.

6. **Breakpoints** — read the framework defaults or config (Tailwind:
   `sm 640 / md 768 / lg 1024 / xl 1280`). Pick the audit viewports to
   straddle the breakpoints the components actually use.

7. **Icon set** — one library (lucide, heroicons, etc.); flag emoji
   used as structural icons.

Output a one-line DSP summary before auditing, e.g.:
> DSP: semantic tokens (`bg/fg/muted/border/accent`), class-dark-mode,
> radius `lg/xl/2xl`, primitives in `components/ui` (Button/Card/Input),
> lucide icons, breakpoints md768/lg1024.

**0c. If neither a doc (0a) nor a clear inferable system (0b) exists —
ASK the user; don't silently assume.** Ask two things:
  1. "What's your main design system / brand?" (a tokens file, a Tailwind
     / Figma theme, a brand color + font pairing, or "none yet").
  2. "Which page in your app should I treat as the **canonical
     reference** — the one whose look you want standardized across the
     whole platform?"
Then open that reference page (BROWSER: screenshot + read its component
classes / computed styles), derive the DSP from it (colors, spacing,
radius, button/input/card recipes), and audit every other surface for
consistency **against that reference**, flagging where they diverge.

**Then offer to persist it as `design.md`.** Once the DSP is established
(via 0a, 0b, or the 0c reference page), if the project has **no**
design-system doc, **propose creating one** — write the DSP to
`design.md` at the repo root: tokens, spacing/radius/type scales,
component recipes, dark-mode strategy, breakpoints, and the chosen
reference page. With the user's OK, create it. Future audits then find it
at **0a** and use it as the base — capture the system once, enforce it
forever. Offer first; never create the file silently.

If 0a–0c still can't establish a system, fall back to the generic
defaults in Part B — and say so explicitly.

### Companion skill — `ui-ux-pro-max` (decide vs. enforce)
These two skills do different jobs and are best used together:
- **`ui-ux-pro-max` = decide / generate** — when *starting* a design or
  there's no system yet, use it to pick the style, color palette, font
  pairing, and component patterns for the product type (its
  `--design-system` generator + curated palette/font/style/chart library
  and per-platform iOS/Android/RN guidance).
- **`ui-audit` (this skill) = verify / enforce** — once a system exists
  (generated or hand-built), this discovers it (Step 0) and audits every
  surface against it in the browser.
Trigger `ui-ux-pro-max` for "what palette/font/style/chart should I
use?" or greenfield design; trigger `ui-audit` for "is what I built
correct/consistent?". For deep charts (§O) or native-platform idioms
(§P), pull the specifics from `ui-ux-pro-max`. Don't copy its data
inline here — query it there (keeps this skill lean in context).

## Step 0.5 — Adaptive capture (more detail where there are more elements)

Spend the image budget where interaction density is highest. This is
**purely additive**: the normal viewport screenshot is still taken for
every surface (baseline quality never drops) — dense/functional surfaces
get an **extra high-detail layer** on top. Element-light surfaces are
never captured at *lower* quality than baseline; they just don't get the
extra layer.

**Tier each surface by a cheap signal first:** run `snapshot -i` and
count interactive elements (inputs, buttons, toggles, menu items, chat
controls, table rows). Decide the tier from that count — never from a
guess (a page that *looks* simple, e.g. a menu grid, is often Tier A
once you count the cards + add-buttons + cart + chat trigger).

| Tier | Signal | Capture |
|---|---|---|
| **A — dense / functional** | many interactive els (forms, modals, order builder, cart, chat, data tables, settings) | baseline viewport shot **+ a high-detail pass**: crop to the busy component(s) and capture at **2× device scale** so each element gets the most pixels before downsampling. Read the crops. |
| **B — medium** | a card grid, dashboard | one **viewport-sized** shot (not `--full`). |
| **C — sparse** | empty states, marketing hero, confirmation | baseline viewport shot, **or** snapshot-only to save tokens. Never below baseline image quality. |

**High-detail pass mechanics (Tier A):**
- Capture at 2× if the CLI supports it (`set viewport <w> <h> --scale 2`
  / a device-scale option); otherwise **crop tightly** — screenshot the
  element by ref/selector if supported, else `scrollintoview` the
  component and shoot, else set a smaller viewport so the component fills
  the frame. Cropping is the reliable lever regardless of scale support.
- Capture each meaningful **state** of a Tier-A component (default,
  filled, error, loading, open/expanded), not just the resting state.

**Two guardrails so adaptiveness never backfires:**
- **Pixel-precise checks ignore tier.** Contrast ratios, exact padding,
  ring opacity, 1px borders → read via **computed styles**
  (`get styles` / `eval getComputedStyle` / `get box`), not the image,
  on ANY tier. Image quality is irrelevant for these.
- **Detail bias toward density, never away from it.** When unsure of a
  tier, treat it as the higher one. The goal is *more* detail on busy
  screens — not *less* on quiet ones.

## Hard rules (do not skip)

- **Never respond to a UI screenshot or component review with only one
  observation.** Enumerate everything, then report grouped by severity.
- **Run every category against every element**, not just the one the
  user pointed at.
- **Output structured:** 🔴 / 🟡 / 🟢 with `file:line` + class diff +
  confidence (certain / likely / guessing).
- **Walk outward** to find the real overflow boundary instead of
  patching the visible child. Clipping is almost never the child's fault.
- **Cite the rule** being violated — the project's DSP value or the
  generic category. "Bad spacing" is not a finding; "section gap is
  `gap-3` but every other section uses `gap-6` — pick one (§B)" is.
- **Check both light and dark** if the project supports theming.
- **For a "whole site / all flows / overall" audit, enumerate the FULL
  route tree FIRST** (read `app/`/`pages/` — every `page.tsx`, including
  dynamic segments and route groups) and cover EVERY route, not a
  hand-picked subset. For each route also audit its key **states**, not
  just the happy path: list view + **empty state**, **create/new form**,
  **edit form**, detail, and any **modals / drawers / dropdowns**.
  CRUD forms (create/edit) and list/empty pages are where most defects
  hide — never skip them. End with a **route-coverage checklist**:
  every route marked ✓ audited or ⏭ deferred **with a reason** (so
  nothing is silently dropped).

## Output template

```
**UI audit of [screenshot context / file:line / route @ breakpoint]**

DSP: [one-line design-system summary used as the reference]
Elements under review: [enumerate]

🔴 Critical (must fix)
- [Element @ breakpoint]: [defect] — caused by [class / container] —
  fix: `[from] → [to]` (confidence) — rule: [§ / DSP token]

🟡 Should fix
- [...]

🟢 Nice-to-have
- [...]

Cross-check vs earlier shots: [regressions, or "none"]
Recommended next action: apply 🔴 now, leave 🟡/🟢 for review?
```

If you find nothing in a category, only say "clean" AFTER running it.
"Nothing wrong" is valid; "I didn't notice anything" is not.

---

# Part A — Audit checklist (run on every UI surface)

Token names below are generic placeholders — substitute the project's
DSP tokens (e.g. `<accent>` → `accent`, `<fg>` → `fg`).

## §A. Clipping & cut-off
- Any ring/border/shadow clipped by a parent `overflow-hidden` /
  `overflow-x/y-auto`? Classic trap: pills in a horizontal scroll row
  get their **top** ring clipped because the row has `pb-1` (scrollbar
  gutter) but no `pt`. Fix: `py-1`.
- First card in an `overflow-y-auto` column top-clipped → `pt-1+` on the
  column or `py-1+` on the scroll wrapper.
- Does the LAST element have buffer below it before the container/ pinned
  action button?
- Text truncated unexpectedly / overflowing horizontally?
- Focus ring visible, or does it extend into a clipped area and vanish?

## §B. Spacing — padding, margin, gap
- Siblings touching with no gap? Edges still breathe at 375px?
- Inputs left-padded so typed text isn't flush to the border?
- Clickable cards padded enough (≥ ~`p-3`, ideally `p-4 md:p-5`)?
- Section gaps **consistent** — random `mb-3` next to `mb-6` is a smell.
  Use the project's spacing scale; don't introduce off-scale values.
- Modals: inner content ≥ `p-4` (mobile)/`p-6` (desktop); ≥16px buffer
  above the action button; backdrop scrim dim enough (~`/40-/60`).

## §C. Alignment
- Columns align on a vertical grid; random offsets are smells.
- Two-column layouts symmetric unless deliberately asymmetric.
- Labels left-align with the input's text (padded area), not its border.
- Icons baseline-align with adjacent text, not top-align.
- Modal action buttons either span full width OR align to the form's
  right edge — pick one consistently app-wide.

## §D. Color & contrast
- Semantic text at `/40`–`/50` opacity → bump to ≥ `/60` unless truly
  decorative (timestamps, captions). Placeholders SHOULD stay faded.
- Inactive chip/tab/toggle text `/70+` to stay legible.
- Inactive button/card backgrounds at `<token>/5` are too faint on a
  same-color surface → `/10`, or use the surface color + a stronger ring.
- Selected/active state must **pop visibly** vs inactive.
- A ring at `<token>/10` on a same-tone wrapper vanishes → `/20+`.
  Input ring `/15` too soft → `/25` default. Focus ring always visible.
- WCAG: body text on background ≥ 4.5:1; large headings ≥ 3:1. Verify
  the brand/accent-on-white and white-on-accent pairs specifically.

## §E. Visual register & consistency
- Radius follows the project's scale buckets (e.g. form chrome vs
  cards vs modals vs pills). A one-off radius is a smell.
- Button hierarchy ≤ ~3 styles per surface (primary/secondary/
  destructive/ghost) and they come from the project's `<Button>`, not
  re-implemented inline.
- Icons in a context share one size + color treatment.

## §F. Layout & structure
- Modals: action **pinned** (`flex-shrink-0`), form body in its own
  `overflow-y-auto` sibling; one scroll region, not two; scrim `/40-/60`.
- Two-column desktop: each column scrolls independently; right column
  shows an empty state when nothing's selected; subtle divider.
- Mobile (<768px): two-col collapses to a single stack; primary action
  `w-full`; modals become bottom drawers (`rounded-t-2xl`).

## §G. State indication (every clickable element)
- **Hover** (don't rely on it for mobile), **Focus** ring (`focus:ring-2`),
  **Active** (`active:bg-*` / `active:scale-[0.98]`), **Disabled**
  (`opacity-50 cursor-not-allowed`), **Loading** (spinner/skeleton),
  **Selected** (unambiguously distinct). Toggles/tabs: one active per
  group, visually unique from inactive (bg AND text ideal).

## §H. Information hierarchy
- The most important action is the loudest element; title > body >
  metadata; secondary actions quieter than primary; labels read as
  labels (smaller/lighter/`mb-1`).

## §I. Cross-screenshot & regression
- Compare against earlier shots in the conversation — did this change
  break something that was fine, or create a defect nearby? Did a global
  token bump affect a surface that deliberately leaned on the old value?
- If the user keeps saying "still cut from the left" — the padding went
  on the wrong element; walk OUTWARD to the real clipping parent.

## §J. Edge cases & content tolerance
- Long titles wrap or `line-clamp-N` (keep card heights stable). Empty/
  zero/null/`[]` handled gracefully. Single item looks right; many items
  hold the layout. Longer i18n labels don't break.

## §K. Mobile vs desktop sanity
- Mobile: tap targets ≥ 44px; readable at default zoom; modal fills the
  bottom; no hover-only affordances; `active:` states matter.
- Desktop: modal constrained (`md:max-w-Nxl`), content centered with
  margin not edge-glued.

## §L. Accessibility (WCAG essentials)
- Keyboard reachable; focus order matches visual order; `aria-label` on
  icon-only buttons; inputs have `<label htmlFor>`; targets ≥ 44×44px;
  body contrast ≥ 4.5:1; color is never the only signal (pair icon/text);
  `prefers-reduced-motion` respected.

## §M. Z-index ladder
- Consistent stack (typical): sticky nav 40 < dropdowns 50 < modals 60
  < in-modal popovers 70 < toasts 80. A popover hidden behind a modal is
  a ladder violation — bump it above the modal.

## §N. Animation & transitions
- `transition-colors` for color-only; `transition-all` when shadow/scale/
  ring also change; duration 150–300ms; `active:scale-[0.98]` for tap
  feedback; nothing >500ms unless deliberate; respect reduced-motion.

## §O. Charts & data-viz (run on any dashboard / analytics surface)
- **Chart type matches the data:** trend → line; comparison → bar;
  proportion → pie/donut (≤5 slices, else bar); part-to-whole over time →
  stacked/area. A pie with 8 slices is a finding.
- **Legend + axis labels present** with units; axis ticks not cramped/
  rotated on mobile; legend near the chart, not below a scroll fold.
- **Values reachable:** tooltips on hover (web) / tap (mobile) showing
  exact numbers; for small datasets, prefer direct labels.
- **Color is not the only signal:** avoid red/green-only pairs
  (colorblind); supplement with pattern/label/shape; data lines/bars vs
  bg ≥ 3:1, data text ≥ 4.5:1; gridlines low-contrast so they don't
  fight the data.
- **States:** meaningful **empty** state ("No data yet" + guidance, not a
  blank axis frame); **loading** skeleton/shimmer; **error** state with
  retry — never a broken/empty chart.
- **Accessibility:** provide a text/table alternative or an
  `aria-label`/summary describing the chart's key insight; interactive
  points/bars keyboard-reachable with ≥44pt tap area.
- **Responsive:** reflow or simplify on small screens (horizontal bars,
  fewer ticks, aggregate/sample for 1000+ points). Locale-aware number/
  currency/date formatting; `tabular-nums` for figures.

## §P. Platform idioms (only when auditing native / mobile-app UI)
For web this is mostly N/A — but if the surface is iOS/Android/React-
Native/Flutter, also check: respect platform navigation (iOS tab bar /
Android top app bar, predictable back/swipe-back), safe-area insets
(notch, home indicator, status bar), prefer native/system controls,
44pt(iOS)/48dp(Android) targets, haptics for confirmations, and
`prefers-reduced-motion` / Dynamic Type. (Deep platform guidance —
component recipes, navigation patterns, per-stack rules — lives in the
`ui-ux-pro-max` skill; see the cross-reference below.)

---

# Part B — Design-system model (use the DSP; these are the FALLBACK defaults)

When the project exposes its own values (Step 0), use those. When it
doesn't, apply these neutral, framework-typical defaults and say you're
falling back.

## Semantic token model (map the project's tokens onto these roles)
- **surface / bg** — page & card background
- **fg** — primary text
- **muted** — secondary text, captions, inactive labels
- **border** (+ a stronger variant) — dividers, input/card rings
- **accent** (+ `accent-fg`) — brand color; primary actions, active states
- **danger / success / warning** (+ soft `/5–/10` bg variants) — status

Smell: raw palette colors (`bg-blue-600`, `text-gray-500`) where a
semantic token exists. Status colors (amber/green/red for
pending/ok/error) are acceptable but should be consistent app-wide and
pair color with an icon/text.

## Spacing scale (generic Tailwind fallback)
`gap-1` 4 · `gap-2` 8 · `gap-3` 12 · `gap-4` 16 · `gap-5` 20 ·
`gap-6` 24 · `gap-8` 32 · `gap-12` 48. Don't invent `gap-7` if `gap-8`
works. Cards `p-4 md:p-5`; modals `p-6 md:p-8`; inputs `p-3`–`p-3.5`;
label→input margin `mb-1`.

## Typography (generic fallback)
Page title `text-2xl/3xl font-bold` (one per page) · modal/section title
`text-lg font-semibold` · body `text-sm/base` · label `text-sm
text-muted mb-1` · caption `text-xs text-muted` · numerics `tabular-nums`.
Base body ≥ 16px on mobile to avoid iOS zoom.

## Border radius (generic fallback)
Form chrome `rounded-md`/`rounded-lg` · cards `rounded-xl` · modals
`rounded-2xl` (+ `rounded-t-2xl` mobile drawer) · pills/badges
`rounded-full`. Mixing radii within one component is a smell.

## Component recipes — principles (instantiate with the project's tokens)
- **Clickable card:** padded (`p-4 md:p-5`), visible ring (`ring-1`
  ring-border), `hover:` ring/shadow change, `active:scale-[0.98]`,
  consistent `min-h`. Selected: accent ring + accent-tinted bg.
- **Input:** full width, visible ring `ring-border` (not too faint),
  `focus:ring-2` accent, faded placeholder, `text-base` on mobile.
- **Primary button:** `bg-accent text-accent-fg`, hover feedback,
  disabled `opacity-50`, loading spinner. Secondary: subtle surface +
  border. Destructive: `bg-danger text-white`. Always prefer the
  project's `<Button>` over re-implementing.
- **Modal frame:** scrim `bg-black/40-60` (+ optional blur), centered
  desktop `max-w-Nxl rounded-2xl`, bottom-drawer mobile `rounded-t-2xl`,
  `max-h-[85vh] flex flex-col`, body `flex-1 min-h-0 overflow-y-auto`,
  action `flex-shrink-0`.

---

# Part C — Layout primitives (token-agnostic)

## Modal: single scroll body + pinned action
```tsx
<div className="...frame... flex flex-col overflow-hidden">
  <header className="flex-shrink-0">title + close</header>
  <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-3 py-2">
    fields…
    <div className="pb-4">last item gets breathing room</div>
  </div>
  <button className="flex-shrink-0 w-full">Submit</button>
</div>
```
Wrapping column `flex-1 min-h-0`; scroll middle `flex-1 min-h-0
overflow-y-auto`; action + header `flex-shrink-0`.

## Two-column desktop, single-column mobile
```tsx
<div className="flex flex-col md:grid md:grid-cols-2 md:gap-6
  space-y-4 md:space-y-0">
  <div className="md:overflow-y-auto md:min-h-0">A</div>
  <div className="md:overflow-y-auto md:min-h-0 md:border-l md:border-border">
    B (empty state if nothing selected)
  </div>
</div>
```

## Form section with bottom buffer
```tsx
<div className="border-t border-border pt-3 pb-4 space-y-4">
  fields…
  <div className="rounded-md p-4 bg-muted/5 ring-1 ring-border">summary</div>
</div>
```
The `pb-4` keeps the summary off the pinned button below it.

---

# Part D — Anti-patterns

❌ Don't: report one observation; patch the symptom (`px-1` on a child)
when an outer `overflow-hidden` is the cause; bundle unrelated cleanup;
hardcode hex / raw palette where a semantic token exists; mix radii in
one component; add accent colors outside the palette; use
`transition-colors` when shadow/scale/ring also change; use `<token>/5`
for an interactive element (too faint) or `/10` for an informational
display (too dark); skip `active:` states; inline `style={{}}` when a
token utility exists; treat the stated complaint as the full list; ask
for clarification before auditing; bump a token globally without
checking which surfaces leaned on the old (faint) value.

✅ Do: enumerate everything first; walk outward to the cause; cite the
DSP/§ rule; patch causes; one concern per commit; show before/after
class diffs; verify mobile + desktop (+ dark mode).

---

# Part E — Bug DNA (generic cross-project patterns)

Pattern-match new screenshots/components against these first. Substitute
the project's tokens for `<accent>`/`<fg>`/`<border>`.

1. **Chip rings clipped at top** — container has `pb-1` only. Fix `py-1`.
2. **Card/border ring invisible** — ring opacity too low vs same-tone
   surface (`<border>/10` on a light bg). Fix `/20+`.
3. **Inactive buttons washed out** at `<token>/5`. Fix `/10`, or surface
   color + ring.
4. **Form labels unreadable** at `<fg>/40-45`. Fix `/70`.
5. **First card in scroll-y column top-clipped.** Fix `py-1+` on column.
6. **Two scrollbars in one modal** — each section has its own
   `overflow-y-auto`. Fix one scroll wrapper.
7. **Action button scrolls with content.** Fix move out of scroll +
   `flex-shrink-0`.
8. **Modal hugs viewport edges** on desktop. Fix `md:p-6` on the wrapper.
9. **Selected ring touches modal wall.** Fix bump wrapper `px`.
10. **Popover clipped** by `overflow-hidden` modal. Fix inline disclosure
    or raise z-index above the modal.
11. **Form's last item flush with pinned button.** Fix `pb-4`.
12. **Hover-only affordance** looks flat on mobile. Fix baseline
    `shadow-sm` + `active:scale-[0.98]` + `active:bg-*`.
13. **In-flow `size-full`/`h-full` `<img>` inside an aspect-ratio box**
    balloons one item's height. Fix `absolute inset-0` (out of flow) so
    the box height comes purely from the aspect ratio.
14. **Multi-line titles break grid heights.** Fix `line-clamp-2` +
    `flex-col justify-between` + `min-h-[X]`.
15. **Primary CTA hidden until valid** leaves mobile users no anchor.
    Fix always render, `disabled={!canSubmit}`.
16. **JSON-body POST with empty body** to a framework that rejects empty
    `application/json` → send `{}` or drop the content-type (non-UI but
    common in form/submit flows).
17. **Status color used as the only signal.** Fix pair with icon + text.

Maintain a **project-specific Bug DNA** list as you find recurring
issues in THIS codebase; name the rule number when you re-spot one.

---

# Part F — Mode-by-mode

## IMAGE mode
1. `Read` the image. 2. Enumerate visible elements. 3. Run §A–§N on each.
4. Pattern-match Bug DNA (Part E). 5. Output via the template.

## BROWSER mode (agent-browser — you capture the screenshots)
**Prereqs (once/session):** dev server running (default
`http://localhost:3000`; ask if unsure); `agent-browser --version`
(install: `npm i -g agent-browser && agent-browser install`).

**Capture flow:**
```bash
agent-browser open http://localhost:3000/<route>
agent-browser snapshot -i            # interactive refs (cheap)
agent-browser click @e7              # reveal modal/dropdown if needed
agent-browser snapshot -i            # re-snapshot — refs go stale on DOM change
agent-browser set viewport 375 812   # mobile
agent-browser screenshot /tmp/ui-<page>-mobile.png
agent-browser set viewport 768 1024  # tablet
agent-browser screenshot /tmp/ui-<page>-tablet.png
agent-browser set viewport 1280 800  # desktop
agent-browser screenshot /tmp/ui-<page>-desktop.png
agent-browser close --all
```
Apply **Step 0.5 tiering** while capturing: `snapshot -i` first, then
give Tier-A (element-dense) surfaces an extra **cropped 2× pass**, keep
Tier-B at one viewport shot, and let Tier-C be snapshot-only — baseline
quality is never reduced, dense screens just get more detail.

Then `Read` each PNG and run §A–§N + Bug DNA; tag findings by breakpoint
(`🔴 Mobile (375): …`). If the project supports dark mode, capture (or
toggle via the app's control / `eval` adding the dark class) and check
that theme too.

**Auth/login-gated routes:** ask the user how to authenticate the first
time (their preference: log in via the UI with provided test creds, a
reused browser profile, or an auth vault). Don't guess credentials.

**Coverage for "audit the overall site / all flows":**
1. **Enumerate the full route tree first.** Read `app/`/`pages/`; list
   EVERY `page.tsx` route (incl. dynamic `[id]` segments and route
   groups). Print the inventory before capturing.
2. Group into: public/marketing, auth, app (and role-gated areas).
3. **Audit every route** — and for each, its key **states**, not just
   the read/happy path:
   - list views → also the **empty state**;
   - **create / "new" forms** and **edit forms** (these hide the most
     defects — required-field markers, label/input alignment, validation
     errors, disabled/loading submit, mobile keyboard types);
   - detail views;
   - **modals, drawers, dropdowns, sheets** (open them and shoot).
4. Capture at **mobile 375 / tablet 768 / desktop 1280**, and in **both
   themes** if theming exists.
5. End with a **route-coverage checklist**: every route ✓ audited or ⏭
   deferred **with a reason**. Never silently drop a route — if you skip
   one for budget, say so explicitly. A curated subset presented as
   "the whole site" is a failure of this skill.

**Token discipline:** `snapshot -i` (~hundreds of tokens) over full
snapshot; only the breakpoints relevant to the concern; reading many
large PNGs is the real cost — prioritize the highest-traffic / most-
complex surfaces and say what you skipped.

## CODE mode
1. Read the file/diff. 2. Extract every className + inline style. 3.
Cross-check vs the DSP (tokens, spacing, type, radius, recipes). 4.
Pattern-match Bug DNA. 5. Output findings with `file:line` + class diff.
Prefer the project's `<Button>/<Card>/<Input>` over re-implemented ones.

## GUIDANCE mode
1. Recognize the intent. 2. Pull the relevant recipe from the DSP (or
Part B fallback). 3. State the rule before writing code. 4. Give the
recipe + the reasoning (why these tokens) + the §A–§N traps to avoid. 5.
If they're about to hit an anti-pattern (Part D), call it out first.

---

# Part G — Output discipline

Every audit: (1) names the DSP it audited against; (2) lists what was
enumerated; (3) groups by severity 🔴/🟡/🟢; (4) cites rule sections /
DSP tokens; (5) includes class diffs; (6) notes confidence; (7) closes
with a recommended action. A good review catches every defect in one
pass and explains WHY each fix is right — not just what to do.
