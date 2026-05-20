'use client';

import type { Cafe } from '@cafespace/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiError, getCafe } from '@/lib/api';

export default function CafeDetailPage() {
  const params = useParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const token = getAccessToken();
    if (!token || !params.id) return;

    getCafe(token, params.id, controller.signal)
      .then((data) => setCafe(data.cafe))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('Cafe not found.');
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load cafe.');
        }
      });

    return () => controller.abort();
  }, [getAccessToken, params.id]);

  return (
    <div className="space-y-6">
      <Link href="/cafes" className="text-sm opacity-60 hover:opacity-100">
        ← Back to cafes
      </Link>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {!cafe && !error && <p className="text-sm opacity-60">Loading…</p>}

      {cafe && (
        <div className="space-y-6">
          <header>
            <h1 className="text-2xl font-semibold">{cafe.name}</h1>
            <p className="text-sm opacity-60 mt-1">cafespace.in/{cafe.slug}</p>
          </header>

          <DetailRow label="Address">
            {cafe.addressLine1}
            {cafe.addressLine2 ? `, ${cafe.addressLine2}` : ''}
            <br />
            {cafe.city}, {cafe.state} {cafe.pincode}
          </DetailRow>

          <DetailRow label="GST slab">
            {cafe.isAirConditioned ? '18% (air-conditioned)' : '5% (non-AC)'}
          </DetailRow>

          {cafe.gstin && <DetailRow label="GSTIN">{cafe.gstin}</DetailRow>}
          {cafe.fssai && <DetailRow label="FSSAI">{cafe.fssai}</DetailRow>}

          <DetailRow label="Created">
            {new Date(cafe.createdAt).toLocaleString('en-IN')}
          </DetailRow>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-baseline">
      <dt className="text-xs uppercase opacity-50">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
