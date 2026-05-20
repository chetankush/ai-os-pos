# Sangam — Design System

The single source of truth for Sangam's UI. The `ui-audit` skill reads this
first (Step 0a) and enforces it across the platform. Code is authoritative for
exact recipes — file paths are noted so this doc and the code stay in sync.

- Stack: Next.js 15 (App Router) · Tailwind CSS v4 · TypeScript · lucide-react
  icons · framer-motion · sonner (toasts).
- Token source: `apps/web/src/app/globals.css` (`@theme` + `.dark`).
- Primitives: `apps/web/src/components/ui/*`.

---

## 1. Brand

- **Mark:** a **triquetra** (three interlocking arcs) — meaning *Sangam* /
  संगम, "confluence". Coral, drawn with `currentColor`.
  Component: `components/ui/logo.tsx` → `<TriquetraMark>` and `<Logo>`.
  Never use an "S" letter-box; always the triquetra.
- **Accent / brand color:** warm **terracotta-coral** (more orange than
  Airbnb's pink-coral) — appetizing + Indian-cafe-warm.
- **Voice of the product:** Sangam is an AI-native POS for **Indian
  restaurants & cafes** (and cloud kitchens) — always inclusive of both, never
  "cafe"-only in user-facing copy.

---

## 2. Color tokens (semantic — never use raw palette in components)

Defined as CSS variables in `globals.css` and exposed as Tailwind utilities
(`bg-bg`, `text-fg`, `text-muted`, `bg-subtle`, `border-border`,
`bg-accent`, `text-accent`, `text-accent-fg`, `text-danger`, `text-success`).

| Role | Token | Light | Dark |
|---|---|---|---|
| Page / surface bg | `bg` | `#ffffff` | `#0c0c0e` |
| Primary text | `fg` | `#1c1917` | `#fafaf9` |
| Secondary text | `muted` | `#6b6560` | `#a8a29e` |
| Subtle surface | `subtle` | `#f4f4f2` | `#1c1917` |
| Border / ring | `border` | `#d2cfca` | `#3a3531` |
| Strong border | `border-strong` | `#a8a29e` | `#57514b` |
| **Brand accent** | `accent` | `#db5437` | `#ee6a48` |
| On-accent text | `accent-fg` | `#ffffff` | `#ffffff` |
| Danger | `danger` | `#dc2626` | (same) |
| Success | `success` | `#16a34a` | (same) |

Rules:
- Use **semantic tokens only** in components — never `bg-blue-600`,
  `text-gray-500`, or raw hex. (Exceptions: the status/payment color sets in
  §8, which are intentional, and one hardcoded Razorpay theme fallback.)
- `accent` is the brand color: primary buttons, active nav, badges, links,
  the logo, key emphasis. White text on `accent` (buttons are semibold).
- `accent/5`–`accent/10` tints for soft accent surfaces (CTA bands, active
  sidebar item `bg-accent/10 text-accent`).

---

## 3. Theming (dark mode)

- **Class-based**, light is the default. `@custom-variant dark` +
  `.dark` on `<html>`; toggle via `components/ui/theme-toggle.tsx`
  (persists `localStorage.theme`).
- Anti-flash: an inline script in `app/layout.tsx` applies the saved theme
  before paint.
- **Every surface must work in both themes.** Pair light + dark values
  (don't invert). Audit both.

---

## 4. Typography

Fonts loaded in `app/layout.tsx`:
- `--font-sans` = **Geist** → app / POS UI (`font-sans`, the default).
- `--font-mono` = **Geist Mono** → order numbers, slugs, code (`font-mono`).
- `--font-display` = **Outfit** (a free Gilroy-style geometric sans) → the
  **brand / marketing** surfaces. Applied on the marketing layout root
  (`font-display`). Note: Gilroy is licensed; Outfit is the stand-in — swap
  via `next/font/local` if a Gilroy license is added.

Scale (Tailwind): page title `text-3xl/4xl font-bold tracking-tight` (one per
page) · marketing H1 `text-4xl sm:text-5xl lg:text-6xl font-bold` · section
`text-lg/2xl font-semibold` · body `text-sm` (app) / `text-base` (marketing) ·
label `text-sm` (or `text-[11px] uppercase tracking-wider text-muted`) ·
caption `text-xs text-muted`. Base ≥16px on mobile inputs (no iOS zoom).
**`tabular-nums`** for all money, counts, IDs, timers.

---

## 5. Spacing & radius

- **Spacing:** Tailwind scale — `gap-1`(4) `2`(8) `3`(12) `4`(16) `5`(20)
  `6`(24) `8`(32) `12`(48). Keep section gaps consistent; no off-scale values.
  Cards `p-4 md:p-5`; modals `p-6 md:p-8`; inputs `~p-3`; label→input `mb-1`.
- **Radius:**
  - inputs / buttons → `rounded-lg`
  - cards / tiles → `rounded-xl`
  - modals / sheets → `rounded-2xl` (mobile bottom-drawer `rounded-t-2xl`)
  - pills / chips / badges / status dots → `rounded-full`
  - small inner chrome (badges, code) → `rounded` / `rounded-md`
  Mixing radii within one component is a smell.

---

## 6. Breakpoints & layout

- Tailwind defaults: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.
- **Mobile-first.** Two-column desktop layouts collapse to a single stack on
  mobile; primary actions `w-full` and bottom-pinned.
- **Cafe workspace** (`cafes/[id]/*`) uses a left sidebar on **`lg`+**
  (`components/cafe-shell.tsx`); below `lg` it becomes a **hamburger drawer**.
- Marketing container: `mx-auto max-w-6xl px-5 sm:px-8`; sections
  `py-16 sm:py-24` (hero `py-20 sm:py-28`). App container: `max-w-6xl px-6`.

---

## 7. Component recipes (source: `components/ui/*`)

### Button — `components/ui/button.tsx` (`<Button>` / `buttonClasses()`)
Base: `inline-flex items-center justify-center gap-2 rounded-lg font-medium
transition-all duration-150 ease-out focus-visible:ring-2
focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:ring-fg
disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
touch-manipulation`.
- **primary:** `bg-accent text-accent-fg shadow-sm hover:opacity-90
  hover:-translate-y-px hover:shadow-md`
- **secondary:** `bg-bg text-fg border border-border hover:bg-subtle
  hover:border-border-strong`
- **ghost:** `bg-transparent text-fg hover:bg-subtle`
- **danger:** `bg-danger text-white …`
- **sizes:** `sm` h-9 px-3.5 text-xs · `md` h-10 px-4 text-sm · `lg` h-11
  px-6 text-sm. (`lg` = 44px, the mobile tap-target floor.)
- `loading` shows a spinner + disables. **Always use `<Button>`/`buttonClasses`
  — never re-implement a button inline.** For `mailto:`/external, use a styled
  `<a>` (e.g. "Book a call" → `mailto:`).

### Input — `components/ui/input.tsx` (+ `Field`/label in `label.tsx`)
Full-width, `rounded-lg`, visible `border-border`, `focus:ring-2` (fg),
faded placeholder, `text-base` on mobile. Labels visible (not placeholder-
only), `mb-1`; required marked with a coral `*`. Password: `password-input.tsx`
with show/hide.

### Card — `components/ui/card.tsx`
`Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardBody`:
`rounded-xl border border-border bg-bg`. Clickable cards add hover ring/shadow
+ `active:scale-[0.98]`.

### Modal / dialog
Scrim `bg-black/40–60` (+ blur); centered desktop `max-w-Nxl rounded-2xl`,
bottom-drawer mobile `rounded-t-2xl`; `max-h-[~85vh] flex flex-col`; body
`flex-1 min-h-0 overflow-y-auto`; action pinned `flex-shrink-0`. Destructive
confirms via `components/ui/confirm-dialog.tsx` (Radix AlertDialog).

### Other primitives
`theme-toggle.tsx` (light/dark) · `motion.tsx` (`FadeIn`/`Stagger`/
`StaggerItem`, respect reduced-motion) · `chat-markdown.tsx` (safe markdown for
AI replies — bold/italic/code/lists, no raw HTML) · `image-upload.tsx` · `logo.tsx`.

---

## 8. Status & payment colors (intentional palette sets)

These use Tailwind palette colors **with dark variants** — keep them
consistent and always pair color with an icon + text label.

- **Order status** — `cafes/[id]/orders/_components/status-pill.tsx`
  (`<StatusPill>`): pending → amber · preparing → blue · ready → emerald ·
  completed → zinc · cancelled → red. Use `<StatusPill>` everywhere
  (dashboard, lists, detail) — do **not** re-declare a light-only map.
- **Payment status** — `payment-badge.tsx` (`<PaymentBadge>`): paid → green
  (`CheckCircle`) · pending → amber (`Clock`) · failed → red (`XCircle`) ·
  unpaid → muted (`Circle`) · refunded → blue (`RotateCcw`). Append method
  when paid (e.g. "Paid · upi").

---

## 9. Money, icons, motion, a11y

- **Money:** integers in **paise**; render with the `formatRupees` helpers;
  always `tabular-nums`. GST in basis points (1800 = 18% AC, 500 = 5% non-AC).
- **Icons:** **lucide-react** only — one set, consistent size per context.
  Never emojis as structural icons.
- **Motion:** 150–300ms; `transition-colors` for color-only, `transition-all`
  when shadow/scale/ring change; `active:scale-[0.98]` for tap feedback;
  respect `prefers-reduced-motion` (handled globally).
- **Accessibility:** keyboard-reachable; visible focus rings
  (`:focus-visible` = 2px `fg`); `aria-label` on icon-only buttons; labels via
  `<label htmlFor>`; tap targets ≥44px; body contrast ≥4.5:1; color never the
  only signal.

---

## 10. Anti-patterns (don't)

- Raw palette/hex where a semantic token exists (`bg-blue-600`,
  `text-gray-500`) — except the §8 status/payment sets.
- An "S" letter-box instead of the `<TriquetraMark>`.
- A status pill re-declared without dark variants (use `<StatusPill>`).
- Re-implementing buttons/inputs/cards instead of `components/ui/*`.
- "cafe"-only user-facing copy — Sangam targets restaurants **and** cafes.
- Mixing radii in one component; off-scale spacing.
- Light-only styling (every surface must pass in dark mode).
- An in-flow `size-full` `<img>` inside an aspect-ratio box (use
  `absolute inset-0` so the box height comes purely from the ratio).

---

## 11. Reference surfaces

- **Brand / marketing reference:** the **landing page** (`app/(marketing)/
  page.tsx`) + marketing layout — display font (Outfit), coral accent, the
  triquetra, generous sections.
- **App / POS reference:** the **dashboard** (`cafes/[id]/page.tsx`) +
  `components/ui/*` — Geist font, semantic tokens, cards, the cafe sidebar.
Standardize new surfaces against these two.
