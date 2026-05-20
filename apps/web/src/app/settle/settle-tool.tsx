'use client';

import type { SettleReport } from '@mehfil/types';
import { AlertTriangle, Copy, Info, MessageCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SAMPLE = `Base service fee,22000
Payment mechanism fee,2500
Ads - promo,5000
Restaurant discount [Flat offs, Freebies, Gold],3000
Customer compensation/recoupment,1500
Tax collected at source (TCS),245
TDS 194O,245`;

function rupees(paise: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  )}`;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-900 border-red-200',
  medium: 'bg-amber-100 text-amber-900 border-amber-200',
  low: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

export function SettleTool() {
  const [platform, setPlatform] = useState<'zomato' | 'swiggy'>('zomato');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [orderCount, setOrderCount] = useState('');
  const [grossSales, setGrossSales] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [adsConsented, setAdsConsented] = useState(false);
  const [discountsApproved, setDiscountsApproved] = useState(false);
  const [deductions, setDeductions] = useState('');
  const [cafePhone, setCafePhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SettleReport | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const gross = Number(grossSales);
    if (!Number.isFinite(gross) || gross <= 0) {
      setError('Enter the gross sales for the period (₹).');
      return;
    }
    if (!deductions.trim()) {
      setError('Paste the deduction lines from the statement.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${API_URL}/settle/analyze`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          platform,
          periodStart: periodStart || 'this period',
          periodEnd: periodEnd || '',
          orderCount: Number(orderCount) || 0,
          grossSalesRupees: gross,
          deductionsCsv: deductions,
          config: {
            ...(commissionRate
              ? { contractedCommissionRatePct: Number(commissionRate) }
              : {}),
            adsConsented,
            discountsApproved,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      const { report: r } = (await res.json()) as { report: SettleReport };
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setSubmitting(false);
    }
  }

  function copySummary() {
    if (!report) return;
    navigator.clipboard.writeText(report.whatsappSummary);
    toast.success('Summary copied');
  }

  function sendWhatsapp() {
    if (!report) return;
    const num = cafePhone.replace(/\D/g, '');
    const base = num ? `https://wa.me/91${num}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(report.whatsappSummary)}`, '_blank');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ─── Input form ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Statement</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="flex gap-2">
              {(['zomato', 'swiggy'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'flex-1 h-10 rounded-lg border text-sm font-medium capitalize transition-colors',
                    platform === p
                      ? 'border-fg bg-subtle text-fg'
                      : 'border-border text-muted hover:border-border-strong',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Period start" hint="Optional" htmlFor="ps">
                <Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </Field>
              <Field label="Period end" hint="Optional" htmlFor="pe">
                <Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Orders" hint="Optional" htmlFor="oc">
                <Input id="oc" type="number" inputMode="numeric" min="0" placeholder="100" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
              </Field>
              <Field label="Gross sales (₹)" htmlFor="gs">
                <Input id="gs" type="number" inputMode="decimal" min="0" placeholder="100000" value={grossSales} onChange={(e) => setGrossSales(e.target.value)} required />
              </Field>
            </div>

            <Field
              label="Your contracted commission %"
              hint="Optional — lets us flag overcharges"
              htmlFor="cr"
            >
              <Input id="cr" type="number" inputMode="decimal" min="0" max="100" placeholder="22" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
            </Field>

            <Field
              label="Deduction lines"
              hint="One per line: label,amount (paste from the statement)"
              htmlFor="ded"
            >
              <textarea
                id="ded"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                rows={8}
                placeholder={SAMPLE}
                className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm font-mono shadow-sm shadow-black/[0.02] placeholder:text-muted/70 transition-all hover:border-border-strong focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg"
              />
            </Field>
            <button
              type="button"
              onClick={() => setDeductions(SAMPLE)}
              className="text-xs text-muted hover:text-fg transition-colors"
            >
              Fill sample data
            </button>

            <div className="space-y-2 pt-1">
              <Toggle
                checked={adsConsented}
                onChange={setAdsConsented}
                label="I approved all ads this period"
                hint="Off → ad charges get flagged as disputable"
              />
              <Toggle
                checked={discountsApproved}
                onChange={setDiscountsApproved}
                label="I approved all discounts this period"
                hint="Off → restaurant-funded discounts flagged for review"
              />
            </div>

            {error && (
              <p className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              <Sparkles className="size-4" />
              {submitting ? 'Analyzing' : 'Find disputable money'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* ─── Report ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {!report ? (
          <Card className="p-12 text-center border-dashed h-full grid place-items-center">
            <div>
              <div className="mx-auto size-12 rounded-lg bg-subtle border border-border grid place-items-center">
                <Info className="size-5 text-muted" />
              </div>
              <p className="mt-4 text-sm text-muted max-w-xs mx-auto">
                Fill the statement and run the audit — the disputable total and a
                WhatsApp-ready message appear here.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-6">
              <p className="text-xs uppercase tracking-wider text-muted">
                Looks disputable
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-danger">
                {rupees(report.disputablePaise)}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Stat label="Take rate" value={`${report.effectiveTakeRatePct}%`} />
                <Stat label="Deducted" value={rupees(report.totalDeductionsPaise)} />
                <Stat label="Net paid" value={rupees(report.netPayoutPaise)} />
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
              </CardHeader>
              <CardBody className="pt-0 space-y-3">
                {report.findings.length === 0 && (
                  <p className="text-sm text-muted">No issues flagged this period.</p>
                )}
                {report.findings.map((f) => (
                  <div key={f.code} className="flex gap-3">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex items-center justify-center size-6 shrink-0 rounded-full border',
                        SEVERITY_STYLES[f.severity],
                      )}
                    >
                      {f.severity === 'high' ? (
                        <AlertTriangle className="size-3" />
                      ) : (
                        <Info className="size-3" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{f.title}</p>
                        {f.amountPaise > 0 && (
                          <span className="text-sm font-mono tabular-nums shrink-0">
                            {rupees(f.amountPaise)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">{f.detail}</p>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WhatsApp message</CardTitle>
              </CardHeader>
              <CardBody className="pt-0 space-y-3">
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-subtle/40 p-3 text-xs leading-relaxed font-sans">
                  {report.whatsappSummary}
                </pre>
                <Field label="Cafe WhatsApp number" hint="Optional — 10 digits, India" htmlFor="ph">
                  <Input id="ph" type="tel" inputMode="tel" placeholder="98765 43210" value={cafePhone} onChange={(e) => setCafePhone(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button type="button" onClick={sendWhatsapp} className="flex-1">
                    <MessageCircle className="size-4" />
                    Send on WhatsApp
                  </Button>
                  <Button type="button" variant="secondary" onClick={copySummary}>
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-subtle/40 py-2">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted mt-0.5">{label}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left p-3 rounded-lg border border-border hover:border-border-strong transition-colors"
    >
      <span
        className={cn(
          'mt-0.5 relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 bg-bg rounded-full shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted mt-0.5">{hint}</span>
      </span>
    </button>
  );
}
