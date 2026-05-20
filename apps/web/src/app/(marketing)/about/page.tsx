import Link from 'next/link';
import { IndianRupee, ShieldCheck, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/motion';
import { cn } from '@/lib/cn';

export const metadata = {
  title: 'About · Sangam',
  description:
    'Sangam is an AI-native restaurant POS built for Indian restaurants, cafes & cloud kitchens — affordable, fast, and built so your data stays yours.',
};

const PRINCIPLES: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: ShieldCheck,
    title: 'Your data is your shield',
    description:
      'An immutable, GST-safe audit trail. Export anytime. Your data never gets held hostage.',
  },
  {
    icon: IndianRupee,
    title: 'Honest, flat pricing',
    description: 'No commissions, no surprises. One predictable price you can plan around.',
  },
  {
    icon: Sparkles,
    title: 'AI that does the work',
    description:
      'An AI Waiter that takes orders, an AI Manager that runs your numbers, and Settle that claws back aggregator overcharges.',
  },
  {
    icon: Zap,
    title: 'Fast, made for India',
    description: 'UPI-native, Hindi-friendly, and built to work on any phone.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <FadeIn className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            AI-native restaurant POS
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Built for Indian restaurants & cafes — not against them.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Most restaurant tech is expensive, extractive, and treats your data as theirs.
            Sangam is the opposite: an AI-native POS that&apos;s affordable, fast, and keeps
            your data yours.
          </p>
        </FadeIn>
      </section>

      {/* Our story / why */}
      <section className="border-t border-border bg-subtle/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <FadeIn className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              Why we built Sangam
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
              <p>
                India runs on restaurants, cafes, chai tapris, and cloud kitchens. But
                their software is stuck — clunky legacy POS systems, delivery aggregators
                taking 18–30% of every order, and tools that were never really built for
                how Indian restaurants work.
              </p>
              <p>
                After 2026&apos;s high-profile restaurant data-seizure cases, owners are
                rightly asking a harder question:{' '}
                <span className="font-medium text-fg">
                  who really controls my data?
                </span>{' '}
                When your sales, your customers, and your history can be locked away or
                handed over without your say, the software isn&apos;t serving you — you&apos;re
                serving it.
              </p>
              <p>
                Sangam was built to flip that equation: powerful AI, honest pricing, and
                true data ownership. Technology that earns its keep by making good
                restaurants and cafes run better — never by holding them hostage.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* What we believe */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <FadeIn className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            What we believe
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Four principles shape every decision we make about Sangam.
          </p>
        </FadeIn>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PRINCIPLES.map((principle, index) => (
            <FadeIn key={principle.title} delay={index * 0.06}>
              <Card className="h-full">
                <CardHeader className="flex flex-row items-start gap-4">
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"
                    aria-hidden="true"
                  >
                    <principle.icon className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <CardTitle>{principle.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <CardDescription className="mt-0 text-sm leading-relaxed">
                    {principle.description}
                  </CardDescription>
                </CardBody>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* What we're building */}
      <section className="border-t border-border bg-subtle/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <FadeIn className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              What we&apos;re building
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              The operating system for India&apos;s independent restaurants — starting with
              the POS, ending with a{' '}
              <span className="font-medium text-fg">
                network that helps good restaurants win.
              </span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Final CTA band */}
      <section className="border-t border-border bg-accent/5">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <FadeIn className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                See why restaurants & cafes switch to Sangam
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted">
                Affordable, fast, and built so your data stays yours. Up and running in
                minutes.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a
                href="mailto:chetankushwah929@gmail.com"
                className={cn(buttonClasses({ variant: 'primary', size: 'lg' }), 'w-full sm:w-auto')}
              >
                Book a call
              </a>
              <Link
                href="/pricing"
                className={cn(
                  buttonClasses({ variant: 'secondary', size: 'lg' }),
                  'w-full sm:w-auto',
                )}
              >
                View pricing
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
