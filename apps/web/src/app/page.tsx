'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(status === 'authenticated' ? '/cafes' : '/login');
  }, [status, router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm opacity-60">Loading…</p>
    </main>
  );
}
