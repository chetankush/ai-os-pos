import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRazorpayProvider } from './razorpay.js';

const KEY_ID = 'rzp_test_keyid';
const KEY_SECRET = 'rzp_test_secret_xyz';

function expectedSignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('createRazorpayProvider.verifySignature', () => {
  const provider = createRazorpayProvider({ keyId: KEY_ID, keySecret: KEY_SECRET });

  it('returns true for a signature computed with the same secret', () => {
    const orderId = 'order_abc123';
    const paymentId = 'pay_abc123';
    const signature = expectedSignature(orderId, paymentId, KEY_SECRET);

    expect(provider.verifySignature({ orderId, paymentId, signature })).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    const orderId = 'order_abc123';
    const paymentId = 'pay_abc123';
    const good = expectedSignature(orderId, paymentId, KEY_SECRET);
    const tampered = `${good.slice(0, -1)}${good.endsWith('0') ? '1' : '0'}`;

    expect(provider.verifySignature({ orderId, paymentId, signature: tampered })).toBe(false);
  });

  it('returns false for a signature of the wrong length (no throw)', () => {
    const orderId = 'order_abc123';
    const paymentId = 'pay_abc123';

    expect(provider.verifySignature({ orderId, paymentId, signature: 'short' })).toBe(false);
  });

  it('returns false when the secret differs', () => {
    const orderId = 'order_abc123';
    const paymentId = 'pay_abc123';
    const signature = expectedSignature(orderId, paymentId, 'a-different-secret');

    expect(provider.verifySignature({ orderId, paymentId, signature })).toBe(false);
  });
});
