'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface TablesToolProps {
  cafeSlug: string;
  cafeName: string;
}

const storageKey = (slug: string) => `sangam:tables:${slug}`;

/** Build the canonical, de-duplicated table list from the two inputs. */
function buildLabels(count: number, custom: string): string[] {
  const generated = Array.from({ length: Math.max(0, count) }, (_, i) => `T${i + 1}`);
  const customLabels = custom
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const label of [...generated, ...customLabels]) {
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function TablesTool({ cafeSlug, cafeName }: TablesToolProps) {
  // origin is null on the server / first render to avoid SSR hydration mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  const [count, setCount] = useState(8);
  const [custom, setCustom] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // On mount: read origin + restore any saved table list for this cafe.
  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const raw = window.localStorage.getItem(storageKey(cafeSlug));
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        if (Array.isArray(saved)) setLabels(saved.filter((x) => typeof x === 'string'));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [cafeSlug]);

  // Persist the table list whenever it changes (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey(cafeSlug), JSON.stringify(labels));
    } catch {
      /* storage unavailable */
    }
  }, [labels, cafeSlug, hydrated]);

  const preview = useMemo(() => buildLabels(count, custom), [count, custom]);

  function generate() {
    setLabels(buildLabels(count, custom));
  }

  function urlFor(label: string): string {
    return `${origin ?? ''}/m/${cafeSlug}?table=${encodeURIComponent(label)}`;
  }

  return (
    <div className="space-y-8">
      {/* Only background reset needed for print — the print:hidden / print:grid
          utilities below handle showing just the QR grid. */}
      <style>{`@media print { body { background: #fff; } }`}</style>

      {/* ─── Definition controls ─────────────────────────────────────────── */}
      <Card className="p-6 print:hidden">
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="How many tables?"
              htmlFor="table-count"
              hint="Generates T1 … TN"
            >
              <Input
                id="table-count"
                type="number"
                min={0}
                max={200}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(0, Math.min(200, Number(e.target.value) || 0)))
                }
              />
            </Field>
            <Field
              label="Custom labels (optional)"
              htmlFor="table-custom"
              hint="Comma-separated, e.g. Patio 1, Counter, T5"
            >
              <Input
                id="table-custom"
                type="text"
                placeholder="Patio 1, Counter, T5"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="primary" onClick={generate}>
              Generate {preview.length} {preview.length === 1 ? 'table' : 'tables'}
            </Button>
            {labels.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.print()}
              >
                <Printer className="size-4" />
                Print all QR codes
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Print these, laminate, and place one on each table. Guests scan to see
            the menu and order to their table.
          </p>
        </div>
      </Card>

      {/* ─── QR grid (only this prints) ──────────────────────────────────── */}
      {labels.length === 0 ? (
        <p className="text-sm text-muted text-center py-10 print:hidden">
          No tables yet — set a number above and hit Generate.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid print:grid-cols-3 print:gap-4">
          {labels.map((label) => (
            <Card
              key={label}
              className="p-5 flex flex-col items-center gap-3 text-center print:break-inside-avoid print:shadow-none"
            >
              <p className="text-xs uppercase tracking-wider text-muted font-medium">
                {cafeName}
              </p>
              <p className="text-lg font-semibold tracking-tight">{label}</p>
              <div className="rounded-lg bg-white p-2">
                {origin ? (
                  <QRCodeCanvas value={urlFor(label)} size={160} includeMargin />
                ) : (
                  // Placeholder keeps layout stable until origin is known on mount.
                  <div className="size-[160px]" aria-hidden="true" />
                )}
              </div>
              <p className="text-[11px] text-muted">Scan to order</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
