/* ══════════════════════════════════════════════════════════════════════════
   Razorpay Modal Checkout helper.

   Razorpay's overlay is a cross-origin iframe, so modern browsers forbid it
   from navigating our (the parent) window. We therefore drive the whole flow
   from our own code: create the order on our secure backend, open the modal,
   verify the signature, and hand control back to the caller — which then
   performs the top-level redirect to the external Payment Hub.
   ══════════════════════════════════════════════════════════════════════════ */

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = RAZORPAY_SCRIPT;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface RazorpayResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface CheckoutOptions {
  apiUrl: string;
  name: string;
  email: string;
  companyName?: string;
  assessmentId?: string | null;
  /** Fired after the signature is verified on our backend. */
  onSuccess: (result: RazorpayResult) => void;
  /** Fired on payment.failed, a load/order/verify error, or a bad signature. */
  onFailure: (reason: string, meta?: { orderId?: string }) => void;
  /** Fired when the user closes the modal without paying. */
  onDismiss?: () => void;
}

export async function startRazorpayCheckout(opts: CheckoutOptions): Promise<void> {
  const { apiUrl } = opts;

  const scriptOk = await loadRazorpayScript();
  if (!scriptOk || !window.Razorpay) {
    opts.onFailure('script_load_failed');
    return;
  }

  // 1. Create the order on our secure backend (price is enforced there).
  let order: { orderId: string; amount: number; currency: string; keyId: string };
  try {
    const res = await fetch(`${apiUrl}/api/razorpay/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: opts.email,
        assessmentId: opts.assessmentId ?? null,
        notes: { purpose: 'risk_report_pdf', company: opts.companyName || '' },
      }),
    });
    order = await res.json();
    if (!res.ok || !order.orderId) {
      opts.onFailure('order_create_failed');
      return;
    }
  } catch {
    opts.onFailure('order_create_failed');
    return;
  }

  // 2. Open the modal checkout.
  const rzp = new window.Razorpay({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: 'Infopace Risk Report',
    description: 'Full risk assessment PDF report',
    prefill: { name: opts.name, email: opts.email },
    theme: { color: '#0ea5e9' },
    // Success handler — we cannot let the overlay redirect us, so we take the
    // response, verify it, and let the caller perform the top-level redirect.
    handler: async (response: RazorpayResult) => {
      try {
        const vr = await fetch(`${apiUrl}/api/razorpay/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        const vd = await vr.json();
        if (vr.ok && vd.verified) opts.onSuccess(response);
        else opts.onFailure('signature_invalid', { orderId: order.orderId });
      } catch {
        opts.onFailure('verify_failed', { orderId: order.orderId });
      }
    },
    modal: {
      ondismiss: () => opts.onDismiss?.(),
    },
  });

  rzp.on('payment.failed', (resp: any) => {
    opts.onFailure(resp?.error?.description || 'payment_failed', { orderId: order.orderId });
  });

  rzp.open();
}

/**
 * Navigate the top-level window to `url`, escaping any parent frame we're
 * embedded in. Setting `window.top.location.href` is one of the few
 * cross-origin operations browsers still permit; if the parent blocks it we
 * fall back to navigating our own window.
 */
export function redirectTopLevel(url: string): void {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    /* cross-origin parent — fall through to same-window navigation */
  }
  window.location.href = url;
}
