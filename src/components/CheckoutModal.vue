<script setup>
import { ref, computed, watch } from 'vue'
import { initializePayment, currency } from '../services/payment'
import { recordSale } from '../data/store'

const props = defineProps({
  location: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const availableTokens = computed(() => props.location.plans || props.location.availableTokens || [])
const selectedPlanId = ref(availableTokens.value[0]?.id)
const quantity = ref(1)
const email = ref('')
const step = ref('details') // 'details' | 'processing' | 'success' | 'error'
const error = ref('')
const receipt = ref(null)
const accessCodes = ref([])
const copiedIndex = ref(null)

const MAX_QTY = Math.min(props.location.tokenCount || 10, 20)

const selectedPlan = computed(
  () =>
    availableTokens.value.find((p) => p.id === selectedPlanId.value) ||
    availableTokens.value[0],
)

const subtotal = computed(() => (selectedPlan.value?.price ?? 0) * quantity.value)
const serviceFee = computed(() => 0) // keep flat for now; Paystack fees shown at gateway
const total = computed(() => subtotal.value + serviceFee.value)

const validEmail = computed(
  () => !email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
)
const canPay = computed(() => validEmail.value && step.value !== 'processing')

const changeQty = (delta) => {
  quantity.value = Math.min(MAX_QTY, Math.max(1, quantity.value + delta))
}

const pay = async () => {
  if (!canPay.value) return
  step.value = 'processing'
  error.value = ''
  try {
    const res = await initializePayment({
      locationId: props.location.id,
      planId: selectedPlan.value.id,
      planLabel: selectedPlan.value.label,
      quantity: quantity.value,
      email: email.value.trim() || null,
      amountMinor: Math.round(total.value * 100), // Paystack expects minor units
    })
    receipt.value = res
    const { codes } = recordSale({
      locationId: props.location.id,
      planId: selectedPlan.value.id,
      quantity: quantity.value,
      email: email.value.trim() || null,
    })
    accessCodes.value = codes
    step.value = 'success'
  } catch (e) {
    error.value = e.message || 'Something went wrong. Please try again.'
    step.value = 'error'
  }
}

const resetAndClose = () => {
  if (step.value === 'processing') return
  emit('close')
}

watch(
  () => props.location,
  () => {
    selectedPlanId.value = (props.location.plans || props.location.availableTokens || [])[0]?.id
    quantity.value = 1
    step.value = 'details'
    error.value = ''
    receipt.value = null
    accessCodes.value = []
    copiedIndex.value = null
  },
)

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
            aria-label="Purchase Wi-Fi tokens"
          >
            <!-- Grab handle (mobile sheet affordance) -->
            <div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-brand/15 sm:hidden"></div>

            <!-- Header -->
            <div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
              <div class="min-w-0">
                <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
                  {{ step === 'success' ? 'Order Complete 🎉' : 'Buy Tokens' }}
                </h2>
                <p v-if="step !== 'success'" class="mt-0.5 truncate text-xs font-medium text-brand-dark/55">
                  {{ location.name }} · {{ location.address }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl p-1.5 text-brand-dark/40 transition hover:bg-brand/5 hover:text-brand"
                aria-label="Close"
                :disabled="step === 'processing'"
                @click="resetAndClose"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
              <!-- ── STEP: details ─────────────────────────────── -->
              <template v-if="step === 'details' || step === 'error'">
                <!-- Plan picker -->
                <p class="text-xs font-bold tracking-widest text-brand uppercase">Choose a plan</p>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <button
                    v-for="p in availableTokens"
                    :key="p.id"
                    type="button"
                    class="flex flex-col items-center rounded-2xl px-2 py-2.5 transition-all duration-200"
                    :class="[
                      p.id === selectedPlan.id
                        ? 'bg-gradient-to-br from-brand to-accent text-white shadow-md shadow-accent/30 ring-2 ring-accent/40'
                        : 'clay-well bg-brand/[0.05] text-brand-dark/75 hover:bg-brand/10',
                    ]"
                    @click="selectedPlanId = p.id"
                  >
                    <span class="text-xs font-extrabold">{{ p.label }}</span>
                    <span
                      class="mt-0.5 text-sm font-black"
                      :class="p.id === selectedPlan.id ? 'text-white' : 'text-brand'"
                    >
                      {{ currency(p.price) }}
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

                <!-- Email -->
                <label class="mt-4 block">
                  <span class="text-xs font-bold tracking-widest text-brand uppercase">
                    Delivery email
                    <span class="ml-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[9px] font-extrabold text-brand/70 normal-case tracking-normal">optional</span>
                  </span>
                  <input
                    v-model="email"
                    type="email"
                    autocomplete="email"
                    placeholder="you@example.com"
                    class="clay-well mt-2 w-full rounded-2xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/35 focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:outline-none"
                  />
                  <span class="mt-1.5 block text-[11px] text-brand-dark/45">
                    Leave empty to get your codes right here — or add an email and we'll send them too.
                  </span>
                </label>

                <!-- Order summary -->
                <div class="clay-well mt-4 space-y-1.5 rounded-2xl bg-brand/[0.04] p-4 text-sm">
                  <div class="flex items-center justify-between text-brand-dark/65">
                    <span>{{ selectedPlan.label }} token × {{ quantity }}</span>
                    <span class="font-semibold">{{ currency(subtotal) }}</span>
                  </div>
                  <div class="flex items-center justify-between text-brand-dark/65">
                    <span>Service fee</span>
                    <span class="font-semibold">{{ currency(serviceFee) }}</span>
                  </div>
                  <div class="mt-1 flex items-center justify-between border-t border-brand/10 pt-2">
                    <span class="font-heading text-sm font-bold text-brand">Total</span>
                    <span class="font-heading text-lg font-black text-brand">{{ currency(total) }}</span>
                  </div>
                </div>

                <p v-if="step === 'error'" class="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {{ error }}
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
                  Secured payment · Instant token delivery by email
                </p>
              </template>

              <!-- ── STEP: processing ──────────────────────────── -->
              <div v-else-if="step === 'processing'" class="flex flex-col items-center py-12 text-center">
                <div
                  class="h-12 w-12 animate-spin rounded-full border-4 border-brand/15 border-t-brand"
                ></div>
                <p class="font-heading mt-5 text-base font-bold text-brand">Processing payment…</p>
                <p class="mt-1 max-w-[16rem] text-xs text-brand-dark/50">
                  Please don't close this window while we confirm your transaction.
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
                  {{ quantity }} × {{ selectedPlan.label }} token{{ quantity > 1 ? 's' : '' }}
                </p>
                <p class="mt-1 max-w-[18rem] text-sm text-brand-dark/55">
                  {{
                    email.trim()
                      ? `Also sent to ${email.trim()}`
                      : 'Here are your access codes — copy and connect!'
                  }}
                </p>

                <!-- Access tokens -->
                <div class="clay-well mt-4 w-full rounded-2xl bg-brand/[0.04] p-4">
                  <p class="text-left text-[11px] font-bold tracking-widest text-brand uppercase">
                    Your tokens
                  </p>
                  <ul class="mt-2 space-y-1.5">
                    <li
                      v-for="(code, i) in accessCodes"
                      :key="code"
                      class="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-sm"
                    >
                      <span class="truncate font-mono text-xs font-bold text-brand">{{ code }}</span>
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.06] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/15 active:scale-95"
                        @click="copyCode(code, i)"
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

                <!-- Receipt -->
                <div class="clay-well mt-3 w-full rounded-2xl bg-brand/[0.04] p-4 text-left">
                  <div class="flex items-center justify-between text-sm text-brand-dark/65">
                    <span>Amount paid</span>
                    <span class="font-heading font-black text-brand">{{ currency(total) }}</span>
                  </div>
                  <div class="mt-1.5 flex items-center justify-between text-sm text-brand-dark/65">
                    <span>Reference</span>
                    <span class="rounded-md bg-surface px-2 py-0.5 font-mono text-xs font-bold text-brand">
                      {{ receipt?.reference }}
                    </span>
                  </div>
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
