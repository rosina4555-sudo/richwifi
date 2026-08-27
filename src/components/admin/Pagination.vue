<script setup>
const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, default: 0 },
  perPage: { type: Number, default: 20 },
})

const emit = defineEmits(['update:page'])

const goTo = (p) => {
  if (p >= 1 && p <= props.totalPages && p !== props.page) {
    emit('update:page', p)
  }
}

// Generate visible page numbers
const visiblePages = computed(() => {
  const pages = []
  const total = props.totalPages
  const current = props.page

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) pages.push('...')
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (current < total - 2) pages.push('...')
    pages.push(total)
  }
  return pages
})

import { computed } from 'vue'
</script>

<template>
  <div v-if="totalPages > 1" class="flex flex-wrap items-center justify-between gap-3 pt-3">
    <p class="text-[11px] font-medium text-brand-dark/45">
      {{ total }} total · Page {{ page }} of {{ totalPages }}
    </p>
    <div class="flex items-center gap-1">
      <!-- Prev -->
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition"
        :class="page <= 1 ? 'text-brand-dark/20 cursor-not-allowed' : 'text-brand-dark/60 hover:bg-brand/5 hover:text-brand'"
        :disabled="page <= 1"
        @click="goTo(page - 1)"
      >
        ‹
      </button>
      <!-- Pages -->
      <template v-for="(p, i) in visiblePages" :key="i">
        <span v-if="p === '...'" class="px-1 text-xs text-brand-dark/30">…</span>
        <button
          v-else
          type="button"
          class="flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-1.5 text-xs font-bold transition"
          :class="p === page
            ? 'bg-gradient-to-r from-brand to-accent text-white shadow-sm'
            : 'text-brand-dark/55 hover:bg-brand/5 hover:text-brand'"
          @click="goTo(p)"
        >
          {{ p }}
        </button>
      </template>
      <!-- Next -->
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition"
        :class="page >= totalPages ? 'text-brand-dark/20 cursor-not-allowed' : 'text-brand-dark/60 hover:bg-brand/5 hover:text-brand'"
        :disabled="page >= totalPages"
        @click="goTo(page + 1)"
      >
        ›
      </button>
    </div>
  </div>
</template>
