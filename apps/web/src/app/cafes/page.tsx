import type { CafesListResponse } from '@mehfil/types';
import Link from 'next/link';
import { ArrowRight, Plus, Store } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { serverFetch } from '@/lib/api-server';

export const metadata = { title: 'Your cafes · Mehfil' };

export default async function CafesPage() {
  const { cafes } = await serverFetch<CafesListResponse>('/cafes');

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Your cafes</h1>
        </div>
        <Link href="/cafes/new" className={buttonClasses()}>
          <Plus className="size-4" />
          New cafe
        </Link>
      </div>

      {cafes.length === 0 ? (
        <EmptyState />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cafes.map((cafe) => (
            <StaggerItem key={cafe.id}>
              <Link href={`/cafes/${cafe.id}`} className="group block h-full">
                <Card className="h-full p-5 hover:border-border-strong transition-all hover:-translate-y-0.5 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="size-10 rounded-md bg-subtle border border-border grid place-items-center">
                      <Store className="size-4 text-muted" />
                    </div>
                    <ArrowRight className="size-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-4px] group-hover:translate-x-0" />
                  </div>

                  <div className="mt-4 space-y-1">
                    <h3 className="font-medium tracking-tight">{cafe.name}</h3>
                    <p className="text-xs text-muted">
                      {cafe.city}, {cafe.state} · {cafe.pincode}
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-[11px] text-muted">
                    <span className="font-mono">/{cafe.slug}</span>
                    <span>·</span>
                    <span>
                      {cafe.isAirConditioned ? '18% GST' : '5% GST'}
                    </span>
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-12 text-center border-dashed">
      <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
        <Store className="size-5 text-muted" />
      </div>
      <h3 className="mt-4 font-medium">No cafes yet</h3>
      <p className="mt-1 text-sm text-muted">
        Create your first cafe to start managing menu, orders, and billing.
      </p>
      <div className="mt-6">
        <Link href="/cafes/new" className={buttonClasses()}>
          <Plus className="size-4" />
          Create your first cafe
        </Link>
      </div>
    </Card>
  );
}
