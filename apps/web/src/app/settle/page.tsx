import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FadeIn } from '@/components/ui/motion';
import { SettleTool } from './settle-tool';

export const metadata = { title: 'Settle · Mehfil' };

export default function SettlePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            href="/cafes"
            className="inline-flex items-center gap-2 rounded-md py-1 -mx-1 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <span className="size-6 rounded-md bg-accent text-accent-fg grid place-items-center text-[11px] font-bold">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Mehfil <span className="text-muted font-normal">Settle</span>
            </span>
          </Link>
          <Link
            href="/cafes"
            className="inline-flex items-center gap-1.5 min-h-11 px-2 -mr-2 rounded-md text-xs text-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10">
        <FadeIn className="space-y-1.5 mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Aggregator audit
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Find what Zomato &amp; Swiggy overcharged
          </h1>
          <p className="text-sm text-muted max-w-2xl leading-relaxed text-pretty">
            Paste a settlement statement&apos;s deduction lines. We flag the
            disputable money — unauthorized ads, discounts you didn&apos;t
            approve, commission above your rate, and refunds wrongly charged to
            you — and draft a WhatsApp message you can send the cafe.
          </p>
        </FadeIn>

        <FadeIn delay={0.08}>
          <SettleTool />
        </FadeIn>
      </main>
    </div>
  );
}
