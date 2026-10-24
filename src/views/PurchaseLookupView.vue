<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../services/api'

const phone = ref('')
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const orders = ref([])
const copiedCode = ref(null)

const validPhone = computed(() => {
  const p = phone.value.replace(/[^0-9+]/g, '')
  // Ghana: 0XXXXXXXXX (10 digits), +233XXXXXXXXX or 233XXXXXXXXX (12 digits)
  if (/^0\d{9}$/.test(p)) return true
  if (/^233\d{9}$/.test(p)) return true
  if (/^\+233\d{9}$/.test(p)) return true
  return false
})

const lookup = async () => {
  if (!validPhone.value) return

  loading.value = true
  error.value = ''
  orders.value = []

  try {
    const res = await api.lookupTokens({ phone: phone.value.trim() })
    if (!res.success) {
      error.value = res.error || 'No purchases found'
      return
    }
    orders.value = res.data?.orders || []
    searched.value = true
  } catch (err) {
    error.value = err.message || 'Could not look up your purchases. Please try again.'
  } finally {
    loading.value = false
  }
}

// Prefill from deep link (e.g. #/my-purchases?phone=0544123456 from the
// purchase success screen) and run the lookup right away.
onMounted(() => {
  const match = window.location.hash.match(/[?&]phone=([^&]+)/)
  if (!match) return
  const p = decodeURIComponent(match[1]).replace(/[^0-9+\s]/g, '')
  if (!p) return
  phone.value = p
  if (validPhone.value) lookup()
})

const currency = (v) => `₵${Number(v).toFixed(2)}`

const formatDate = (d) => (d ? d.slice(0, 16).replace('T', ' ') : '—')

const copyCode = async (code, i) => {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = i
    setTimeout(() => { if (copiedCode.value === i) copiedCode.value = null }, 1500)
  } catch { /* clipboard unavailable */ }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-brand-dark via-[#1a0008] to-[#2d000f] flex flex-col items-center px-4 py-8 sm:py-16">
    <!-- Logo / brand -->
    <div class="mb-8 text-center">
      <h1 class="font-heading text-2xl font-black tracking-tight text-white sm:text-3xl">
        Rich<span class="text-accent">WiFi</span>
      </h1>
      <p class="mt-1 text-sm text-white/50">Find your tickets anytime</p>
    </div>

    <!-- Lookup card -->
    <div class="clay w-full max-w-md rounded-3xl bg-surface p-6 sm:p-8">
      <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
        🎫 My Purchases
      </h2>
      <p class="mt-1 text-xs text-brand-dark/50">
        Enter the phone number you paid with to see your ticket codes.
      </p>

      <label class="mt-4 block">
        <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Phone number</span>
        <input
          v-model="phone"
          type="tel"
          autocomplete="tel"
          placeholder="e.g. 0544 123 456"
          class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none"
          @keyup.enter="lookup"
        />
      </label>

      <button
        type="button"
        class="clay-btn mt-4 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-3 text-sm font-extrabold text-white disabled:opacity-40"
        :disabled="!validPhone || loading"
        @click="lookup"
      >
        {{ loading ? 'Looking up…' : 'Find My Purchases' }}
      </button>

      <p v-if="phone && !validPhone" class="mt-2 text-center text-[11px] text-red-500">
        Enter a valid Ghana phone number (e.g. 0544123456)
      </p>

      <!-- Error -->
      <p v-if="error" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
        {{ error }}
      </p>

      <!-- Empty state -->
      <p v-if="searched && !error && !orders.length" class="mt-4 rounded-xl bg-brand/[0.04] px-3 py-3 text-center text-xs font-semibold text-brand-dark/50">
        No purchases found for this phone number. Check the number and try again.
      </p>

      <!-- Orders result -->
      <div v-if="orders.length" class="mt-5 space-y-4">
        <div
          v-for="order in orders"
          :key="order.id"
          class="rounded-2xl bg-brand/[0.04] p-4"
        >
          <div>
            <p class="font-heading text-sm font-bold text-brand">{{ order.plan_label }} · {{ order.location_name }}</p>
            <p class="mt-0.5 text-[11px] text-brand-dark/45">
              {{ currency(order.total_amount) }} · {{ formatDate(order.paid_at) }}
            </p>
          </div>

          <!-- Ticket codes -->
          <ul v-if="order.tokens && order.tokens.length" class="mt-3 space-y-1.5">
            <li
              v-for="(token, i) in order.tokens"
              :key="token.code"
              class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-sm"
            >
              <div class="min-w-0 flex-1">
                <span class="block truncate font-mono text-sm font-bold text-brand">{{ token.code }}</span>
              </div>
              <span
                v-if="token.status === 'used' || token.status === 'expired'"
                class="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-600 uppercase"
              >
                {{ token.status === 'used' ? 'Used' : 'Expired' }}
              </span>
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15"
                @click="copyCode(token.code, `${order.id}-${i}`)"
              >
                {{ copiedCode === `${order.id}-${i}` ? '✓ Copied' : 'Copy' }}
              </button>
            </li>
          </ul>
          <p v-else class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
            No active tickets on this order.
          </p>
        </div>
      </div>
    </div>

    <!-- Back to home -->
    <a href="#/" class="mt-6 text-xs font-semibold text-white/40 transition hover:text-white/70">
      ← Back to Hotspots
    </a>
  </div>
</template>
