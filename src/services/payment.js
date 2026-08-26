/**
 * Payment service — single integration point for checkout providers.
 *
 * The whole app talks to this module only, so swapping in Paystack later
 * requires no changes anywhere else.
 *
 * ── PAYSTACK INTEGRATION GUIDE ────────────────────────────────────────
 * 1. npm install @paystack/inline-js   (or use the Pop script tag)
 * 2. Add VITE_PAYSTACK_PUBLIC_KEY to your .env
 * 3. Replace the body of `initializePayment` below with something like:
 *
 *    import { Paystack } from '@paystack/inline-js'
 *    const pop = new Paystack()
 *    return pop.newTransaction({
 *      key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
 *      email: order.email,
 *      amount: order.amountMinor, // kobo/pesewas — already ×100
 *      metadata: { plan: order.planLabel, quantity: order.quantity },
 *      onSuccess: (t) => resolve({ reference: t.reference }),
 *      onCancel: () => reject(new Error('cancelled')),
 *    })
 * ──────────────────────────────────────────────────────────────────────
 */

export function initializePayment(order) {
  // DEMO MODE — simulates a gateway round-trip until Paystack is wired up.
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.98) {
        resolve({
          status: 'success',
          reference: `RW-${Date.now().toString(36).toUpperCase()}`,
        })
      } else {
        reject(new Error('Gateway unavailable, please try again.'))
      }
    }, 1400)
  })
}

export const currency = (value) => `$${value.toFixed(2)}`
