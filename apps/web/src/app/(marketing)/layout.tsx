import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { TriquetraMark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const NAV = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/partners', label: 'Partner with us' },
  { href: '/about', label: 'About' },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col font-display">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <TriquetraMark className="size-7 shrink-0 text-accent" />
            <span className="text-base font-semibold tracking-tight">Sangam</span>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className={buttonClasses({ variant: 'primary', size: 'sm' })}
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xs space-y-3">
              <Link href="/pricing" className="inline-flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-fg">
                  S
                </span>
                <span className="text-base font-semibold tracking-tight">
                  Sangam
                </span>
              </Link>
              <p className="text-sm leading-relaxed text-muted">
                The AI-native POS built for Indian restaurants, cafes & cloud
                kitchens — affordable, fast, and your data stays yours.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 text-sm">
              <FooterCol title="Product">
                <FooterLink href="/pricing">Pricing</FooterLink>
                <FooterLink href="/partners">Partner with us</FooterLink>
              </FooterCol>
              <FooterCol title="Company">
                <FooterLink href="/about">About</FooterLink>
                <FooterLink href="/login">Sign in</FooterLink>
              </FooterCol>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} Sangam · Built for Indian restaurants
              & cafes
            </span>
            <span className="font-mono">v0.0.1</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="text-muted transition-colors hover:text-fg">
        {children}
      </Link>
    </li>
  );
}
