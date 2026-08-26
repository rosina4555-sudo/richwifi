<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { login, isAuthenticated, remainingLockoutSeconds } from '../services/auth'
import logo from '../assets/logo.png'

const emit = defineEmits(['authenticated'])

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const lockout = ref(remainingLockoutSeconds())
const showPassword = ref(false)

let lockTimer = null
onMounted(async () => {
  if (await isAuthenticated()) {
    emit('authenticated')
    return
  }
  // Tick lockout countdown
  lockTimer = setInterval(() => {
    lockout.value = remainingLockoutSeconds()
  }, 1000)
})
onUnmounted(() => clearInterval(lockTimer))

const submit = async () => {
  if (loading.value || lockout.value > 0) return
  error.value = ''
  loading.value = true
  try {
    const res = await login(email.value, password.value)
    if (res.ok) {
      emit('authenticated')
    } else {
      error.value = res.error
      lockout.value = remainingLockoutSeconds()
    }
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-brand-dark/[0.03] px-4">
    <!-- Card -->
    <div class="clay w-full max-w-sm rounded-3xl bg-surface p-6 sm:p-8">
      <!-- Header -->
      <div class="flex flex-col items-center text-center">
        <a href="#" class="mb-4">
          <img :src="logo" alt="RichWiFi" class="h-8 w-auto max-w-[10rem] object-contain" draggable="false" />
        </a>
        <div class="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 mb-1">
          <svg class="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span class="text-[10px] font-extrabold tracking-widest text-brand uppercase">Admin Access</span>
        </div>
        <p class="text-xs text-brand-dark/50">Sign in to manage your dashboard</p>
      </div>

      <!-- Error -->
      <div v-if="error" class="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
        {{ error }}
      </div>

      <!-- Lockout banner -->
      <div v-if="lockout > 0" class="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-center text-xs font-semibold text-amber-700">
        <svg class="mx-auto mb-1 h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
        Too many failed attempts.<br />
        Try again in <span class="font-black">{{ lockout }}s</span>.
      </div>

      <!-- Form -->
      <form class="mt-5 space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="text-[11px] font-bold tracking-widest text-brand uppercase">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="admin@richwifi.com"
            :disabled="loading || lockout > 0"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-3 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:bg-surface focus:ring-2 focus:ring-brand/30 focus:outline-none disabled:opacity-50"
          />
        </label>

        <label class="block">
          <span class="text-[11px] font-bold tracking-widest text-brand uppercase">Password</span>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              :disabled="loading || lockout > 0"
              class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-3 pr-10 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:bg-surface focus:ring-2 focus:ring-brand/30 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              class="absolute top-1/2 right-3 -translate-y-1/2 text-brand-dark/30 transition hover:text-brand-dark/60"
              tabindex="-1"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a12.72 12.72 0 0 1-1.78 3.26" />
                <path d="M2 2l20 20" /><path d="M6.71 6.71A12.46 12.46 0 0 1 12 5c7 0 11 8 11 8a12.3 12.3 0 0 1-3.54 5.27" />
              </svg>
            </button>
          </div>
        </label>

        <button
          type="submit"
          :disabled="loading || lockout > 0 || !email.trim() || !password.trim()"
          class="clay-btn mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent py-3 text-sm font-extrabold tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg v-if="loading" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
            <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" class="opacity-75" />
          </svg>
          <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <p class="mt-5 text-center text-[11px] text-brand-dark/35">
        Authorized personnel only. Sessions expire after 4 hours.
      </p>
    </div>

    <a href="#" class="mt-4 text-xs font-semibold text-brand-dark/40 transition hover:text-accent">
      ← Back to RichWiFi
    </a>
  </div>
</template>
