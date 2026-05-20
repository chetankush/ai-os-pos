'use client';

import type { SettleFinding, SettleReport } from '@sangam/types';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  MessageCircle,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
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

// Severity is conveyed by icon + text label + token color (never color alone).
const SEVERITY: Record<
  SettleFinding['severity'],
  { label: string; icon: typeof AlertOctagon; chip: string; ring: string }
> = {
  high: {
    label: 'High',
    icon: AlertOctagon,
    chip: 'bg-danger/10 text-danger border-danger/25',
    ring: 'text-danger',
  },
  medium: {
    label: 'Review',
    icon: AlertTriangle,
    chip: 'bg-fg/[0.06] text-fg/80 border-border-strong',
    ring: 'text-fg/70',
  },
  low: {
    label: 'Info',
    icon: Info,
    chip: 'bg-subtle text-muted border-border',
    ring: 'text-muted',
  },
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
  // Field-level errors so messages sit next to the input that caused them.
  const [grossError, setGrossError] = useState<string | null>(null);
  const [deductionsError, setDeductionsError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [report, setReport] = useState<SettleReport | null>(null);

  const grossRef = useRef<HTMLInputElement>(null);
  const deductionsRef = useRef<HTMLTextAreaElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const dedId = useId();
  const dedHintId = `${dedId}-hint`;
  const dedErrId = `${dedId}-err`;

  // Live count of valid "label,amount" lines for inline feedback.
  const dedLineCount = deductions
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes(',')).length;

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setGrossError(null);
    setDeductionsError(null);

    const gross = Number(grossSales);
    if (!Number.isFinite(gross) || gross <= 0) {
      setGrossError('Enter the gross sales for the period in ₹ (e.g. 100000).');
      grossRef.current?.focus();
      return;
    }
    if (!deductions.trim()) {
      setDeductionsError(
        'Paste the deduction lines from the statement — one per line as label,amount.',
      );
      deductionsRef.current?.focus();
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
      // Bring the result into view on small screens where it lands below the form.
      requestAnimationFrame(() => {
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setSubmitting(false);
    }
  }

  function copySummary() {
    if (!report) return;
    navigator.clipboard.writeText(report.whatsappSummary);
    toast.success('Message copied to clipboard');
  }

  function sendWhatsapp() {
    if (!report) return;
    const num = cafePhone.replace(/\D/g, '');
    const base = num ? `https://wa.me/91${num}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(report.whatsappSummary)}`, '_blank');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ─── Input form ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Statement</CardTitle>
        </CardHeader>
        <CardBody className="pt-0">
          <form onSubmit={handleAnalyze} className="space-y-6" noValidate>
            {/* Platform — accessible segmented control (radiogroup) */}
            <fieldset>
              <legend className="block text-sm font-medium text-fg/90 tracking-wider mb-1.5">
                Platform
              </legend>
              <div role="radiogroup" aria-label="Statement platform" className="flex gap-2">
                {(['zomato', 'swiggy'] as const).map((p) => {
                  const selected = platform === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPlatform(p)}
                      className={cn(
                        'flex-1 min-h-11 rounded-lg border text-sm font-medium capitalize',
                        'transition-colors touch-manipulation',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                        selected
                          ? 'border-fg bg-subtle text-fg'
                          : 'border-border text-muted hover:border-border-strong hover:text-fg',
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Period — grouped statement metadata */}
            <fieldset className="space-y-3">
              <legend className="block text-sm font-medium text-fg/90 tracking-wider">
                Period &amp; volume
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period start" hint="Optional" htmlFor="ps">
                  <Input
                    id="ps"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </Field>
                <Field label="Period end" hint="Optional" htmlFor="pe">
                  <Input
                    id="pe"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Orders" hint="Optional" htmlFor="oc">
                  <Input
                    id="oc"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="100"
                    value={orderCount}
                    onChange={(e) => setOrderCount(e.target.value)}
                  />
                </Field>
                <Field
                  label={
                    <>
                      Gross sales (₹)
                      <span className="text-danger" aria-hidden="true">
                        {' '}
                        *
                      </span>
                    </>
                  }
                  htmlFor="gs"
                  error={grossError}
                  hint={grossError ? undefined : 'Required'}
                >
                  <Input
                    id="gs"
                    ref={grossRef}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="100000"
                    value={grossSales}
                    onChange={(e) => {
                      setGrossSales(e.target.value);
                      if (grossError) setGrossError(null);
                    }}
                    required
                    aria-required="true"
                    aria-invalid={grossError ? true : undefined}
                  />
                </Field>
              </div>
            </fieldset>

            <Field
              label="Your contracted commission %"
              hint="Optional — lets us flag overcharges above your rate"
              htmlFor="cr"
            >
              <Input
                id="cr"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                placeholder="22"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
              />
            </Field>

            {/* Deduction lines — the core input */}
            <div className="space-y-1.5">
              <div className="flex items-end justify-between gap-2">
                <label
                  htmlFor={dedId}
                  className="block text-sm font-medium text-fg/90 tracking-wider"
                >
                  Deduction lines
                  <span className="text-danger" aria-hidden="true">
                    {' '}
                    *
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setDeductions(SAMPLE);
                    if (deductionsError) setDeductionsError(null);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 -mr-1.5 -mb-1.5 px-2 min-h-9 rounded-md',
                    'text-xs font-medium text-muted',
                    'hover:text-fg hover:bg-subtle transition-colors touch-manipulation',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  )}
                >
                  <WandSparkles className="size-3.5" aria-hidden="true" />
                  Fill sample
                </button>
              </div>
              <textarea
                id={dedId}
                ref={deductionsRef}
                value={deductions}
                onChange={(e) => {
                  setDeductions(e.target.value);
                  if (deductionsError) setDeductionsError(null);
                }}
                rows={8}
                placeholder={SAMPLE}
                spellCheck={false}
                aria-required="true"
                aria-invalid={deductionsError ? true : undefined}
                aria-describedby={deductionsError ? dedErrId : dedHintId}
                className={cn(
                  'w-full rounded-lg border bg-bg px-3.5 py-2.5',
                  'text-base font-mono leading-relaxed tabular-nums',
                  'shadow-sm shadow-black/[0.02] placeholder:text-muted/60',
                  'transition-all duration-150 touch-manipulation',
                  'hover:border-border-strong',
                  'focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg',
                  deductionsError
                    ? 'border-danger focus:border-danger'
                    : 'border-border focus:border-fg',
                )}
              />
              {deductionsError ? (
                <p id={dedErrId} className="text-xs text-danger" role="alert">
                  {deductionsError}
                </p>
              ) : (
                <p id={dedHintId} className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>One per line: label,amount — paste from the statement</span>
                  {dedLineCount > 0 && (
                    <span className="shrink-0 tabular-nums text-fg/70">
                      {dedLineCount} {dedLineCount === 1 ? 'line' : 'lines'}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Consent — group with shared legend; affects which charges get flagged */}
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-fg/90 tracking-wider mb-1">
                What did you approve?
              </legend>
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
            </fieldset>

            {formError && (
              <p
                className="flex items-start gap-2 text-xs text-danger px-3 py-2.5 rounded-lg border border-danger/25 bg-danger/[0.06]"
                role="alert"
              >
                <AlertTriangle className="size-4 shrink-0 mt-px" aria-hidden="true" />
                <span>{formError}</span>
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {!submitting && <Sparkles className="size-4" aria-hidden="true" />}
              {submitting ? 'Analyzing statement…' : 'Find disputable money'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* ─── Report ─────────────────────────────────────────────────────── */}
      <div ref={reportRef} className="space-y-4 lg:sticky lg:top-6">
        {!report ? (
          <Card className="p-12 text-center border-dashed grid place-items-center min-h-[20rem]">
            <div>
              <div className="mx-auto size-12 rounded-xl bg-subtle border border-border grid place-items-center">
                <Info className="size-5 text-muted" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-sm font-semibold">No audit yet</h2>
              <p className="mt-1 text-sm text-muted max-w-xs mx-auto leading-relaxed">
                Fill the statement and run the audit — the disputable total and a
                WhatsApp-ready message appear here.
              </p>
            </div>
          </Card>
        ) : (
          <Stagger className="space-y-4">
            {/* Hero — disputable headline */}
            <StaggerItem>
              <Card className="overflow-hidden p-6">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
                  <AlertOctagon className="size-3.5 text-danger" aria-hidden="true" />
                  Looks disputable
                </p>
                <p className="mt-1 text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-danger">
                  {rupees(report.disputablePaise)}
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  {report.disputablePaise > 0
                    ? `Across ${report.findings.filter((f) => f.disputable).length} flagged ${
                        report.findings.filter((f) => f.disputable).length === 1
                          ? 'charge'
                          : 'charges'
                      } on ${report.platform}`
                    : `Nothing looks disputable on ${report.platform} this period`}
                </p>
                <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
                  <Stat label="Take rate" value={`${report.effectiveTakeRatePct}%`} />
                  <Stat label="Deducted" value={rupees(report.totalDeductionsPaise)} />
                  <Stat label="Net paid" value={rupees(report.netPayoutPaise)} />
                </div>
              </Card>
            </StaggerItem>

            {/* Findings */}
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>
                    Findings
                    {report.findings.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                        {report.findings.length}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  {report.findings.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-success/[0.06] px-3 py-3">
                      <CheckCircle2
                        className="size-5 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      <p className="text-sm text-fg/80">
                        No issues flagged this period — the deductions look clean.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border -my-1">
                      {report.findings.map((f) => (
                        <FindingRow key={f.code} finding={f} />
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </StaggerItem>

            {/* WhatsApp message — the payoff */}
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="size-4 text-muted" aria-hidden="true" />
                    WhatsApp message
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0 space-y-3">
                  <pre className="whitespace-pre-wrap rounded-lg border border-border bg-subtle/50 p-3.5 text-xs leading-relaxed font-sans text-fg/90">
                    {report.whatsappSummary}
                  </pre>
                  <Field
                    label="Cafe WhatsApp number"
                    hint="Optional — 10 digits, India"
                    htmlFor="ph"
                  >
                    <Input
                      id="ph"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="98765 43210"
                      value={cafePhone}
                      onChange={(e) => setCafePhone(e.target.value)}
                    />
                  </Field>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" onClick={sendWhatsapp} className="flex-1">
                      <MessageCircle className="size-4" aria-hidden="true" />
                      Send on WhatsApp
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={copySummary}
                      aria-label="Copy message to clipboard"
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      Copy
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </StaggerItem>
          </Stagger>
        )}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: SettleFinding }) {
  const meta = SEVERITY[finding.severity];
  const Icon = meta.icon;
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          'mt-0.5 inline-flex items-center justify-center size-7 shrink-0 rounded-full border',
          meta.chip,
        )}
      >
        <Icon className={cn('size-3.5', meta.ring)} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{finding.title}</p>
          {finding.amountPaise > 0 && (
            <span className="text-sm font-mono tabular-nums shrink-0 text-fg/90">
              {rupees(finding.amountPaise)}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              meta.chip,
            )}
          >
            {meta.label}
          </span>
          {finding.disputable && (
            <span className="inline-flex items-center rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              Disputable
            </span>
          )}
        </div>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">{finding.detail}</p>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-subtle/50 py-2.5 px-1">
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
      className={cn(
        'w-full flex items-start gap-3 text-left p-3 min-h-11 rounded-lg border',
        'transition-colors touch-manipulation',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        checked
          ? 'border-border-strong bg-subtle/50'
          : 'border-border hover:border-border-strong',
      )}
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
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted mt-0.5 leading-relaxed">{hint}</span>
      </span>
    </button>
  );
}
