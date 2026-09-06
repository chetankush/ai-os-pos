import { buttonClasses } from '@/components/ui/button';
import { TriquetraMark } from '@/components/ui/logo';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { cn } from '@/lib/cn';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  ArrowRight,
  BadgeIndianRupee,
  Check,
  Clock,
  FileCheck2,
  Lock,
  MessageSquare,
  Plus,
  QrCode,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Sangam — the AI-native POS for Indian restaurants & cafes',
  description:
    'A calm, all-in-one restaurant POS for Indian restaurants, cafes & cloud kitchens — counter billing, QR ordering, UPI payments, GST bills, and an AI manager that does the busywork. 0% commission. Your data stays yours.',
};

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/cafes');

  return (
    <>
      <Hero />
      <TrustStrip />
      <Features />
      <WhyBand />
      <FinalCta />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <FadeIn>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-subtle px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            AI-native restaurant POS
          </span>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Run your restaurant on one calm, all-in-one POS.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Modern billing, QR table ordering, and UPI-native payments — with an AI that handles the
            busywork so you can stay on the floor. Built for Indian restaurants, cafes & cloud
            kitchens, and <span className="font-medium text-fg">your data stays yours.</span>
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={buttonClasses({
                variant: 'primary',
                size: 'lg',
                className: 'w-full sm:w-auto',
              })}
            >
              Get started
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="mailto:chetankushwah929@gmail.com"
              className={buttonClasses({
                variant: 'secondary',
                size: 'lg',
                className: 'w-full sm:w-auto',
              })}
            >
              Book a call
            </a>
          </div>
          <p className="mt-5 text-xs text-muted">
            0% commission · no setup fee · set up in minutes
          </p>
        </FadeIn>

        <FadeIn delay={0.12} className="lg:pl-4">
          <DashboardMock />
        </FadeIn>
      </div>
    </section>
  );
}

/** A faux app "dashboard" peek — stat rows + a live order list, pure divs/SVG. */
function DashboardMock() {
  const stats = [
    { label: "Today's revenue", value: '₹48,250', up: '+12%' },
    { label: 'Orders', value: '186', up: '+8%' },
    { label: 'Avg. bill', value: '₹259', up: '+3%' },
  ];
  const orders = [
    { id: '#1042', table: 'Table 6', items: '2 items', amt: '₹420', state: 'Preparing' },
    { id: '#1041', table: 'QR · Table 2', items: '3 items', amt: '₹685', state: 'Paid' },
    { id: '#1040', table: 'Takeaway', items: '1 item', amt: '₹180', state: 'Paid' },
  ];

  return (
    <div className="relative">
      {/* soft accent glow behind the card */}
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-2xl"
        aria-hidden="true"
      />
      <div className="rounded-2xl border border-border bg-bg p-4 shadow-md shadow-black/[0.06] sm:p-5">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <TriquetraMark className="size-6 text-accent" />
            <span className="text-sm font-semibold tracking-tight">Sangam</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            Live
          </span>
        </div>

        {/* stat rows */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-subtle/50 p-3">
              <p className="truncate text-[11px] text-muted">{s.label}</p>
              <p className="mt-1 text-base font-semibold tracking-tight tabular-nums">{s.value}</p>
              <p className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-success">
                <TrendingUp className="size-3" aria-hidden="true" />
                {s.up}
              </p>
            </div>
          ))}
        </div>

        {/* order list */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted">Recent orders</p>
            <span className="text-[11px] text-muted">Auto-updating</span>
          </div>
          {orders.map((o) => {
            const paid = o.state === 'Paid';
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                  <Utensils className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium tabular-nums">
                    {o.id} · {o.table}
                  </p>
                  <p className="truncate text-[11px] text-muted">{o.items}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{o.amt}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    paid ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent',
                  )}
                >
                  {paid ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <Clock className="size-3" aria-hidden="true" />
                  )}
                  {o.state}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trust strip                                                         */
/* ------------------------------------------------------------------ */

const TRUST = [
  { icon: BadgeIndianRupee, label: '0% commission' },
  { icon: Wallet, label: 'UPI-native' },
  { icon: Receipt, label: 'GST-ready' },
  { icon: Smartphone, label: 'Works on any phone' },
  { icon: Lock, label: 'Your data, yours' },
];

function TrustStrip() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8">
      <FadeIn>
        <ul className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {TRUST.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle/50 px-3.5 py-2 text-sm font-medium text-fg"
            >
              <Icon className="size-4 text-accent" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </FadeIn>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature rows                                                        */
/* ------------------------------------------------------------------ */

type Feature = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mock: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    eyebrow: 'Take orders anywhere',
    title: 'From the counter to the table to the curb.',
    body: 'Fast counter billing, QR ordering diners scan themselves, and an AI waiter that suggests the right add-ons — all in one flow.',
    bullets: [
      'Counter & KOT billing in seconds',
      'Scan-to-order QR menus per table',
      'AI waiter upsells, politely',
    ],
    mock: <PhoneMock />,
  },
  {
    eyebrow: 'Get paid & reconciled',
    title: 'Money in, perfectly accounted for.',
    body: 'Accept UPI, cards, and cash, print instant GST bills, and close the day with a clean cash-up. Settle even claws back what aggregators overcharge.',
    bullets: [
      'UPI, cards & cash, instant GST bills',
      'One-tap end-of-day cash-up',
      'Settle recovers aggregator overcharges',
    ],
    mock: <ReconcileMock />,
  },
  {
    eyebrow: 'Your AI manager',
    title: 'Just ask. It already knows your numbers.',
    body: 'No dashboards to dig through. Ask in plain language and get answers from your live data — revenue, stock, top sellers, whatever you need.',
    bullets: [
      'Plain-language questions, instant answers',
      'Live revenue, stock & sales insight',
      'Works from any phone, any time',
    ],
    mock: <ChatMock />,
  },
  {
    eyebrow: 'Your data is your shield',
    title: 'An audit trail you can stand behind.',
    body: 'Every order and edit is recorded in an immutable, GST-safe log. Nothing is quietly rewritten — and you can export all of it, anytime.',
    bullets: [
      'Immutable, GST-safe audit trail',
      'Tamper-evident order history',
      'Export everything, anytime',
    ],
    mock: <AuditMock />,
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <FadeIn className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Everything your restaurant runs on, in one place.
        </h2>
        <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
          Ordering, payments, insight, and an audit trail — designed to work together so nothing
          falls through the cracks.
        </p>
      </FadeIn>

      <div className="mt-14 space-y-16 sm:space-y-24">
        {FEATURES.map((f, i) => (
          <FeatureRow key={f.title} feature={f} flip={i % 2 === 1} />
        ))}
      </div>
    </section>
  );
}

function FeatureRow({ feature, flip }: { feature: Feature; flip: boolean }) {
  return (
    <FadeIn>
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div className={cn(flip && 'lg:order-2')}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-subtle px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            {feature.eyebrow}
          </span>
          <h3 className="mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {feature.title}
          </h3>
          <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted">
            {feature.body}
          </p>
          <ul className="mt-6 space-y-3">
            {feature.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/10">
                  <Check className="size-3.5 text-accent" aria-hidden="true" />
                </span>
                <span className="text-sm leading-relaxed text-fg">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(flip && 'lg:order-1')}>{feature.mock}</div>
      </div>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/* Feature mocks (CSS/SVG only)                                        */
/* ------------------------------------------------------------------ */

/** Faux phone frame showing a QR menu with items + an Add button. */
function PhoneMock() {
  const items = [
    { name: 'Filter Coffee', price: '₹90' },
    { name: 'Masala Dosa', price: '₹140' },
    { name: 'Veg Pulao', price: '₹180' },
  ];
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-[280px] rounded-[2rem] border border-border-strong bg-bg p-2.5 shadow-md shadow-black/[0.06]">
        {/* notch */}
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-border-strong" aria-hidden="true" />
        <div className="overflow-hidden rounded-[1.5rem] border border-border bg-subtle/40">
          <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-3">
            <QrCode className="size-4 text-accent" aria-hidden="true" />
            <p className="text-sm font-semibold tracking-tight">Table 4 · Menu</p>
          </div>
          <div className="space-y-2 p-3">
            {items.map((it, idx) => (
              <div
                key={it.name}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg p-2.5"
              >
                <span className="size-9 shrink-0 rounded-lg bg-accent/10" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-xs text-muted tabular-nums">{it.price}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                    idx === 0 ? 'bg-accent text-accent-fg' : 'border border-border text-fg',
                  )}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-bg p-3">
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
              View cart · ₹230
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Faux reconciliation card with payment rows + a highlighted recovered amount. */
function ReconcileMock() {
  const rows = [
    { label: 'UPI settlement', amt: '₹21,400', ok: true },
    { label: 'Card payouts', amt: '₹9,860', ok: true },
    { label: 'Aggregator payout', amt: '₹14,120', ok: true },
  ];
  return (
    <div className="rounded-2xl border border-border bg-bg p-5 shadow-md shadow-black/[0.06]">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="text-sm font-semibold tracking-tight">Reconciliation</p>
        <span className="text-[11px] text-muted">Today</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 rounded-lg border border-border bg-subtle/40 p-3"
          >
            <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
            <span className="flex-1 text-sm text-fg">{r.label}</span>
            <span className="text-sm font-semibold tabular-nums">{r.amt}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-fg">Settle recovered</p>
          <p className="text-[11px] text-muted">Overcharge clawed back</p>
        </div>
        <span className="text-base font-bold tabular-nums text-accent">+₹1,240</span>
      </div>
    </div>
  );
}

/** Faux chat bubble exchange with the AI manager. */
function ChatMock() {
  return (
    <div className="rounded-2xl border border-border bg-bg p-5 shadow-md shadow-black/[0.06]">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/10 text-accent">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold tracking-tight">AI Manager</p>
      </div>
      <div className="mt-4 space-y-3">
        {/* user bubble */}
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">
            What&apos;s today&apos;s revenue?
          </p>
        </div>
        {/* ai bubble */}
        <div className="flex justify-start">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-subtle/50 px-3.5 py-2 text-sm text-fg">
            ₹48,250 so far — up 12% on last Tuesday. Lunch was your busiest hour.
          </p>
        </div>
        {/* user bubble */}
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">
            What&apos;s out of stock?
          </p>
        </div>
        {/* ai bubble */}
        <div className="flex justify-start">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-subtle/50 px-3.5 py-2 text-sm text-fg">
            Paneer and cold brew are running low. Want me to 86 them on the QR menu?
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-subtle/40 px-3 py-2">
        <span className="flex-1 text-sm text-muted">Ask anything…</span>
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
          <Send className="size-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/** Faux immutable audit-log list with lock/check icons. */
function AuditMock() {
  const log = [
    { who: 'Order #1042 created', when: '13:42', meta: 'by Priya · Table 6' },
    { who: 'Bill #1041 settled', when: '13:39', meta: 'UPI · ₹685' },
    { who: 'Item voided', when: '13:31', meta: 'reason logged · by manager' },
    { who: 'Day opened', when: '08:00', meta: 'cash float ₹2,000' },
  ];
  return (
    <div className="rounded-2xl border border-border bg-bg p-5 shadow-md shadow-black/[0.06]">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-accent" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-tight">Audit log</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
          <FileCheck2 className="size-3" aria-hidden="true" />
          Immutable
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {log.map((e) => (
          <li
            key={e.who}
            className="flex items-start gap-3 rounded-lg border border-border bg-subtle/40 p-3"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{e.who}</p>
              <p className="truncate text-[11px] text-muted">{e.meta}</p>
            </div>
            <span className="text-[11px] tabular-nums text-muted">{e.when}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Why band (stats)                                                    */
/* ------------------------------------------------------------------ */

const WHY = [
  {
    icon: BadgeIndianRupee,
    title: '0% commission',
    body: 'Keep every rupee you earn — no cut on any order, on any channel.',
  },
  {
    icon: TrendingUp,
    title: 'Built for 10k+ orders/day',
    body: 'Fast enough for the lunch rush and steady through peak service.',
  },
  {
    icon: Wallet,
    title: 'UPI + cards + cash',
    body: 'Take payment the way India already pays, all reconciled for you.',
  },
  {
    icon: Clock,
    title: 'Setup in minutes',
    body: 'No installs, no expensive hardware — start on the phone in hand.',
  },
];

function WhyBand() {
  return (
    <section className="bg-subtle/50">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Honest by design.
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
            No commissions, no lock-in, no surprises — just software that earns its keep.
          </p>
        </FadeIn>

        <Stagger className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(({ icon: Icon, title, body }) => (
            <StaggerItem key={title}>
              <div className="h-full rounded-xl border border-border bg-bg p-5 shadow-sm shadow-black/[0.03]">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold tracking-tight text-fg">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA band                                                      */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <FadeIn>
        <div className="rounded-2xl border border-accent/30 bg-accent/5 px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Give your restaurant its calmest shift yet.
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
            Start taking orders today — 0% commission, set up in minutes, and your data stays yours.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={buttonClasses({
                variant: 'primary',
                size: 'lg',
                className: 'w-full sm:w-auto',
              })}
            >
              Get started free
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="mailto:chetankushwah929@gmail.com"
              className={buttonClasses({
                variant: 'secondary',
                size: 'lg',
                className: 'w-full sm:w-auto',
              })}
            >
              <MessageSquare className="size-4" aria-hidden="true" />
              Book a call
            </a>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
