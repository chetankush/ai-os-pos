/**
 * Razorpay Checkout loader + minimal browser typings.
 *
 * The diner pay-from-phone flow opens Razorpay's hosted Checkout in an overlay.
 * That widget is delivered by an external script, so we inject it lazily (only
 * when a diner actually pays) and reuse it across retries.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  /** Razorpay public key id. */
  key: string;
  /** Razorpay order id created server-side. */
  order_id: string;
  /** Amount in the smallest currency unit (paise for INR). */
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler?: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpayInstance {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loadPromise: Promise<void> | null = null;

/**
 * Inject the Razorpay Checkout script exactly once and resolve when the global
 * `window.Razorpay` constructor is available. Idempotent — concurrent or repeat
 * calls share a single in-flight promise and never re-inject the tag.
 */
export function loadRazorpay(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay can only load in the browser.'));
  }

  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (window.Razorpay) resolve();
      else reject(new Error('Razorpay failed to initialise.'));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`,
    );

    if (existing) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => {
          loadPromise = null;
          reject(new Error('Could not load the payment window.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener(
      'error',
      () => {
        loadPromise = null;
        reject(new Error('Could not load the payment window.'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return loadPromise;
}
