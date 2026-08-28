<script setup>
import { ref } from 'vue'
import { api } from '../services/api'

const lookupKey = ref('')
const loading = ref(false)
const error = ref('')
const order = ref(null)
const copiedCode = ref(null)

const lookup = async () => {
  const key = lookupKey.value.trim()
  if (!key) return

  loading.value = true
  error.value = ''
  order.value = null

  try {
    const res = await api.lookupOrder(key)
    if (!res.success) {
      error.value = res.error || 'No purchase found'
      return
    }
    order.value = res.data
  } catch (err) {
    error.value = err.message || 'No purchase found. Please check your access key or reference.'
  } finally {
    loading.value = false
  }
}

const currency = (v) => `₵${Number(v).toFixed(2)}`

const copyCode = async (code, i) => {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = i
    setTimeout(() => { if (copiedCode.value === i) copiedCode.value = null }, 1500)
  } catch { /* ignore */ }
}

const statusColor = (s) => ({
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-600',
  refunded: 'bg-purple-50 text-purple-700',
}[s] || 'bg-gray-50 text-gray-500')
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-brand-dark via-[#1a0008] to-[#2d000f] flex flex-col items-center px-4 py-8 sm:py-16">
    <!-- Logo / brand -->
    <div class="mb-8 text-center">
      <h1 class="font-heading text-2xl font-black tracking-tight text-white sm:text-3xl">
        Rich<span class="text-accent">WiFi</span>
      </h1>
      <p class="mt-1 text-sm text-white/50">Access your purchase</p>
    </div>

    <!-- Lookup card -->
    <div class="clay w-full max-w-md rounded-3xl bg-surface p-6 sm:p-8">
      <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
        🔑 Find My Purchase
      </h2>
      <p class="mt-1 text-xs text-brand-dark/50">
        Enter your access key or Paystack reference from your purchase confirmation.
      </p>

      <label class="mt-4 block">
        <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Access Key or Reference</span>
        <input
          v-model="lookupKey"
          type="text"
          placeholder="e.g. ak_40D3FC24FCE60CAAE… or RW-TKFZ5J"
          class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none"
          @keyup.enter="lookup"
        />
      </label>

      <button
        type="button"
        class="clay-btn mt-4 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-3 text-sm font-extrabold text-white disabled:opacity-40"
        :disabled="!lookupKey.trim() || loading"
        @click="lookup"
      >
        {{ loading ? 'Looking up…' : 'Find Purchase' }}
      </button>

      <!-- Error -->
      <p v-if="error" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
        {{ error }}
      </p>

      <!-- Order result -->
      <div v-if="order" class="mt-5 space-y-4">
        <!-- Status + meta -->
        <div class="rounded-2xl bg-brand/[0.04] p-4">
          <div class="flex items-center justify-between">
            <p class="font-heading text-base font-bold text-brand">Your Purchase</p>
            <span :class="['inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase', statusColor(order.status)]">
              {{ order.status }}
            </span>
          </div>
          <div class="mt-3 space-y-1.5 text-xs">
            <div class="flex justify-between">
              <span class="text-brand-dark/50">Location</span>
              <span class="font-semibold text-brand-dark/80">{{ order.location }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-brand-dark/50">Plan</span>
              <span class="font-semibold text-brand-dark/80">{{ order.plan }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-brand-dark/50">Amount</span>
              <span class="font-bold text-brand">{{ currency(order.amount) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-brand-dark/50">Reference</span>
              <span class="font-mono font-semibold text-brand-dark/80">{{ order.reference }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-brand-dark/50">Purchased</span>
              <span class="text-brand-dark/70">{{ order.purchasedAt }}</span>
            </div>
          </div>
        </div>

        <!-- Tickets -->
        <div v-if="order.tokens && order.tokens.length" class="rounded-2xl bg-brand/[0.04] p-4">
          <p class="text-[11px] font-bold tracking-widest text-brand uppercase">Your Tickets</p>
          <ul class="mt-2 space-y-1.5">
            <li
              v-for="(token, i) in order.tokens"
              :key="token.code"
              class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-sm"
            >
              <div class="min-w-0 flex-1">
                <span class="block truncate font-mono text-sm font-bold text-brand">{{ token.code }}</span>
              </div>
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15"
                @click="copyCode(token.code, i)"
              >
                {{ copiedCode === i ? '✓ Copied' : 'Copy' }}
              </button>
            </li>
          </ul>
        </div>

        <!-- Pending / not paid -->
        <div v-else-if="order.status === 'pending'" class="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Payment is still pending. Your tickets will appear here once payment is confirmed.
        </div>
      </div>
    </div>

    <!-- Back to home -->
    <a href="#/" class="mt-6 text-xs font-semibold text-white/40 transition hover:text-white/70">
      ← Back to Hotspots
    </a>
  </div>
</template>
