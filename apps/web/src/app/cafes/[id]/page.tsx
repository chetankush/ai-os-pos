import type { CafeResponse } from '@mehfil/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronRight, Receipt, ScrollText, Sparkles } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CafeDetailPage({ params }: PageProps) {
  const { id } = await params;

  let cafe;
  try {
    const data = await serverFetch<CafeResponse>(`/cafes/${id}`);
    cafe = data.cafe;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-8">
      <FadeIn>
        <Link
          href="/cafes"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to cafes
        </Link>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{cafe.name}</h1>
            <p className="text-sm text-muted font-mono">
              mehfil.in/{cafe.slug}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              cafe.isAirConditioned
                ? 'border-border bg-subtle text-fg'
                : 'border-border bg-subtle text-fg'
            }`}
          >
            {cafe.isAirConditioned ? '18% GST · AC' : '5% GST · Non-AC'}
          </span>
        </div>
      </FadeIn>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          href={`/cafes/${cafe.id}/menu`}
          icon={<ScrollText className="size-4" />}
          title="Menu"
          description="Categories, items, prices, availability"
          ready
        />
        <ActionCard
          href="#"
          icon={<Receipt className="size-4" />}
          title="Orders"
          description="Today's orders, KOT, billing"
        />
        <ActionCard
          href="#"
          icon={<Sparkles className="size-4" />}
          title="AI Waiter"
          description="Recommendation engine, upsell rules"
        />
      </Stagger>

      <FadeIn delay={0.1}>
        <Card className="p-6">
          <h3 className="text-xs uppercase tracking-[0.18em] text-muted">
            Cafe info
          </h3>
          <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <Row label="Address">
              {cafe.addressLine1}
              {cafe.addressLine2 ? `, ${cafe.addressLine2}` : ''}
              <br />
              <span className="text-muted">
                {cafe.city}, {cafe.state} {cafe.pincode}
              </span>
            </Row>

            {cafe.gstin && <Row label="GSTIN">{cafe.gstin}</Row>}
            {cafe.fssai && <Row label="FSSAI">{cafe.fssai}</Row>}

            <Row label="Created">
              {new Date(cafe.createdAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </Row>
          </dl>
        </Card>
      </FadeIn>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  ready,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  ready?: boolean;
}) {
  const inner = (
    <Card
      className={`p-5 h-full transition-all ${
        ready
          ? 'hover:border-border-strong hover:-translate-y-0.5 hover:shadow-sm cursor-pointer'
          : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="size-9 rounded-md bg-subtle border border-border grid place-items-center text-muted">
          {icon}
        </div>
        {ready ? (
          <ChevronRight className="size-4 text-muted" />
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium px-2 py-0.5 rounded-full border border-border">
            Soon
          </span>
        )}
      </div>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted leading-relaxed">{description}</p>
    </Card>
  );

  return (
    <StaggerItem>
      {ready ? (
        <Link href={href} className="block h-full">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </StaggerItem>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-wider text-muted font-medium">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
