<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { api } from '../services/api'
import { ensureSubscribed } from '../services/push'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

const props = defineProps({
  location: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const availablePlans = computed(() => props.location.plans || [])
const firstInStockPlan = computed(() => availablePlans.value.find(p => (Number(p.available_stock) || 0) > 0) || availablePlans.value[0])
const selectedPlanId = ref(firstInStockPlan.value?.plan_id || firstInStockPlan.value?.id)
const quantity = ref(1)
const email = ref('')
const phone = ref('')
const step = ref('details') // 'details' | 'processing' | 'polling' | 'success' | 'cancelled' | 'error'
const error = ref('')
const orderId = ref(null)
const accessCode = ref(null)
const accessKey = ref(null)
const paystackRef = ref(null)
const accessCodes = ref([])
const copiedIndex = ref(null)
const copiedField = ref(null)
// Non-fatal notice about push notification delivery (set during pay())
const pushNotice = ref('')
let pollTimer = null
let pollCount = 0
const POLL_INTERVAL = 3000 // 3 seconds
const POLL_TIMEOUT = 60000 // 60 seconds max

const MAX_QTY = 20

const selectedPlan = computed(
  () =>
    availablePlans.value.find((p) => (p.plan_id || p.id) === selectedPlanId.value) ||
    availablePlans.value[0],
)

const subtotal = computed(() => (Number(selectedPlan.value?.price) || 0) * quantity.value)
const total = computed(() => subtotal.value)

const validEmail = computed(
  () => !email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
)
const validPhone = computed(() => {
  const p = phone.value.replace(/[^0-9+]/g, '')
  // Ghana: 0XXXXXXXXX (10 digits) or +233XXXXXXXXX or 233XXXXXXXXX (12 digits)
  if (/^0\d{9}$/.test(p)) return true
  if (/^233\d{9}$/.test(p)) return true
  if (/^\+233\d{9}$/.test(p)) return true
  return false
})
const inStock = computed(() => (Number(selectedPlan.value?.available_stock) || 0) > 0)
const canPay = computed(() => validEmail.value && validPhone.value && inStock.value && step.value === 'details')

const changeQty = (delta) => {
  quantity.value = Math.min(MAX_QTY, Math.max(1, quantity.value + delta))
}

const currency = (value) => `₵${Number(value).toFixed(2)}`

/**
 * Step 1: Create order on backend → get accessCode
 * Step 2: Open Paystack popup inline with resumeTransaction(accessCode)
 * Step 3: On success, poll for token delivery
 */
const pay = async () => {
  if (!canPay.value) return
  step.value = 'processing'
  error.value = ''
  pushNotice.value = ''

  // Start the push subscription IMMEDIATELY — the permission prompt needs this
  // user gesture, and the subscription must exist before the payment webhook
  // fires. Runs in parallel with order creation; never blocks payment.
  const pushPromise = ensureSubscribed(phone.value.trim())
    .then((res) => {
      if (res.status === 'denied') {
        pushNotice.value =
          'Notifications are blocked, so we can\'t alert you here — your codes will still appear below after payment, and anytime on My Purchases with your phone number.'
      } else if (res.status === 'unsupported') {
        pushNotice.value =
          'This browser can\'t receive push notifications — your codes will appear below after payment, and anytime on My Purchases with your phone number.'
      } else if (res.status === 'error') {
        pushNotice.value =
          'Couldn\'t set up notifications — your codes will appear below after payment and on My Purchases.'
      }
      return res
    })
    .catch(() => ({ ok: false, status: 'error' }))

  try {
    const idempotencyKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const res = await api.createOrder({
      locationId: props.location.id,
      planId: selectedPlan.value.plan_id || selectedPlan.value.id,
      quantity: quantity.value,
      email: email.value.trim(),
      phone: phone.value.trim(),
      idempotencyKey,
    })

    const orderData = res.data || res
    orderId.value = orderData.orderId || orderData.id
    accessCode.value = orderData.accessCode
    accessKey.value = orderData.accessKey
    paystackRef.value = orderData.reference

    if (!accessCode.value) {
      // Paystack unavailable — show simulation info
      error.value = orderData.message || 'Payment gateway unavailable. Try again later.'
      step.value = 'error'
      return
    }

    // Ensure the subscription round-trip finished before payment completes, so
    // there is no race where the webhook fires before the backend knows us.
    await pushPromise

    // Step 2: Open Paystack popup inline
    openPaystackPopup()
  } catch (e) {
    error.value = e.message || 'Failed to create order. Please try again.'
    step.value = 'error'
  }
}

/**
 * Opens the Paystack inline popup using resumeTransaction.
 * Handles success, cancel, and error states.
 */
const openPaystackPopup = () => {
  // Dynamically import Paystack
  import('@paystack/inline-js').then(({ default: Paystack }) => {
    const popup = new Paystack()

    popup.resumeTransaction(accessCode.value, {
      onLoad: (response) => {
        // Popup loaded — user can now see the checkout form
        console.log('Paystack popup loaded:', response.accessCode)
      },
      onSuccess: (transaction) => {
        // Payment successful — start polling for token delivery
        console.log('Payment successful:', transaction.reference)
        step.value = 'polling'
        startPolling()
      },
      onCancel: () => {
        // User closed the popup without paying
        step.value = 'cancelled'
        releaseTokens()
      },
      onError: (err) => {
        // Error loading the popup
        console.error('Paystack error:', err)
        error.value = err.message || 'Payment failed. Please try again.'
        step.value = 'error'
        releaseTokens()
      },
    })
  }).catch((err) => {
    console.error('Failed to load Paystack:', err)
    error.value = 'Failed to load payment form. Please refresh and try again.'
    step.value = 'error'
  })
}

/**
 * Poll the backend for order status after successful payment.
 * Tokens appear once the webhook confirms payment.
 */
const startPolling = () => {
  pollCount = 0
  pollTimer = setInterval(async () => {
    pollCount++

    // Timeout after 60 seconds
    if (pollCount * POLL_INTERVAL >= POLL_TIMEOUT) {
      clearInterval(pollTimer)
      pollTimer = null
      error.value = 'Taking longer than expected. Your payment may still be processing — check back in a few minutes using your access key on My Tickets.'
      step.value = 'error'
      return
    }

    try {
      const res = await api.getOrderStatus(orderId.value)
      const data = res.data || res

      if (data.status === 'paid') {
        clearInterval(pollTimer)
        pollTimer = null
        accessCodes.value = (data.tokens || []).map((t) => ({
          code: t.code,
        }))
        step.value = 'success'
      } else if (data.status === 'failed' || data.status === 'expired') {
        clearInterval(pollTimer)
        pollTimer = null
        error.value = data.status === 'expired' ? 'Order expired. Please try again.' : 'Payment could not be verified. Please try again.'
        step.value = 'error'
      }
    } catch {
      // Keep polling on transient network errors
    }
  }, POLL_INTERVAL)
}

/**
 * Release reserved tokens when payment is cancelled/failed.
 * Best-effort — don't block UI on failure.
 */
const releaseTokens = async () => {
  // The backend handles stale reservation cleanup,
  // but we can also trigger the webhook simulator in dev
  try {
    // No explicit release endpoint — backend cleanup handles it
  } catch {
    // ignore
  }
}

const resetAndClose = () => {
  if (step.value === 'processing' || step.value === 'polling') return
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  emit('close')
}

watch(
  () => props.location,
  () => {
    const plans = props.location.plans || []
    const inStock = plans.find(p => (Number(p.available_stock) || 0) > 0) || plans[0]
    selectedPlanId.value = inStock?.plan_id || inStock?.id
    quantity.value = 1
    email.value = ''
    phone.value = ''
    step.value = 'details'
    error.value = ''
    orderId.value = null
    accessCode.value = null
    accessKey.value = null
    paystackRef.value = null
    accessCodes.value = []
    copiedIndex.value = null
    copiedField.value = null
    pushNotice.value = ''
  },
)

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

const onKeydown = (e) => {
  if (e.key === 'Escape') resetAndClose()
}
window.addEventListener('keydown', onKeydown)

const copyCode = async (code, i) => {
  try {
    await navigator.clipboard.writeText(code)
    copiedIndex.value = i
    setTimeout(() => {
      if (copiedIndex.value === i) copiedIndex.value = null
    }, 1500)
  } catch {
    /* clipboard unavailable — ignore */
  }
}

const copyField = async (value, field) => {
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 1500)
  } catch {
    /* clipboard unavailable — ignore */
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-brand-dark/60 backdrop-blur-sm"
          @click="resetAndClose"
        ></div>

        <!-- Sheet / Dialog -->
        <Transition
          appear
          enter-active-class="transition duration-250 ease-out"
          enter-from-class="translate-y-full sm:translate-y-4 sm:scale-95 opacity-0"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="translate-y-full sm:translate-y-4 sm:scale-95 opacity-0"
        >
          <div
            class="clay relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface sm:max-w-md sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Purchase Wi-Fi tickets"
          >
            <!-- Grab handle (mobile sheet affordance) -->
            <div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-brand/15 sm:hidden"></div>

            <!-- Header -->
            <div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
              <div class="min-w-0">
                <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
                  {{ step === 'success' ? 'Order Complete 🎉' : 'Buy Tickets' }}
                </h2>
                <p v-if="step === 'details'" class="mt-0.5 truncate text-xs font-medium text-brand-dark/55">
                  {{ location.name }} · {{ location.address }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl p-1.5 text-brand-dark/40 transition hover:bg-brand/5 hover:text-brand"
                aria-label="Close"
                :disabled="step === 'processing' || step === 'polling'"
                @click="resetAndClose"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
              <!-- ── STEP: details ─────────────────────────────── -->
              <template v-if="step === 'details' || step === 'error' || step === 'cancelled'">
                <!-- Plan picker -->
                <p class="text-xs font-bold tracking-widest text-brand uppercase">Choose a plan</p>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <button
                    v-for="p in availablePlans"
                    :key="p.plan_id || p.id"
                    type="button"
                    class="flex flex-col items-center rounded-2xl px-2 py-2.5 transition-all duration-200"
                    :class="[
                      (Number(p.available_stock) || 0) === 0 ? 'opacity-40 cursor-not-allowed' : '',
                      (p.plan_id || p.id) === (selectedPlan.plan_id || selectedPlan.id)
                        ? 'bg-gradient-to-br from-brand to-accent text-white shadow-md shadow-accent/30 ring-2 ring-accent/40'
                        : 'clay-well bg-brand/[0.05] text-brand-dark/75 hover:bg-brand/10',
                    ]"
                    :disabled="(Number(p.available_stock) || 0) === 0"
                    @click="selectedPlanId = p.plan_id || p.id"
                  >
                    <span class="text-xs font-extrabold">{{ p.plan_label || p.label }}</span>
                    <span
                      class="mt-0.5 text-sm font-black"
                      :class="(p.plan_id || p.id) === (selectedPlan.plan_id || selectedPlan.id) ? 'text-white' : 'text-brand'"
                    >
                      {{ currency(p.price) }}
                    </span>
                    <span class="mt-0.5 text-[10px] font-semibold" :class="(Number(p.available_stock) || 0) > 0 ? 'text-emerald-600' : 'text-red-500'">
                      {{ (Number(p.available_stock) || 0) > 0 ? p.available_stock + ' left' : 'Sold out' }}
                    </span>
                  </button>
                </div>

                <!-- Quantity -->
                <div class="mt-4 flex items-center justify-between">
                  <div>
                    <p class="text-xs font-bold tracking-widest text-brand uppercase">Quantity</p>
                    <p class="mt-0.5 text-[11px] text-brand-dark/45">{{ MAX_QTY }} max per order</p>
                  </div>
                  <div class="clay-sm flex items-center gap-1 rounded-2xl bg-surface p-1">
                    <button
                      type="button"
                      class="clay-well flex h-9 w-9 items-center justify-center rounded-xl bg-brand/[0.06] text-lg font-bold text-brand transition hover:bg-brand/15 active:scale-95 disabled:opacity-30"
                      :disabled="quantity <= 1"
                      aria-label="Decrease quantity"
                      @click="changeQty(-1)"
                    >
                      −
                    </button>
                    <span class="w-9 text-center font-heading text-lg font-bold tabular-nums">{{ quantity }}</span>
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-lg font-bold text-white shadow-md shadow-accent/25 transition hover:brightness-110 active:scale-95 disabled:opacity-30"
                      :disabled="quantity >= MAX_QTY"
                      aria-label="Increase quantity"
                      @click="changeQty(1)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <!-- Email (optional) -->
                <label class="mt-4 block">
                  <span class="text-xs font-bold tracking-widest text-brand uppercase">
                    Email
                    <span class="ml-1 rounded-full bg-brand/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-brand/40 normal-case tracking-normal">optional</span>
                  </span>
                  <input
                    v-model="email"
                    type="email"
                    autocomplete="email"
                    placeholder="you@example.com"
                    class="clay-well mt-2 w-full rounded-2xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/35 focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:outline-none"
                  />
                  <span class="mt-1.5 block text-[11px] text-brand-dark/45">
                    Optional — we'll create one for you if skipped.
                  </span>
                </label>

                <!-- Phone (required) -->
                <label class="mt-3 block">
                  <span class="text-xs font-bold tracking-widest text-brand uppercase">
                    Phone number
                    <span class="ml-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-500 normal-case tracking-normal">required</span>
                  </span>
                  <input
                    v-model="phone"
                    type="tel"
                    autocomplete="tel"
                    placeholder="0544 123 456"
                    class="clay-well mt-2 w-full rounded-2xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/35 focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:outline-none"
                  />
                  <span class="mt-1.5 block text-[11px] text-brand-dark/45">
                    Your codes are pushed to this browser after payment — keep this number to find them anytime.
                  </span>
                  <span v-if="phone && !validPhone" class="mt-1 block text-[11px] text-red-500">
                    Enter a valid Ghana phone number (e.g. 0544123456)
                  </span>
                </label>

                <!-- Push delivery notice (only when notifications can't be set up) -->
                <p v-if="pushNotice" class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed font-semibold text-amber-700">
                  🔔 {{ pushNotice }}
                </p>

                <!-- Order summary -->
                <div class="clay-well mt-4 space-y-1.5 rounded-2xl bg-brand/[0.04] p-4 text-sm">
                  <div class="flex items-center justify-between text-brand-dark/65">
                    <span>{{ selectedPlan.plan_label || selectedPlan.label }} ticket × {{ quantity }}</span>
                    <span class="font-semibold">{{ currency(subtotal) }}</span>
                  </div>
                  <div class="mt-1 flex items-center justify-between border-t border-brand/10 pt-2">
                    <span class="font-heading text-sm font-bold text-brand">Total</span>
                    <span class="font-heading text-lg font-black text-brand">{{ currency(total) }}</span>
                  </div>
                </div>

                <!-- Out of stock warning -->
                <p v-if="!inStock" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  This plan is currently out of stock. Please choose another plan.
                </p>

                <!-- Error / Cancel message -->
                <p v-if="step === 'error' && error" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {{ error }}
                </p>
                <p v-if="step === 'cancelled'" class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  Payment was cancelled. You can try again or choose a different plan.
                </p>

                <!-- Pay button -->
                <button
                  type="button"
                  class="clay-btn mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-accent py-3.5 text-sm font-extrabold tracking-wide text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                  :disabled="!canPay"
                  :class="{ 'cursor-not-allowed opacity-50': !canPay }"
                  @click="pay"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Pay {{ currency(total) }}
                </button>
                <p class="mt-2.5 text-center text-[11px] text-brand-dark/40">
                  Secured by Paystack · Instant ticket delivery
                </p>
              </template>

              <!-- ── STEP: processing (creating order) ─────────── -->
              <div v-else-if="step === 'processing'" class="flex flex-col items-center py-12 text-center">
                <div class="h-12 w-12 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
                <p class="font-heading mt-5 text-base font-bold text-brand">Preparing payment…</p>
                <p class="mt-1 max-w-[16rem] text-xs text-brand-dark/50">
                  Setting up your order and payment form.
                </p>
              </div>

              <!-- ── STEP: polling (waiting for webhook) ───────── -->
              <div v-else-if="step === 'polling'" class="flex flex-col items-center py-12 text-center">
                <div class="relative">
                  <div class="h-12 w-12 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
                  <svg class="absolute inset-0 m-auto h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p class="font-heading mt-5 text-base font-bold text-brand">Confirming payment…</p>
                <p class="mt-1 max-w-[16rem] text-xs text-brand-dark/50">
                  We're verifying your payment. This usually takes a few seconds.
                </p>
                <p class="mt-3 text-[11px] text-brand-dark/35">
                  Please don't close this window.
                </p>
                <p class="mt-2 text-[10px] text-brand-dark/30">
                  Timeout in {{ Math.max(0, Math.ceil((POLL_TIMEOUT - pollCount * POLL_INTERVAL) / 1000)) }}s
                </p>
              </div>

              <!-- ── STEP: success ─────────────────────────────── -->
              <div v-else-if="step === 'success'" class="flex flex-col items-center py-6 text-center sm:py-8">
                <div class="clay-sm flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
                  <svg class="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p class="font-heading mt-4 text-base font-bold text-brand">
                  {{ quantity }} × {{ selectedPlan.plan_label || selectedPlan.label }} ticket{{ quantity > 1 ? 's' : '' }}
                </p>
                <p class="mt-1 max-w-[18rem] text-sm text-brand-dark/55">
                  Payment confirmed! Here are your access codes.
                </p>

                <!-- Access details (save for later) -->
                <div class="clay-well mt-4 w-full rounded-2xl bg-brand/[0.04] p-4">
                  <p class="text-left text-[11px] font-bold tracking-widest text-brand uppercase">
                    🔑 Save these to access your purchase later
                  </p>
                  <div class="mt-2 space-y-1.5">
                    <div v-if="paystackRef" class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                      <div class="min-w-0 flex-1">
                        <span class="block text-[10px] font-bold text-brand-dark/40 uppercase">Reference</span>
                        <span class="block truncate font-mono text-xs font-bold text-brand">{{ paystackRef }}</span>
                      </div>
                      <button type="button"
                        class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15"
                        @click="copyField(paystackRef, 'ref')">
                        {{ copiedField === 'ref' ? '✓' : 'Copy' }}
                      </button>
                    </div>
                    <div v-if="accessKey" class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                      <div class="min-w-0 flex-1">
                        <span class="block text-[10px] font-bold text-brand-dark/40 uppercase">Access Key</span>
                        <span class="block truncate font-mono text-[11px] font-bold text-brand">{{ accessKey }}</span>
                      </div>
                      <button type="button"
                        class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15"
                        @click="copyField(accessKey, 'key')">
                        {{ copiedField === 'key' ? '✓' : 'Copy' }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Access tickets -->
                <div class="clay-well mt-3 w-full rounded-2xl bg-brand/[0.04] p-4">
                  <p class="text-left text-[11px] font-bold tracking-widest text-brand uppercase">
                    Your tickets
                  </p>
                  <ul class="mt-2 space-y-1.5">
                    <li
                      v-for="(token, i) in accessCodes"
                      :key="token.code"
                      class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-sm"
                    >
                      <div class="min-w-0 flex-1">
                        <span class="block truncate font-mono text-xs font-bold text-brand">{{ token.code }}</span>
                      </div>
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15 active:scale-95"
                        @click="copyCode(token.code, i)"
                      >
                        <svg v-if="copiedIndex !== i" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect width="14" height="14" x="8" y="8" rx="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                        <svg v-else class="h-3 w-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {{ copiedIndex === i ? 'Copied!' : 'Copy' }}
                      </button>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  class="clay-btn mt-5 w-full rounded-2xl bg-gradient-to-r from-brand to-accent py-3 text-sm font-extrabold tracking-wide text-white"
                  @click="$emit('close')"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
