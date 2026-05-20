import Link from 'next/link';
import {
  ArrowRight,
  BadgeIndianRupee,
  Handshake,
  Headset,
  Megaphone,
  Network,
  Rocket,
  Sparkles,
  Store,
} from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FadeIn } from '@/components/ui/motion';
import { cn } from '@/lib/cn';

export const metadata = {
  title: 'Partner with us · Sangam',
  description:
    'Grow with Sangam — partner programs for POS resellers, restaurant consultants, cloud-kitchen and franchise networks, and early launch-partner restaurants & cafes.',
};

const PARTNER_TYPES = [
  {
    icon: Store,
    title: 'Resellers & consultants',
    description:
      'Bring restaurants and cafes onto Sangam and earn recurring revenue share on every account you sign and support.',
  },
  {
    icon: Network,
    title: 'Cloud-kitchen & franchise networks',
    description:
      'Standardize POS, QR ordering, and reconciliation across all your outlets from a single playbook.',
  },
  {
    icon: Rocket,
    title: 'Launch partners',
    description:
      'Early restaurants & cafes who shape the product roadmap and lock in founder pricing for the life of the account.',
  },
] as const;

const BENEFITS = [
  {
    icon: BadgeIndianRupee,
    title: 'Recurring revenue share',
    description:
      'Earn an ongoing share on every account you bring live — not a one-time finder fee.',
  },
  {
    icon: Headset,
    title: 'Priority onboarding & training',
    description:
      'We set up your accounts fast and train your team so venues go live without friction.',
  },
  {
    icon: Megaphone,
    title: 'Co-marketing & referrals',
    description:
      'Joint campaigns, referral pipelines, and shared material to help you reach more restaurants.',
  },
  {
    icon: Sparkles,
    title: 'Early access to AI features',
    description:
      'Get new AI capabilities before launch and put them in front of your clients first.',
  },
  {
    icon: Handshake,
    title: 'A dedicated partner manager',
    description:
      'One point of contact who knows your accounts and helps you grow — not a ticket queue.',
  },
  {
    icon: BadgeIndianRupee,
    title: 'An honest, flat product',
    description:
      'Simple flat pricing with no per-order commissions to explain away. Easy to sell, easy to trust.',
  },
] as const;

const STEPS = [
  {
    title: 'Apply',
    description:
      'Tell us about your restaurants, cafes, or clients and how you work. We reply within a couple of business days.',
  },
  {
    title: 'Onboard & train',
    description:
      'We set you up, share the playbook, and train your team so you can take restaurants live with confidence.',
  },
  {
    title: 'Earn & grow',
    description:
      'Bring restaurants onto Sangam and earn recurring revenue share as your portfolio grows.',
  },
] as const;

export default function PartnersPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <FadeIn className="max-w-2xl space-y-5">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">
            Partner program
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
            Partner with us.
          </h1>
          <p className="text-base sm:text-lg text-muted leading-relaxed text-pretty">
            Grow with Sangam — built for POS resellers, restaurant consultants,
            cloud-kitchen & franchise networks, and early launch-partner
            restaurants & cafes. Bring venues onto a fast, AI-native POS and earn
            as they grow.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <a
              href="mailto:partners@sangam.in"
              className={buttonClasses({ variant: 'primary', size: 'lg' })}
            >
              Become a partner
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <Link
              href="/pricing"
              className={buttonClasses({ variant: 'secondary', size: 'lg' })}
            >
              See pricing
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* Partner types */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Ways to partner
          </h2>
          <p className="text-sm sm:text-base text-muted leading-relaxed text-pretty">
            Whether you sell, advise, or run kitchens — there is a path that fits
            how you work.
          </p>
        </FadeIn>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PARTNER_TYPES.map((type, i) => {
            const Icon = type.icon;
            return (
              <FadeIn key={type.title} delay={0.06 * i} className="h-full">
                <Card className="h-full">
                  <CardHeader>
                    <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle className="mt-4">{type.title}</CardTitle>
                    <CardDescription className="leading-relaxed">
                      {type.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </FadeIn>
            );
          })}
        </div>
      </section>

      {/* Why partner with Sangam */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Why partner with Sangam
          </h2>
          <p className="text-sm sm:text-base text-muted leading-relaxed text-pretty">
            A program designed to make partners money and make restaurants
            successful — with the support to back it up.
          </p>
        </FadeIn>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <FadeIn key={benefit.title} delay={0.05 * i} className="h-full">
                <div className="flex h-full gap-4 rounded-xl border border-border bg-bg p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-tight">
                      {benefit.title}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            How it works
          </h2>
          <p className="text-sm sm:text-base text-muted leading-relaxed text-pretty">
            Three simple steps from first conversation to a growing book of
            accounts.
          </p>
        </FadeIn>

        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <FadeIn key={step.title} delay={0.06 * i} className="h-full">
              <li className="flex h-full flex-col rounded-xl border border-border bg-subtle/30 p-6">
                <span
                  className="grid size-10 place-items-center rounded-full bg-accent text-base font-semibold text-accent-fg"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">
                  {step.description}
                </p>
              </li>
            </FadeIn>
          ))}
        </ol>
      </section>

      {/* Final CTA band */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <FadeIn>
          <div
            className={cn(
              'rounded-2xl border border-border bg-accent/5 px-6 py-12 sm:px-12 sm:py-16',
              'flex flex-col items-start gap-6 sm:items-center sm:text-center',
            )}
          >
            <div className="max-w-xl space-y-3">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
                Let&apos;s build together
              </h2>
              <p className="text-sm sm:text-base text-muted leading-relaxed text-pretty">
                Tell us about your restaurants, cafes, and clients. We&apos;ll get
                you set up and growing on Sangam.
              </p>
            </div>
            <a
              href="mailto:partners@sangam.in"
              className={buttonClasses({ variant: 'primary', size: 'lg' })}
            >
              Become a partner
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </FadeIn>
      </section>
    </>
  );
}
