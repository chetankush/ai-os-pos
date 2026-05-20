import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <Link href="/cafes" className="inline-flex items-center gap-2">
            <span className="size-6 rounded-md bg-accent text-accent-fg grid place-items-center text-[11px] font-bold">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Mehfil
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-xs text-muted">
              {user.email}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between text-xs text-muted">
          <span>© {new Date().getFullYear()} Mehfil</span>
          <span className="font-mono">v0.0.1</span>
        </div>
      </footer>
    </div>
  );
}
