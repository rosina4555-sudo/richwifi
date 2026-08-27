<script setup>
import { computed } from 'vue'

const props = defineProps({
  location: Object,
  featured: { type: Boolean, default: false },
})

const currency = (value) => `₵${Number(value).toFixed(2)}`

// Compute total available stock from all plans
const totalStock = computed(() => {
  const plans = props.location.plans || props.location.availableTokens || []
  return plans.reduce((sum, p) => sum + Number(p.available_stock ?? p.availableStock ?? 0), 0)
})
</script>

<template>
  <article
    :class="[
      'clay group mx-auto flex max-w-md flex-col overflow-hidden rounded-3xl border border-brand/10 bg-surface text-brand-dark transition-transform duration-300 hover:-translate-y-1 md:mx-0 md:max-w-none',
      featured ? 'ring-2 ring-brand/20' : '',
    ]"
  >
    <!-- Clay gradient cap -->
    <div class="relative shrink-0 px-4 pt-4">
      <div
        class="relative flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br sm:h-28"
        :class="location.theme_color || location.color_css || location.color"
      >
        <div
          class="pointer-events-none absolute inset-x-3 top-1.5 h-6 rounded-full bg-white/25 blur-md"
        ></div>
        <svg
          class="h-9 w-9 text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.25"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <span
        class="clay-sm absolute top-6 right-5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        :class="totalStock > 0 ? 'bg-surface text-brand' : 'bg-red-50 text-red-600'"
      >
        {{ totalStock }} left
      </span>
    </div>

    <!-- Body -->
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div class="flex shrink-0 items-start justify-between gap-2">
        <div class="min-w-0">
          <h2
            class="font-heading truncate text-lg font-bold tracking-tight text-brand transition-colors group-hover:text-accent sm:text-xl"
          >
            {{ location.name }}
          </h2>
          <p class="mt-0.5 truncate text-xs font-medium text-brand-dark/55">
            {{ location.address }}
          </p>
        </div>
        <span
          v-if="featured"
          class="shrink-0 rounded-full bg-gradient-to-r from-brand to-accent px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase"
        >
          Popular
        </span>
      </div>

      <!-- Plans with per-plan stock -->
      <ul class="mt-2.5 space-y-1.5">
        <li
          v-for="d in (location.plans || location.availableTokens || [])"
          :key="d.plan_id || d.id"
          class="clay-well flex items-center justify-between gap-3 rounded-xl bg-brand/[0.05] px-3 py-2 text-xs"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-brand-dark/75">{{ d.label || d.plan_label }}</span>
            <span
              v-if="(d.available_stock ?? d.availableStock ?? 0) > 0"
              class="text-[10px] font-semibold text-emerald-600"
            >
              {{ d.available_stock ?? d.availableStock }} avail
            </span>
            <span v-else class="text-[10px] font-semibold text-red-500">Out of stock</span>
          </div>
          <span
            class="shrink-0 rounded-full bg-gradient-to-r from-brand to-accent px-2.5 py-0.5 font-extrabold text-white shadow-sm"
          >
            {{ currency(d.price) }}
          </span>
        </li>
      </ul>

      <button
        @click="$emit('buy', location)"
        :disabled="totalStock === 0"
        class="clay-btn mt-3 w-full shrink-0 rounded-2xl bg-gradient-to-r from-brand to-accent py-2.5 text-sm font-extrabold tracking-wide text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed sm:py-3"
      >
        {{ totalStock > 0 ? 'Buy Ticket →' : 'Out of Stock' }}
      </button>
    </div>
  </article>
</template>
