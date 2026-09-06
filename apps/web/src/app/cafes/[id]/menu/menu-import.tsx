'use client';

import { Button, buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { MenuImportError, MenuImportResponse } from '@sangam/types';
import { Download, FileUp, Upload, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseMenuCsv } from './csv';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SAMPLE_CSV = [
  'category,name,price,description,veg,spice',
  'Beverages,Masala Chai,40,Spiced milk tea,yes,1',
  'Beverages,Cold Coffee,120,Iced coffee with cream,yes,0',
  'Starters,Paneer Tikka,260,Smoky grilled cottage cheese,yes,2',
  'Starters,Chicken 65,290,Spicy deep-fried chicken,no,3',
  'Mains,"Rajma, Chawal",220,"Kidney bean curry, rice & salad",yes,1',
  'Desserts,Gulab Jamun,90,Two pieces in warm syrup,yes,0',
].join('\n');

async function importCsv(
  cafeId: string,
  csv: string,
  accessToken: string | null,
): Promise<MenuImportResponse> {
  const res = await fetch(`${API_URL}/cafes/${cafeId}/menu/import`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ csv }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Import failed (${res.status})`);
  }
  return res.json();
}

interface Props {
  cafeId: string;
  /** Resolves the current Supabase bearer token (or null). */
  getAccessToken: () => Promise<string | null>;
  /** Called after a successful import so the editor can refetch the menu. */
  onImported: () => void;
}

export function MenuImport({ cafeId, getAccessToken, onImported }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FileUp className="size-3.5" />
        Bulk import
      </Button>
      {open && (
        <ImportDialog
          cafeId={cafeId}
          getAccessToken={getAccessToken}
          onClose={() => setOpen(false)}
          onImported={() => {
            onImported();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ImportDialog({
  cafeId,
  getAccessToken,
  onClose,
  onImported,
}: {
  cafeId: string;
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const textareaId = useId();

  // Close on Escape, and lock body scroll while the dialog is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, submitting]);

  // Live preview using the same parsing rules the server applies.
  const preview = useMemo(() => (csv.trim() ? parseMenuCsv(csv) : null), [csv]);

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sangam-menu-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    e.target.value = '';
  }

  async function handleImport() {
    setError(null);
    if (!csv.trim()) {
      setError('Paste some CSV or choose a file first.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const result = await importCsv(cafeId, csv, token);

      if (result.itemsCreated > 0) {
        const parts = [`${result.itemsCreated} item${result.itemsCreated === 1 ? '' : 's'}`];
        if (result.categoriesCreated > 0) {
          parts.push(
            `${result.categoriesCreated} new categor${result.categoriesCreated === 1 ? 'y' : 'ies'}`,
          );
        }
        toast.success(`Imported ${parts.join(', ')}`);
      }
      if (result.skipped > 0) {
        toast.error(
          `${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped — fix and re-import.`,
        );
      }

      if (result.itemsCreated > 0) {
        onImported();
        return;
      }
      // Nothing created — keep the dialog open and show why.
      setError(
        result.errors.length > 0
          ? result.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n')
          : 'Nothing was imported.',
      );
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled at document level */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in"
        onClick={() => !submitting && onClose()}
        aria-hidden
      />
      {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer/backdrop behavior differs; this matches the app's existing modal pattern */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-2xl',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          '-translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-border bg-bg p-6 shadow-lg shadow-black/10',
          'animate-in fade-in zoom-in-95',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              Bulk import menu
            </h2>
            <p className="mt-1.5 text-sm text-muted leading-relaxed">
              Paste or upload a CSV to add many items at once. New categories are created
              automatically; existing ones are reused.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="grid place-items-center size-9 -mr-2 -mt-1 shrink-0 rounded-md text-muted hover:text-fg hover:bg-subtle transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-border bg-subtle/40 p-3">
            <p className="text-xs text-muted leading-relaxed">
              <span className="font-medium text-fg">Columns:</span>{' '}
              <code className="font-mono">category</code>, <code className="font-mono">name</code>,{' '}
              <code className="font-mono">price</code> (in rupees), and optionally{' '}
              <code className="font-mono">description</code>, <code className="font-mono">veg</code>{' '}
              (yes/no), <code className="font-mono">spice</code> (0–3). The first row must be the
              header.
            </p>
            <button
              type="button"
              onClick={downloadSample}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              <Download className="size-3.5" />
              Download sample CSV
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={textareaId} className="text-xs font-medium text-fg">
                Paste CSV
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
              >
                <Upload className="size-3.5" />
                Upload .csv
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="sr-only"
                aria-label="Upload CSV file"
              />
            </div>
            <textarea
              id={textareaId}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'category,name,price,veg,spice\nBeverages,Tea,40,yes,0'}
              className={cn(
                'w-full rounded-lg border border-border bg-bg px-3 py-2',
                'font-mono text-xs leading-relaxed',
                'placeholder:text-muted/60 resize-y',
                'focus:outline-none focus:ring-2 focus:ring-fg focus:border-transparent',
              )}
            />
          </div>

          {preview && <ImportPreview rows={preview.rows} errors={preview.errors} />}

          {error && (
            <p className="text-xs text-danger whitespace-pre-wrap" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
            >
              Cancel
            </button>
            <Button
              size="sm"
              loading={submitting}
              disabled={!preview || preview.rows.length === 0}
              onClick={handleImport}
            >
              {submitting
                ? 'Importing'
                : preview && preview.rows.length > 0
                  ? `Import ${preview.rows.length} item${preview.rows.length === 1 ? '' : 's'}`
                  : 'Import'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({
  rows,
  errors,
}: {
  rows: ReturnType<typeof parseMenuCsv>['rows'];
  errors: MenuImportError[];
}) {
  if (rows.length === 0 && errors.length === 0) return null;

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-xs font-medium text-danger">
            {errors.length} row{errors.length === 1 ? '' : 's'} have problems and will be skipped:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {errors.slice(0, 8).map((e) => (
              <li key={`${e.line}-${e.message}`} className="text-xs text-danger">
                Line {e.line}: {e.message}
              </li>
            ))}
            {errors.length > 8 && (
              <li className="text-xs text-danger/70">…and {errors.length - 8} more</li>
            )}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-subtle/40">
            <p className="text-xs font-medium text-fg">
              Preview · {rows.length} item{rows.length === 1 ? '' : 's'} ready
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg">
                <tr className="text-left text-muted">
                  <th className="px-3 py-1.5 font-medium">Category</th>
                  <th className="px-3 py-1.5 font-medium">Item</th>
                  <th className="px-3 py-1.5 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={`${r.category}-${r.name}-${i}`}>
                    <td className="px-3 py-1.5 text-muted">{r.category}</td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            'size-2.5 rounded-sm border',
                            r.isVegetarian ? 'border-success' : 'border-danger',
                          )}
                        />
                        {r.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                      ₹{(r.pricePaise / 100).toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
