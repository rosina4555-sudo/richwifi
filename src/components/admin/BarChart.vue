<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, required: true }, // [{label, value}]
  height: { type: String, default: '14rem' },
  barColor: { type: String, default: 'from-brand to-accent' },
  currency: { type: Boolean, default: false }, // prefix values with ₵
})

const max = computed(() => Math.max(...props.data.map((d) => d.value), 1))

// Y-axis labels (4 lines: 0%, 25%, 50%, 75%, 100%)
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

// Only show every other label on mobile to avoid crowding
const showLabel = (i) => {
  if (props.data.length <= 7) return true
  return i % 2 === 0
}
</script>

<template>
  <div class="w-full">
    <div class="flex gap-2" :style="{ height }">
      <!-- Y-axis -->
      <div class="flex flex-col justify-between py-0.5 text-right" style="width: 3rem">
        <span v-for="(label, i) in yLabels" :key="i" class="text-[10px] font-medium text-brand-dark/35 leading-none">
          {{ label }}
        </span>
      </div>

      <!-- Chart area -->
      <div class="relative flex-1 border-l border-b border-brand/10">
        <!-- Grid lines -->
        <div class="absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div v-for="i in 5" :key="i" class="border-t border-brand/5 w-full" :class="i === 5 ? 'border-transparent' : ''"></div>
        </div>

        <!-- Bars -->
        <div class="absolute inset-0 flex items-end gap-[2px] sm:gap-1 px-1 pb-0">
          <div
            v-for="(d, i) in data"
            :key="i"
            class="group relative flex min-h-0 flex-1 flex-col items-center justify-end cursor-pointer"
          >
            <!-- Value tooltip on hover -->
            <div class="absolute bottom-full mb-1 hidden group-hover:block z-10">
              <div class="rounded-lg bg-brand-dark px-2 py-1 text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                {{ formatValue(d.value) }}
              </div>
            </div>

            <!-- Bar -->
            <div
              class="w-full rounded-t-sm bg-gradient-to-t transition-all duration-300 group-hover:opacity-80 group-hover:scale-x-110"
              :class="barColor"
              :style="{
                height: `${max > 0 ? (d.value / max) * 100 : 0}%`,
                minHeight: d.value > 0 ? '3px' : '0',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- X-axis labels -->
    <div class="flex gap-[2px] sm:gap-1 ml-8 mt-1.5 px-1">
      <span
        v-for="(d, i) in data"
        :key="i"
        class="flex-1 truncate text-center text-[9px] sm:text-[10px] font-medium text-brand-dark/40"
      >
        {{ showLabel(i) ? d.label : '' }}
      </span>
    </div>
  </div>
</template>
