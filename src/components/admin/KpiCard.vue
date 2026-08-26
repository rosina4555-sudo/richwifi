<script setup>
const props = defineProps({
  label: String,
  value: [String, Number],
  delta: { type: Number, default: null }, // percentage change vs previous period
  prefix: { type: String, default: '' },
})
const isPositive = (props.delta ?? 0) >= 0
</script>

<template>
  <div class="clay flex flex-col gap-1 rounded-2xl bg-surface p-4 sm:p-5">
    <p class="text-[11px] font-bold tracking-widest text-brand-dark/50 uppercase">{{ label }}</p>
    <p class="font-heading text-2xl font-black tracking-tight text-brand sm:text-3xl">
      {{ prefix }}{{ value }}
    </p>
    <span
      v-if="delta !== null"
      class="inline-flex w-fit items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
      :class="[
        isPositive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-red-50 text-red-600',
      ]"
    >
      <svg v-if="isPositive" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m18 15-6-6-6 6"/></svg>
      <svg v-else class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      {{ Math.abs(delta) }}%
    </span>
  </div>
</template>
