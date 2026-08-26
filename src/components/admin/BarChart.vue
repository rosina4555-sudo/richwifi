<script setup>
const props = defineProps({
  data: { type: Array, required: true }, // [{label, value}]
  height: { type: String, default: '10rem' },
  barColor: { type: String, default: 'from-brand to-accent' },
})

const max = Math.max(...props.data.map((d) => d.value), 1)
</script>

<template>
  <div class="w-full">
    <div class="flex items-end gap-1.5" :style="{ height }">
      <div
        v-for="(d, i) in data"
        :key="i"
        class="group flex min-h-0 flex-1 flex-col items-center justify-end"
      >
        <div
          class="w-full rounded-t-lg bg-gradient-to-t transition-all duration-300 group-hover:opacity-90"
          :class="barColor"
          :style="{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? '4px' : '0' }"
        ></div>
      </div>
    </div>
    <div class="mt-1.5 flex gap-1.5">
      <span
        v-for="(d, i) in data"
        :key="i"
        class="flex-1 truncate text-center text-[10px] font-medium text-brand-dark/45"
      >
        {{ d.label }}
      </span>
    </div>
  </div>
</template>
