'use client';

import type { Cafe, OrderItem, OrderWithItems } from '@sangam/types';
import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Mode = 'kot' | 'bill' | null;

interface PrintViewsProps {
  order: OrderWithItems;
  cafe: Cafe;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  online: 'Online',
};

export function PrintViews({ order, cafe }: PrintViewsProps) {
  const [mode, setMode] = useState<Mode>(null);

  function print(next: Exclude<Mode, null>) {
    setMode(next);
    // Let React paint the selected ticket before opening the print dialog.
    setTimeout(() => window.print(), 50);
  }

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

      {/* Keep the page background white while printing. */}
      <style>{`@media print { body { background: #fff; } }`}</style>

      {/*
        Print-only container. Hidden on screen; during print it covers the whole
        viewport with a white surface and renders only the selected ticket, so the
        rest of the app is not printed.
      */}
      <div className="fixed inset-0 z-[999] hidden bg-white text-black print:block">
        {mode === 'kot' && <Kot order={order} />}
        {mode === 'bill' && <Bill order={order} cafe={cafe} />}
      </div>
    </>
  );
}

// ─── KOT (kitchen ticket) — NO prices ───────────────────────────────────────

function Kot({ order }: { order: OrderWithItems }) {
  const tableLine = order.tableLabel
    ? `Table ${order.tableLabel}`
    : 'Walk-in';

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
            {item.notes && (
              <p className="pl-3 text-[11px]">↳ {item.notes}</p>
            )}
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

function Bill({ order, cafe }: { order: OrderWithItems; cafe: Cafe }) {
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
    ? PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod
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

      <p className="text-center font-bold">TAX INVOICE</p>
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

      <Divider />

      <table className="w-full">
        <thead>
          <tr className="border-b border-dashed border-black text-left">
            <th className="py-0.5 font-bold">Item</th>
            <th className="py-0.5 text-center font-bold">Qty</th>
            <th className="py-0.5 text-right font-bold">Rate</th>
            <th className="py-0.5 text-right font-bold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <BillItemRow key={item.id} item={item} />
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
        <span className="text-base font-bold">
          {formatRupees(order.totalPaise)}
        </span>
      </div>

      {paymentLabel && (
        <p className="mt-1 text-center">Paid via {paymentLabel}</p>
      )}

      <Divider />

      <p className="text-center">Thank you! Visit again</p>
    </div>
  );
}

function BillItemRow({ item }: { item: OrderItem }) {
  return (
    <tr className="align-top">
      <td className="py-0.5 pr-1">{item.itemNameSnapshot}</td>
      <td className="py-0.5 text-center tabular-nums">{item.quantity}</td>
      <td className="py-0.5 text-right tabular-nums">
        {formatRupees(item.unitPricePaise)}
      </td>
      <td className="py-0.5 text-right tabular-nums">
        {formatRupees(item.lineTotalPaise)}
      </td>
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
