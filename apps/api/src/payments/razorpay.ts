import { createHmac, timingSafeEqual } from 'node:crypto';

/** A provider-created payment order (Razorpay order). Amount is in paise. */
export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
}

/**
 * Swappable payment provider. Razorpay today; the interface keeps the routes
 * provider-agnostic (mirrors the AI waiter's swappable-provider style) so a
 * test can inject a stub and a future provider can be dropped in.
 */
export interface PaymentProvider {
  createOrder(input: {
    amountPaise: number;
    currency?: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<PaymentOrder>;
  verifySignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export function createRazorpayProvider(config: RazorpayConfig): PaymentProvider {
  const authHeader = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

  return {
    async createOrder(input) {
      const currency = input.currency ?? 'INR';
      const res = await fetch(RAZORPAY_ORDERS_URL, {
        method: 'POST',
        headers: {
          authorization: authHeader,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amount: input.amountPaise,
          currency,
          receipt: input.receipt,
          notes: input.notes,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Razorpay createOrder failed ${res.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await res.json()) as { id: string; amount: number; currency: string };
      return { id: data.id, amount: data.amount, currency: data.currency };
    },

    verifySignature({ orderId, paymentId, signature }) {
      // Razorpay signs `${order_id}|${payment_id}` with HMAC-SHA256 using the
      // key secret. Compare in constant time to avoid leaking via timing.
      const expected = createHmac('sha256', config.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');
      // timingSafeEqual throws on length mismatch — guard so a malformed
      // (wrong-length) signature simply fails verification.
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    },
  };
}
