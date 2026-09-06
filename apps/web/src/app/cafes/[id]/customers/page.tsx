import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, CustomerListResponse } from '@sangam/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomersList } from './customers-list';

export const metadata = { title: 'Customers · Sangam' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomersPage({ params }: PageProps) {
  const { id } = await params;

  let cafeRes: CafeResponse;
  let customersRes: CustomerListResponse;
  try {
    [cafeRes, customersRes] = await Promise.all([
      serverFetch<CafeResponse>(`/cafes/${id}`),
      serverFetch<CustomerListResponse>(`/cafes/${id}/customers`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const cafe = cafeRes.cafe;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link
          href={`/cafes/${cafe.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Customers</p>
          <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
          <p className="text-sm text-muted">
            Everyone who's ordered, with lifetime spend and last visit. The foundation for loyalty.
          </p>
        </div>
      </div>

      <CustomersList cafeId={cafe.id} initialCustomers={customersRes.customers} />
    </div>
  );
}
