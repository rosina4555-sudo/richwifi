/**
 * Web Push subscription service.
 *
 * Flow (called from CheckoutModal before payment):
 *   1. Register the service worker
 *   2. Ask for notification permission (on a user gesture)
 *   3. Subscribe with the VAPID public key from the backend
 *   4. POST the subscription to /api/push/subscribe keyed by checkout phone
 *
 * iOS Safari requires the site to be added to the Home Screen (iOS 16.4+);
 * isPushSupported() reports false there so the UI can show the right hint.
 */

import { api } from './api'

const VAPID_KEY_VERSION = 'v1' // bump if backend VAPID keys rotate

/** Convert a base64url VAPID key to the Uint8Array pushManager expects */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** True when this browser can do Web Push at all (SW + PushManager + secure context) */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    window.isSecureContext
  )
}

/** Permission state: 'granted' | 'denied' | 'default' | 'unsupported' */
export function permissionState() {
  if (!isPushSupported() || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Register public/sw.js (idempotent) */
export async function registerServiceWorker() {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    console.error('Service worker registration failed:', err)
    return null
  }
}

/**
 * Ensure this browser is subscribed for push and the backend knows about it.
 *
 * @param {string} phone - checkout phone (normalized server-side)
 * @returns {Promise<{ok: boolean, status: string}>}
 *   status: 'subscribed' | 'denied' | 'unsupported' | 'error'
 */
export async function ensureSubscribed(phone) {
  if (!isPushSupported()) return { ok: false, status: 'unsupported' }

  try {
    // 1. Permission — must be requested from a user gesture (the Pay click)
    if (Notification.permission === 'denied') return { ok: false, status: 'denied' }
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return { ok: false, status: 'denied' }
    }

    // 2. Service worker must be active before subscribing
    const registration = await navigator.serviceWorker.ready
    if (!registration) return { ok: false, status: 'error' }

    // 3. Reuse an existing subscription if the key version matches
    let subscription = await registration.pushManager.getSubscription()
    const storedKey = localStorage.getItem('rw_vapid_key_version')
    if (subscription && storedKey !== VAPID_KEY_VERSION) {
      await subscription.unsubscribe()
      subscription = null
    }

    // 4. Fresh subscription with the backend's VAPID public key
    if (!subscription) {
      const keyRes = await api.pushVapidKey()
      const publicKey = keyRes?.data?.publicKey
      if (!publicKey) return { ok: false, status: 'error' }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      localStorage.setItem('rw_vapid_key_version', VAPID_KEY_VERSION)
    }

    // 5. Register it against the checkout phone (upsert — safe to repeat)
    await api.pushSubscribe({
      phone,
      subscription: subscription.toJSON(),
    })

    return { ok: true, status: 'subscribed' }
  } catch (err) {
    console.error('Push subscription failed:', err)
    return { ok: false, status: 'error' }
  }
}

/** Remove this browser's subscription from the backend (best-effort) */
export async function unsubscribe() {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return false

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    localStorage.removeItem('rw_vapid_key_version')
    await api.pushUnsubscribe({ endpoint })
    return true
  } catch (err) {
    console.error('Push unsubscribe failed:', err)
    return false
  }
}
