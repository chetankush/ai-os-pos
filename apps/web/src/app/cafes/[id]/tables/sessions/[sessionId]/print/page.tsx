import { ApiError } from '@/lib/api';
import { serverFetch } from '@/lib/api-server';
import type { CafeResponse, OrderItem, TableSessionDetailResponse } from '@sangam/types';
import { notFound } from 'next/navigation';
import { AutoPrint } from './auto-print';

export const metadata = { title: 'Bill · Sangam' };

interface PageProps {
  params: Promise<{ id: string; sessionId: string }>;
}

/**
 * Print-only consolidated bill for a table session (multi-round tab). Opened
 * in a new tab from the table-session sheet; auto-fires the print dialog. The
 * markup mirrors the single-order bill in `orders/[orderId]/print-views.tsx`
 * but rolls all orders in the session into one tax invoice — which is what the
 * diner expects (one receipt per table, not one per round).
 */
export default async function SessionBillPrintPage({ params }: PageProps) {
  const { id, sessionId } = await params;

  let session: TableSessionDetailResponse['session'];
  let cafe: CafeResponse['cafe'];
  try {
    const [sessionRes, cafeRes] = await Promise.all([
      serverFetch<TableSessionDetailResponse>(`/cafes/${id}/table-sessions/${sessionId}`),
      serverFetch<CafeResponse>(`/cafes/${id}`),
    ]);
    session = sessionRes.session;
    cafe = cafeRes.cafe;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Roll line items up across every round in the tab so the diner sees one
  // combined bill — same item quantity stacks, prices stay rupee-level.
  const merged = mergeItems(session.orders.flatMap((o) => o.items));

  // Convention: intra-state GST splits 50/50 into CGST + SGST. Use the rate
  // from the first order (the API ensures a single rate per session).
  const gstRateBp = session.orders[0]?.gstRateBp ?? 0;
  const cgstPaise = Math.floor(session.taxPaise / 2);
  const sgstPaise = session.taxPaise - cgstPaise;
  const halfRatePct = formatPct(gstRateBp / 200);

  const addressParts = [
    cafe.addressLine1,
    cafe.addressLine2,
    [cafe.city, cafe.state, cafe.pincode].filter(Boolean).join(', '),
  ].filter(Boolean);

  const guest = session.session.guestName?.trim();
  const party = session.session.partySize;
  const firstOrderNumber = session.orders[0]?.orderNumber ?? '—';
  // `closedAt` is set on both settle and force-close; treat it as the bill
  // timestamp. Open sessions fall back to now so the bill still prints during
  // a preview.
  const billDateIso = session.session.closedAt ?? new Date().toISOString();

  return (
    <>
      <AutoPrint />
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        @media screen {
          body { padding: 24px; }
          .receipt { margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        }
      `}</style>
      <div className="receipt mx-auto w-[80mm] max-w-[80mm] bg-white p-2 font-mono text-[12px] leading-tight text-black">
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
          <span className="font-bold">{firstOrderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDateTime(billDateIso)}</span>
        </div>
        <div className="flex justify-between">
          <span>Table:</span>
          <span>{session.table.label}</span>
        </div>
        {guest && (
          <div className="flex justify-between">
            <span>Guest:</span>
            <span>{guest}</span>
          </div>
        )}
        {party && (
          <div className="flex justify-between">
            <span>Party:</span>
            <span>{party}</span>
          </div>
        )}
        {session.orders.length > 1 && (
          <div className="flex justify-between">
            <span>Rounds:</span>
            <span>{session.orders.length}</span>
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
            {merged.map((m) => (
              <tr key={m.key} className="align-top">
                <td className="py-0.5 pr-1">{m.name}</td>
                <td className="py-0.5 text-center tabular-nums">{m.quantity}</td>
                <td className="py-0.5 text-right tabular-nums">{formatRupees(m.unitPricePaise)}</td>
                <td className="py-0.5 text-right tabular-nums">{formatRupees(m.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider />

        <Row label="Subtotal" value={formatRupees(session.subtotalPaise)} />
        {session.taxPaise > 0 && (
          <>
            <Row label={`CGST ${halfRatePct}%`} value={formatRupees(cgstPaise)} />
            <Row label={`SGST ${halfRatePct}%`} value={formatRupees(sgstPaise)} />
          </>
        )}

        <div className="mt-1 flex items-baseline justify-between border-t-2 border-black pt-1">
          <span className="text-sm font-bold">Total</span>
          <span className="text-base font-bold">{formatRupees(session.totalPaise)}</span>
        </div>

        {session.session.status === 'closed' && session.session.closedAt && (
          <p className="mt-1 text-center text-[11px]">
            Settled {formatDateTime(session.session.closedAt)}
          </p>
        )}

        <Divider />

        <p className="text-center">Thank you! Visit again</p>
      </div>
    </>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

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

/** Sum quantities for the same name+unit-price across multiple rounds. */
function mergeItems(items: OrderItem[]) {
  const map = new Map<
    string,
    { key: string; name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }
  >();
  for (const it of items) {
    const key = `${it.itemNameSnapshot}__${it.unitPricePaise}`;
    const prev = map.get(key);
    if (prev) {
      prev.quantity += it.quantity;
      prev.lineTotalPaise += it.lineTotalPaise;
    } else {
      map.set(key, {
        key,
        name: it.itemNameSnapshot,
        quantity: it.quantity,
        unitPricePaise: it.unitPricePaise,
        lineTotalPaise: it.lineTotalPaise,
      });
    }
  }
  return [...map.values()];
}

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
