<script setup>
import { ref, computed } from 'vue'
import { store, addTokenBatch, DURATION_PLANS } from '../../data/store'
import { exportCsv } from '../../services/csv'

/* ── Batch creation ──────────────────────────── */
const batchForm = ref({ locationId: store.locations[0]?.id || '', planId: 'daily', quantity: 10 })
const batchResult = ref(null)
const batchCount = ref(0)

const createBatch = () => {
  if (!batchForm.value.locationId || !batchForm.value.planId || batchForm.value.quantity < 1) return
  const batch = addTokenBatch(batchForm.value)
  batchResult.value = batch
  batchCount.value = batch.length
  setTimeout(() => { batchResult.value = null }, 4000)
}

/* ── Inventory filters ───────────────────────── */
const filterLoc = ref('all')
const filterStatus = ref('all')
const filterSearch = ref('')

const filteredTokens = computed(() => {
  let tokens = [...store.tokens]
  if (filterLoc.value !== 'all') tokens = tokens.filter((t) => t.locationId === filterLoc.value)
  if (filterStatus.value !== 'all') tokens = tokens.filter((t) => t.status === filterStatus.value)
  if (filterSearch.value.trim()) {
    const q = filterSearch.value.trim().toLowerCase()
    tokens = tokens.filter((t) => t.code.toLowerCase().includes(q))
  }
  return tokens.slice(-200) // show last 200 for performance
})

const statusColor = (s) => ({
  available: 'bg-emerald-50 text-emerald-700',
  sold: 'bg-brand/10 text-brand/80',
  used: 'bg-brand-dark/10 text-brand-dark/50',
}[s] || 'bg-gray-50 text-gray-500')

const locName = (id) => store.locations.find((l) => l.id === id)?.name || '—'
const planLabel = (id) => DURATION_PLANS.find((p) => p.id === id)?.label || '—'

const exportInventory = () => {
  const headers = ['Code', 'Location', 'Plan', 'Status', 'Created', 'Sold']
  const rows = filteredTokens.value.map((t) => ({
    Code: t.code,
    Location: locName(t.locationId),
    Plan: planLabel(t.planId),
    Status: t.status,
    Created: t.createdAt?.slice(0, 10),
    Sold: t.soldAt?.slice(0, 10) || '',
  }))
  exportCsv(`richwifi-tokens-${Date.now()}.csv`, headers, rows)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Batch creator -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <h3 class="font-heading text-sm font-bold tracking-tight text-brand">Generate Token Batch</h3>
      <div class="mt-3 flex flex-wrap items-end gap-3">
        <label class="flex-1 min-w-[8rem]">
          <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Location</span>
          <select
            v-model="batchForm.locationId"
            class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none"
          >
            <option v-for="l in store.locations" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
        </label>
        <label class="flex-1 min-w-[7rem]">
          <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Plan</span>
          <select
            v-model="batchForm.planId"
            class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none"
          >
            <option v-for="p in DURATION_PLANS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <label class="w-24">
          <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Qty</span>
          <input
            v-model.number="batchForm.quantity"
            type="number"
            min="1"
            max="500"
            class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none"
          />
        </label>
        <button
          type="button"
          class="clay-btn rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-2 text-xs font-extrabold text-white disabled:opacity-40"
          :disabled="!batchForm.locationId"
          @click="createBatch"
        >
          Generate
        </button>
      </div>
      <p
        v-if="batchCount"
        class="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
      >
        ✓ {{ batchCount }} tokens generated successfully
      </p>
    </div>

    <!-- Inventory table -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">
          Token Inventory
          <span class="text-brand-dark/35">({{ filteredTokens.length }})</span>
        </h3>
        <button
          type="button"
          class="clay-btn-light rounded-lg bg-brand/[0.06] px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand/10"
          @click="exportInventory"
        >
          ↓ Export CSV
        </button>
      </div>

      <!-- Filters -->
      <div class="mb-3 flex flex-wrap gap-2">
        <select v-model="filterLoc" class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All locations</option>
          <option v-for="l in store.locations" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-model="filterStatus" class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
        </select>
        <input
          v-model="filterSearch"
          type="search"
          placeholder="Search codes…"
          class="w-40 rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-brand/10 text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">
              <th class="px-3 py-2">Code</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2">Plan</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in filteredTokens"
              :key="t.id"
              class="border-b border-brand/5 transition hover:bg-brand/[0.02]"
            >
              <td class="px-3 py-2 font-mono font-bold text-brand">{{ t.code }}</td>
              <td class="px-3 py-2 font-medium text-brand-dark/65">{{ locName(t.locationId) }}</td>
              <td class="px-3 py-2 font-medium text-brand-dark/65">{{ planLabel(t.planId) }}</td>
              <td class="px-3 py-2">
                <span :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold', statusColor(t.status)]">
                  {{ t.status }}
                </span>
              </td>
              <td class="px-3 py-2 text-brand-dark/45">{{ t.createdAt?.slice(0, 10) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!filteredTokens.length" class="py-8 text-center text-xs font-semibold text-brand-dark/35">No tokens match your filters.</p>
    </div>
  </div>
</template>
