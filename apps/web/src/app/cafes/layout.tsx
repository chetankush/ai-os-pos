'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

export default function CafesLayout({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-60">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <Link href="/cafes" className="text-sm font-semibold">
            Cafespace
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-60">{user?.email}</span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.replace('/login');
              }}
              className="underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
