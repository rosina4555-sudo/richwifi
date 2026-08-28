<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, required: true }, // [{label, value}]
  height: { type: String, default: '14rem' },
  barColor: { type: String, default: 'from-brand to-accent' },
  currency: { type: Boolean, default: false }, // prefix values with ₵
})

const max = computed(() => Math.max(...props.data.map((d) => d.value), 1))

// Y-axis labels (5 lines: 100%, 75%, 50%, 25%, 0%)
const yLabels = computed(() => {
  const m = max.value
  const suffix = props.currency ? '₵' : ''
  return [
    `${suffix}${m.toFixed(0)}`,
    `${suffix}${(m * 0.75).toFixed(0)}`,
    `${suffix}${(m * 0.5).toFixed(0)}`,
    `${suffix}${(m * 0.25).toFixed(0)}`,
    '0',
  ]
})

const formatValue = (v) => {
  if (props.currency) return `₵${Number(v).toFixed(0)}`
  return Number(v).toFixed(0)
}

// Compute bar height percentages (absolute positioning, no flex dependency)
const barStyle = (d) => {
  const pct = max.value > 0 ? (d.value / max.value) * 100 : 0
  return {
    height: `${pct}%`,
    minHeight: d.value > 0 ? '4px' : '0',
  }
}

// Only show every other label on mobile to avoid crowding
const showLabel = (i) => {
  if (props.data.length <= 7) return true
  return i % 2 === 0
}

// Compute left position and width for each bar
const barPosition = (i) => {
  const count = props.data.length
  const gap = 4 // px gap between bars
  const totalGaps = (count - 1) * gap
  const width = `calc((100% - ${totalGaps}px) / ${count})`
  const left = `calc(${i} * (100% - ${totalGaps}px) / ${count} + ${i * gap}px)`
  return { width, left }
}
</script>

<template>
  <div class="w-full">
    <!-- Chart with Y-axis -->
    <div class="flex gap-2" :style="{ height }">
      <!-- Y-axis labels -->
      <div class="flex flex-col justify-between py-0.5 text-right" style="width: 3rem">
        <span v-for="(label, i) in yLabels" :key="i" class="text-[10px] font-medium text-brand-dark/35 leading-none">
          {{ label }}
        </span>
      </div>

      <!-- Chart area (relative container with explicit height from parent) -->
      <div class="relative flex-1 border-l border-b border-brand/10">
        <!-- Grid lines -->
        <div class="absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div v-for="i in 5" :key="i" class="border-t border-brand/5 w-full" :class="i === 5 ? 'border-transparent' : ''"></div>
        </div>

        <!-- Bars — absolutely positioned from bottom, percentage height resolves against this parent -->
        <div class="absolute inset-0 px-1 pt-0 pb-0">
          <div
            v-for="(d, i) in data"
            :key="i"
            class="group absolute bottom-0"
            :style="{
              ...barPosition(i),
              height: '100%',
            }"
          >
            <!-- Tooltip on hover -->
            <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
              <div class="rounded-lg bg-brand-dark px-2 py-1 text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                {{ formatValue(d.value) }}
              </div>
            </div>

            <!-- Bar fill -->
            <div
              class="absolute bottom-0 left-0 right-0 rounded-t-sm bg-gradient-to-t transition-all duration-300 group-hover:opacity-80"
              :class="barColor"
              :style="barStyle(d)"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- X-axis labels -->
    <div class="ml-8 mt-1.5 px-1" :style="{ position: 'relative' }">
      <div class="flex" :style="{ position: 'relative', height: '1.2rem' }">
        <span
          v-for="(d, i) in data"
          :key="i"
          class="absolute truncate text-center text-[9px] sm:text-[10px] font-medium text-brand-dark/40"
          :style="{
            ...barPosition(i),
            top: 0,
          }"
        >
          {{ showLabel(i) ? d.label : '' }}
        </span>
      </div>
    </div>
  </div>
</template>
