import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { TriquetraMark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { signOutAction } from './actions';

export default async function CafesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-bg focus:px-4 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <Link href="/cafes" className="inline-flex items-center gap-2">
            <TriquetraMark className="size-6 shrink-0 text-accent" />
            <span className="text-sm font-semibold tracking-tight">
              Sangam
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-xs text-muted">
              {user.email}
            </span>
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
