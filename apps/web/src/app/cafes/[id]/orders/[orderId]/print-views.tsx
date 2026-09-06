'use client';

import { Button } from '@/components/ui/button';
import { amountInWords, billDocumentTitle, compositionDeclaration } from '@/lib/bill-document';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Cafe, OrderItem, OrderPayment, OrderWithItems } from '@sangam/types';
import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';

type Mode = 'kot' | 'bill' | null;

interface PrintViewsProps {
  order: OrderWithItems;
  cafe: Cafe;
  payments?: OrderPayment[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  online: 'Online',
};

/**
 * Tells the API a customer bill is about to be printed and reports whether this
 * copy is a reprint. Called before rendering so the slip can be stamped
 * DUPLICATE — an unmarked second copy of a bill is a cash-skimming vector.
 */
async function markBillPrinted(
  cafeId: string,
  orderId: string,
): Promise<{ printCount: number; isDuplicate: boolean }> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}`.replace(/\/+$/, '') +
      `/cafes/${cafeId}/orders/${orderId}/bill-printed`,
    {
      method: 'POST',
      headers: session ? { authorization: `Bearer ${session.access_token}` } : {},
    },
  );
  if (!res.ok) throw new Error(`Failed to record bill print (${res.status})`);
  return (await res.json()) as { printCount: number; isDuplicate: boolean };
}

export function PrintViews({ order, cafe, payments = [] }: PrintViewsProps) {
  const [mode, setMode] = useState<Mode>(null);
  // A bill that has been printed before must say so on the paper. Seeded from
  // the order so a page reload still knows, then refreshed from the server on
  // each print so two terminals can't both believe they hold the original.
  const [isDuplicate, setIsDuplicate] = useState(order.billPrintCount > 0);

  async function print(next: Exclude<Mode, null>) {
    // The KOT is a kitchen slip, not a financial document — it isn't counted.
    if (next === 'bill') {
      try {
        const res = await markBillPrinted(order.cafeId, order.id);
        setIsDuplicate(res.isDuplicate);
      } catch {
        // Never block the cashier on a bookkeeping call. Fall back to what the
        // loaded order knew; worst case a reprint is unstamped, not unprinted.
      }
    }
    setMode(next);
    // Let React paint the selected ticket before opening the print dialog.
    setTimeout(() => window.print(), 50);
  }

  // Auto-print when the order detail is opened via ?autoprint=kot|bill — used
  // by the counter order-builder to fire-and-forget a kitchen ticket in a new
  // tab the instant an order is placed. The tab closes itself after print so
  // the cashier isn't left with a graveyard of open order tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('autoprint');
    if (auto !== 'kot' && auto !== 'bill') return;

    if (auto === 'bill') {
      void markBillPrinted(order.cafeId, order.id)
        .then((res) => setIsDuplicate(res.isDuplicate))
        .catch(() => undefined);
    }
    setMode(auto);
    const closeAfter = () => {
      // Best-effort: window.close() only works for tabs opened via window.open().
      try {
        window.close();
      } catch {
        // ignore — user can close the tab themselves
      }
    };
    window.addEventListener('afterprint', closeAfter, { once: true });
    // Double-RAF + 100ms gives React time to hydrate and paint the slip
    // before the print dialog snapshots it (early prints come out blank).
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    }, 100);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', closeAfter);
    };
  }, [order.cafeId, order.id]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="secondary" size="sm" onClick={() => print('kot')}>
          <Printer className="size-3.5" aria-hidden="true" />
          Print KOT
        </Button>
        <Button variant="secondary" size="sm" onClick={() => print('bill')}>
          <Printer className="size-3.5" aria-hidden="true" />
          Print bill
        </Button>
      </div>

      {/* Thermal-printer page sizing: 80mm wide, auto height, zero margins so
          the printer doesn't feed extra paper around the slip. Background
          stays white during print. Screen layout unaffected. */}
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body { margin: 0; background: #fff; }
        }
      `}</style>

      {/*
        Print-only container. Hidden on screen; during print it covers the whole
        viewport with a white surface and renders only the selected ticket, so the
        rest of the app is not printed.
      */}
      <div className="fixed inset-0 z-[999] hidden bg-white text-black print:block">
        {mode === 'kot' && <Kot order={order} />}
        {mode === 'bill' && (
          <Bill order={order} cafe={cafe} payments={payments} isDuplicate={isDuplicate} />
        )}
      </div>
    </>
  );
}

// ─── KOT (kitchen ticket) — NO prices ───────────────────────────────────────

function Kot({ order }: { order: OrderWithItems }) {
  const tableLine = order.tableLabel ? `Table ${order.tableLabel}` : 'Walk-in';

  return (
    <div className="mx-auto w-[80mm] max-w-[80mm] bg-white p-2 font-mono text-[12px] leading-tight text-black">
      <div className="text-center">
        <p className="text-2xl font-bold tracking-wide">KOT</p>
        <p className="text-sm font-bold">{order.orderNumber}</p>
        <p>{formatDateTime(order.createdAt)}</p>
      </div>

      <Divider />

      <p className="text-center text-xl font-bold">{tableLine}</p>

      <Divider />

      <ul className="space-y-2">
        {order.items.map((item) => (
          <li key={item.id}>
            <p className="text-base font-bold">
              {item.quantity} × {item.itemNameSnapshot}
            </p>
            {item.notes && <p className="pl-3 text-[11px]">↳ {item.notes}</p>}
          </li>
        ))}
      </ul>

      {order.notes && (
        <>
          <Divider />
          <p className="font-bold">Notes:</p>
          <p className="text-[11px]">{order.notes}</p>
        </>
      )}
    </div>
  );
}

// ─── Bill / GST invoice — full money ────────────────────────────────────────

function Bill({
  order,
  cafe,
  payments,
  isDuplicate,
}: {
  order: OrderWithItems;
  cafe: Cafe;
  payments: OrderPayment[];
  isDuplicate: boolean;
}) {
  // A composition dealer or exempt supplier may not head a document "Tax
  // Invoice" — it has to be a Bill of Supply. See lib/bill-document.
  const documentTitle = billDocumentTitle(cafe.gstMode);
  const declaration = compositionDeclaration(cafe.gstMode);
  // Only widen the item table with an HSN column if some item actually has one.
  const showHsn = order.items.some((it) => it.hsnSnapshot);
  // Split GST in half (intra-state convention) so CGST + SGST === taxPaise.
  const cgstPaise = Math.floor(order.taxPaise / 2);
  const sgstPaise = order.taxPaise - cgstPaise;
  const halfRatePct = formatPct(order.gstRateBp / 200);

  const addressParts = [
    cafe.addressLine1,
    cafe.addressLine2,
    [cafe.city, cafe.state, cafe.pincode].filter(Boolean).join(', '),
  ].filter(Boolean);

  const paymentLabel = order.paymentMethod
    ? (PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod)
    : null;

  return (
    <div className="mx-auto w-[80mm] max-w-[80mm] bg-white p-2 font-mono text-[12px] leading-tight text-black">
      <div className="text-center">
        <p className="text-base font-bold">{cafe.name}</p>
        {addressParts.map((line) => (
          <p key={line} className="text-[11px]">
            {line}
          </p>
        ))}
        {cafe.gstin && <p className="text-[11px]">GSTIN: {cafe.gstin}</p>}
        {cafe.fssai && <p className="text-[11px]">FSSAI: {cafe.fssai}</p>}
      </div>

      <Divider />

      <p className="text-center font-bold">{documentTitle}</p>
      {isDuplicate && (
        <p className="text-center text-sm font-bold tracking-widest">*** DUPLICATE ***</p>
      )}
      <div className="flex justify-between">
        <span>Bill:</span>
        <span className="font-bold">{order.orderNumber}</span>
      </div>
      <div className="flex justify-between">
        <span>Date:</span>
        <span>{formatDateTime(order.createdAt)}</span>
      </div>
      {order.tableLabel && (
        <div className="flex justify-between">
          <span>Table:</span>
          <span>{order.tableLabel}</span>
        </div>
      )}
      {order.customerName && (
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{order.customerName}</span>
        </div>
      )}
      {order.customerPhone && (
        <div className="flex justify-between">
          <span>Phone:</span>
          <span>{order.customerPhone}</span>
        </div>
      )}
      {order.customerGstin && (
        <div className="flex justify-between">
          <span>Customer GSTIN:</span>
          <span>{order.customerGstin}</span>
        </div>
      )}

      <Divider />

      <table className="w-full">
        <thead>
          <tr className="border-b border-dashed border-black text-left">
            <th className="py-0.5 font-bold">Item</th>
            {showHsn && <th className="py-0.5 text-left font-bold">HSN</th>}
            <th className="py-0.5 text-center font-bold">Qty</th>
            <th className="py-0.5 text-right font-bold">Rate</th>
            <th className="py-0.5 text-right font-bold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <BillItemRow key={item.id} item={item} showHsn={showHsn} />
          ))}
        </tbody>
      </table>

      <Divider />

      <Row label="Subtotal" value={formatRupees(order.subtotalPaise)} />
      {order.discountPaise > 0 && (
        <Row
          label={order.discountReason ? `Discount (${order.discountReason})` : 'Discount'}
          value={`- ${formatRupees(order.discountPaise)}`}
        />
      )}
      {order.serviceChargePaise > 0 && (
        <Row label="Service charge" value={formatRupees(order.serviceChargePaise)} />
      )}
      {order.packagingChargePaise > 0 && (
        <Row label="Packaging" value={formatRupees(order.packagingChargePaise)} />
      )}
      {order.taxPaise > 0 && (
        <>
          <Row label={`CGST ${halfRatePct}%`} value={formatRupees(cgstPaise)} />
          <Row label={`SGST ${halfRatePct}%`} value={formatRupees(sgstPaise)} />
        </>
      )}
      {order.roundOffPaise !== 0 && (
        <Row
          label="Round off"
          value={`${order.roundOffPaise > 0 ? '+ ' : '- '}${formatRupees(Math.abs(order.roundOffPaise))}`}
        />
      )}

      <div className="mt-1 flex items-baseline justify-between border-t-2 border-black pt-1">
        <span className="text-sm font-bold">Total</span>
        <span className="text-base font-bold">{formatRupees(order.totalPaise)}</span>
      </div>

      <p className="mt-1 text-[11px]">{amountInWords(order.totalPaise)}</p>

      {payments.length > 0 ? (
        <div className="mt-1">
          {payments.map((p) => (
            <Row
              key={p.id}
              label={`${p.kind === 'refund' ? 'Refund ' : 'Paid '}${PAYMENT_LABELS[p.method] ?? p.method}`}
              value={`${p.kind === 'refund' ? '- ' : ''}${formatRupees(p.amountPaise)}`}
            />
          ))}
        </div>
      ) : (
        paymentLabel && <p className="mt-1 text-center">Paid via {paymentLabel}</p>
      )}

      <Divider />

      {declaration && <p className="text-center text-[11px] font-bold">{declaration}</p>}

      <p className="text-center">Thank you! Visit again</p>
    </div>
  );
}

function BillItemRow({ item, showHsn }: { item: OrderItem; showHsn: boolean }) {
  return (
    <tr className="align-top">
      <td className="py-0.5 pr-1">{item.itemNameSnapshot}</td>
      {showHsn && <td className="py-0.5 pr-1 tabular-nums">{item.hsnSnapshot ?? '—'}</td>}
      <td className="py-0.5 text-center tabular-nums">{item.quantity}</td>
      <td className="py-0.5 text-right tabular-nums">{formatRupees(item.unitPricePaise)}</td>
      <td className="py-0.5 text-right tabular-nums">{formatRupees(item.lineTotalPaise)}</td>
    </tr>
  );
}

// ─── shared bits ────────────────────────────────────────────────────────────

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
}
