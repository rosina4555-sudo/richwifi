<script setup>
import { ref, computed } from 'vue'
import { store, DURATION_PLANS, currency } from '../../data/store'
import { exportCsv } from '../../services/csv'

const filterLoc = ref('all')
const filterPlan = ref('all')
const dateRange = ref('30d') // '7d' | '30d' | 'all'

const now = Date.now()
const dateFrom = computed(() => {
  if (dateRange.value === 'all') return 0
  const d = new Date()
  d.setDate(d.getDate() - (dateRange.value === '7d' ? 7 : 30))
  return d.getTime()
})

const filteredSales = computed(() => {
  let sales = [...store.sales].sort((a, b) => new Date(b.date) - new Date(a.date))
  if (filterLoc.value !== 'all') sales = sales.filter((s) => s.locationId === filterLoc.value)
  if (filterPlan.value !== 'all') sales = sales.filter((s) => s.planId === filterPlan.value)
  sales = sales.filter((s) => new Date(s.date).getTime() >= dateFrom.value)
  return sales
})

const totalRevenue = computed(() => filteredSales.value.reduce((s, x) => s + x.total, 0))
const totalTokens = computed(() => filteredSales.value.reduce((s, x) => s + x.quantity, 0))
const avgOrder = computed(() => filteredSales.value.length ? +(totalRevenue.value / filteredSales.value.length).toFixed(2) : 0)

const locName = (id) => store.locations.find((l) => l.id === id)?.name || '—'
const planLabel = (id) => DURATION_PLANS.find((p) => p.id === id)?.label || '—'

const exportSales = () => {
  const headers = ['Date', 'Reference', 'Location', 'Plan', 'Qty', 'Total', 'Email']
  const rows = filteredSales.value.map((s) => ({
    Date: s.date?.slice(0, 16).replace('T', ' '),
    Reference: s.ref,
    Location: locName(s.locationId),
    Plan: planLabel(s.planId),
    Qty: s.quantity,
    Total: currency(s.total),
    Email: s.email || '(not provided)',
  }))
  exportCsv(`richwifi-sales-${Date.now()}.csv`, headers, rows)
}

const datePresets = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- Filters + summary -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">
          Sales Records
          <span class="text-brand-dark/35">({{ filteredSales.length }})</span>
        </h3>
        <button
          type="button"
          class="clay-btn-light rounded-lg bg-brand/[0.06] px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand/10"
          @click="exportSales"
        >
          ↓ Export CSV
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <!-- Date range -->
        <div class="flex overflow-hidden rounded-xl border border-brand/15">
          <button
            v-for="p in datePresets"
            :key="p.id"
            type="button"
            class="px-3 py-1.5 text-[11px] font-bold transition"
            :class="dateRange === p.id ? 'bg-gradient-to-r from-brand to-accent text-white' : 'bg-surface text-brand-dark/55 hover:bg-brand/5'"
            @click="dateRange = p.id"
          >
            {{ p.label }}
          </button>
        </div>
        <select v-model="filterLoc" class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All locations</option>
          <option v-for="l in store.locations" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-model="filterPlan" class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All plans</option>
          <option v-for="p in DURATION_PLANS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </div>

      <!-- Running totals -->
      <div class="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-brand/[0.03] p-3">
        <div class="text-center">
          <p class="font-heading text-lg font-black text-brand">{{ currency(totalRevenue).slice(1) }}</p>
          <p class="text-[10px] font-bold text-brand-dark/40">Revenue</p>
        </div>
        <div class="text-center">
          <p class="font-heading text-lg font-black text-brand">{{ totalTokens }}</p>
          <p class="text-[10px] font-bold text-brand-dark/40">Tokens sold</p>
        </div>
        <div class="text-center">
          <p class="font-heading text-lg font-black text-brand">{{ currency(avgOrder).slice(1) }}</p>
          <p class="text-[10px] font-bold text-brand-dark/40">Avg order</p>
        </div>
      </div>
    </div>

    <!-- Sales table -->
    <div class="clay overflow-hidden rounded-2xl bg-surface">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-brand/10 text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">
              <th class="px-4 py-2.5">Date</th>
              <th class="px-4 py-2.5">Reference</th>
              <th class="px-4 py-2.5">Location</th>
              <th class="px-4 py-2.5">Plan</th>
              <th class="px-4 py-2.5 text-right">Qty</th>
              <th class="px-4 py-2.5 text-right">Total</th>
              <th class="px-4 py-2.5">Email</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in filteredSales"
              :key="s.id"
              class="border-b border-brand/5 transition hover:bg-brand/[0.02]"
            >
              <td class="whitespace-nowrap px-4 py-2.5 font-medium text-brand-dark/65">
                {{ s.date?.slice(0, 10) }}
              </td>
              <td class="px-4 py-2.5">
                <span class="rounded-md bg-brand/[0.06] px-2 py-0.5 font-mono text-[11px] font-bold text-brand/80">
                  {{ s.ref }}
                </span>
              </td>
              <td class="px-4 py-2.5 font-medium text-brand-dark/65">{{ locName(s.locationId) }}</td>
              <td class="px-4 py-2.5 font-medium text-brand-dark/65">{{ planLabel(s.planId) }}</td>
              <td class="px-4 py-2.5 text-right font-bold text-brand-dark/70">{{ s.quantity }}</td>
              <td class="px-4 py-2.5 text-right font-heading font-black text-brand">{{ currency(s.total) }}</td>
              <td class="px-4 py-2.5 font-medium text-brand-dark/45">{{ s.email || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!filteredSales.length" class="py-12 text-center text-xs font-semibold text-brand-dark/35">
        No sales match your filters.
      </p>
    </div>
  </div>
</template>
