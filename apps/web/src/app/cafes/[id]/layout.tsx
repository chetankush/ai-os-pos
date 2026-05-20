import type { CafeResponse } from '@sangam/types';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CafeShell } from './components/cafe-shell';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function CafeWorkspaceLayout({ children, params }: LayoutProps) {
  const { id } = await params;

  let cafeName = 'Cafe';
  try {
    const res = await serverFetch<CafeResponse>(`/cafes/${id}`);
    cafeName = res.cafe.name;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CafeShell cafeId={id} cafeName={cafeName} userEmail={user?.email ?? ''}>
      {children}
    </CafeShell>
  );
}
