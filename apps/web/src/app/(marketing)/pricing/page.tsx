import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/motion';
import { cn } from '@/lib/cn';
import { Check, ShieldCheck, Sparkles, TrendingDown, X } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Pricing · Sangam',
  description:
    'One flat, honest price for your restaurant POS — 0% commission, unlimited orders, everything included. Built for Indian restaurants, cafes & cloud kitchens.',
};

type Tier = {
  name: string;
  price: string;
  who: string;
  features: string[];
  cta: string;
  variant: 'primary' | 'secondary';
  popular?: boolean;
};

const TIERS: Tier[] = [
  {
    name: 'Solo',
    price: '999',
    who: 'For a single outlet finding its feet.',
    features: [
      'POS billing',
      'KOT + GST bills',
      'QR table ordering',
      'AI Waiter',
      'Unlimited orders',
      '0% commission',
    ],
    cta: 'Get started',
    variant: 'secondary',
  },
  {
    name: 'Growth',
    price: '2,499',
    who: 'For busy restaurants & multi-outlet brands.',
    features: [
      'Everything in Solo',
      'AI Manager',
      'Settle — aggregator reconciliation',
      'Priority support',
      'Advanced analytics',
    ],
    cta: 'Get started',
    variant: 'primary',
    popular: true,
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do you take a commission on my sales?',
    a: 'Never. 0% commission on every order, on every channel. You keep what you earn.',
  },
  {
    q: 'Are there setup or hardware fees?',
    a: 'No. There is no setup fee and no hidden hardware charge — you pay one flat monthly price.',
  },
  {
    q: 'Is there a lock-in contract?',
    a: 'No. Billing is monthly and you can cancel anytime, no questions asked.',
  },
  {
    q: 'Is GST included in the price?',
    a: 'Prices are exclusive of GST. GST is added at the applicable rate on your invoice.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes, anytime. Your data is yours — export your orders, menu and reports whenever you like.',
  },
  {
    q: 'Do you support UPI?',
    a: 'Yes. Sangam is UPI-native, so diners can pay the way India already pays.',
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-subtle px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            0% commission, always
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Pay less for your POS.
          </h1>
          <p className="mx-auto mt-5 max-w-prose text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Legacy POS and delivery aggregators bleed restaurants with fat monthly fees and 18–30%
            commissions. Sangam is one flat, honest price —{' '}
            <span className="font-medium text-fg">0% commission</span>, everything included.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
              Get started
            </Link>
            <Link href="#plans" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
              See features
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted">
            Prices in INR, billed monthly · GST extra · no setup fee
          </p>
        </FadeIn>
      </section>

      {/* Comparison strip */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeIn>
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            <div className="flex items-start gap-3 bg-bg p-5 sm:p-6">
              <X className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-muted">
                <span className="font-medium text-fg">Others:</span> 18–30% aggregator commission
                plus per-feature add-ons that stack up every month.
              </p>
            </div>
            <div className="flex items-start gap-3 bg-bg p-5 sm:p-6">
              <Check className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-fg">
                <span className="font-medium">Sangam:</span> one flat price, 0% commission,
                unlimited orders.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Pricing cards */}
      <section id="plans" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Simple plans, no surprises
          </h2>
          <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
            Pick the plan that fits your kitchen today. Upgrade or cancel anytime — billing is
            monthly.
          </p>
        </FadeIn>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
          {TIERS.map((tier, i) => (
            <FadeIn key={tier.name} delay={i * 0.08} className="h-full">
              <Card
                className={cn(
                  'relative flex h-full flex-col',
                  tier.popular && 'border-accent ring-1 ring-accent shadow-md shadow-black/[0.06]',
                )}
              >
                {tier.popular ? (
                  <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg shadow-sm">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Most popular
                  </span>
                ) : null}
                <CardBody className="flex flex-1 flex-col gap-6 p-6 pt-6 sm:p-8 sm:pt-8">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{tier.name}</h3>
                    <p className="mt-1 text-sm text-muted">{tier.who}</p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-medium text-muted">₹</span>
                    <span className="text-5xl font-semibold tracking-tight tabular-nums">
                      {tier.price}
                    </span>
                    <span className="text-sm text-muted">/mo</span>
                  </div>

                  <ul className="flex flex-1 flex-col gap-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                        <span className="text-sm leading-relaxed text-fg">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className={buttonClasses({
                      variant: tier.variant,
                      size: 'lg',
                      className: 'w-full',
                    })}
                  >
                    {tier.cta}
                  </Link>
                </CardBody>
              </Card>
            </FadeIn>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          Prices in INR, billed monthly · GST extra · no setup fee
        </p>
      </section>

      {/* It pays for itself */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeIn>
          <div className="rounded-2xl border border-border bg-subtle/50 p-8 sm:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                It pays for itself
              </h2>
              <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
                A flat fee plus Settle clawing back what aggregators overcharge means you pay less{' '}
                <span className="font-medium text-fg">net</span> — often the subscription disappears
                entirely.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3">
              <Payoff
                icon={<TrendingDown className="size-5" aria-hidden="true" />}
                title="0% commission"
                body="No 18–30% cut on every order — that alone dwarfs the monthly fee."
              />
              <Payoff
                icon={<ShieldCheck className="size-5" aria-hidden="true" />}
                title="Settle recovers money"
                body="Reconciliation catches aggregator overcharges and claws them back to you."
              />
              <Payoff
                icon={<Check className="size-5" aria-hidden="true" />}
                title="Everything included"
                body="No per-feature add-ons stacking onto your bill each month."
              />
            </div>
          </div>
        </FadeIn>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <FadeIn className="mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {FAQS.map((faq) => (
              <div key={faq.q} className="py-5">
                <dt className="text-base font-medium text-fg">{faq.q}</dt>
                <dd className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </FadeIn>
      </section>

      {/* Final CTA band */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
        <FadeIn>
          <div className="rounded-2xl border border-accent/30 bg-accent/5 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Start taking orders today
            </h2>
            <p className="mx-auto mt-4 max-w-prose text-pretty text-base leading-relaxed text-muted">
              One flat price, 0% commission, set up in minutes. Your data stays yours.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/signup" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                Get started
              </Link>
            </div>
          </div>
        </FadeIn>
      </section>
    </>
  );
}

function Payoff({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="text-center sm:text-left">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold tracking-tight text-fg">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
