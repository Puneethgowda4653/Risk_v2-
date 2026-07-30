/* ══════════════════════════════════════════════════════════════════════════
   Razorpay Modal Checkout helper.

   Razorpay's overlay is a cross-origin iframe, so browsers forbid it from
   navigating our (the parent) window. We therefore create the order on our
   secure backend, open the modal, and — in the client-side success `handler` —
   hand the response back to the caller, which redirects the top-level window to
   the external Payment Hub itself. No `callback_url` / `callback_method` is set.
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
  /** Our app session id (from /api/start) so the backend can track payment. */
  sessionId?: string | null;
  assessmentId?: string | null;
  /** Success handler — receives the Razorpay response for the Hub redirect. */
  onSuccess: (result: RazorpayResult) => void;
  /** Fired on payment.failed or a load/order error. */
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
        sessionId: opts.sessionId ?? null,
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

  // 2. Open the modal checkout. NOTE: no callback_url / callback_method — the
  //    success `handler` runs in our page context and drives the redirect.
  const rzp = new window.Razorpay({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: 'Infopace Risk Report',
    description: 'Full risk assessment PDF report',
    prefill: { name: opts.name, email: opts.email },
    theme: { color: '#0ea5e9' },
    handler: (response: RazorpayResult) => opts.onSuccess(response),
    modal: {
      ondismiss: () => opts.onDismiss?.(),
    },
  });

  rzp.on('payment.failed', (resp: any) => {
    opts.onFailure(resp?.error?.description || 'payment_failed', { orderId: order.orderId });
  });

  rzp.open();
}
