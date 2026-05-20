import Link from 'next/link';
import { FadeIn } from '@/components/ui/motion';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Left: form */}
      <main className="flex flex-col items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          <FadeIn>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <span className="size-6 rounded-md bg-accent text-accent-fg grid place-items-center text-[11px] font-bold">
                M
              </span>
              Mehfil
            </Link>
          </FadeIn>
          <FadeIn delay={0.05}>{children}</FadeIn>
        </div>
      </main>

      {/* Right: marketing aside, hidden on mobile */}
      <aside className="hidden lg:flex flex-col justify-between border-l border-border bg-subtle/40 p-12">
        <FadeIn delay={0.1}>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            RestaurantOS
          </p>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="space-y-4 max-w-md">
            <h2 className="text-3xl font-semibold tracking-tight leading-tight">
              The POS your cafe deserves.
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              Built for Indian cafes and restaurants. Flat pricing, no
              commissions. AI waiter that lifts average order value by 15%.
            </p>
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            <span>All systems normal</span>
          </div>
        </FadeIn>
      </aside>
    </div>
  );
}
