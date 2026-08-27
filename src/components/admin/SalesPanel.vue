<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { adminApi } from '../../services/api'
import Pagination from './Pagination.vue'

const allOrders = ref([]) // all matching orders for stats
const pageOrders = ref([]) // current page orders for table
const locations = ref([])
const loading = ref(true)
const loadingOrders = ref(false)
const meta = ref({ page: 1, per_page: 15, total: 0, pages: 0 })

/* ── Filters ───────────────────────────────────────── */
const today = new Date().toISOString().slice(0, 10)
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
const filterLoc = ref('all')
const filterPlan = ref('all')
const filterStatus = ref('all')
const dateFrom = ref(weekAgo)
const dateTo = ref(today)
const datePreset = ref('7d')
const currentPage = ref(1)

const currency = (value) => `₵${Number(value).toFixed(2)}`

/* ── Data loading ──────────────────────────────────── */
const getFilterParams = () => {
  const params = {}
  if (filterLoc.value !== 'all') params.location_id = filterLoc.value
  if (filterStatus.value !== 'all') params.status = filterStatus.value
  if (dateFrom.value) params.from = dateFrom.value
  if (dateTo.value) params.to = dateTo.value
  return params
}

const fetchLocations = async () => {
  try {
    const res = await adminApi.getLocations()
    locations.value = Array.isArray(res.data) ? res.data : (res.data?.data || res.data || [])
  } catch (err) {
    console.error('Failed to load locations:', err)
  }
}

const fetchOrders = async (showLoader = false) => {
  if (showLoader) loading.value = true
  else loadingOrders.value = true

  try {
    // Fetch current page for table
    const params = { ...getFilterParams(), page: currentPage.value, per_page: 15 }
    const res = await adminApi.getOrders(params)
    const payload = res.data || res
    pageOrders.value = Array.isArray(payload) ? payload : (payload.data || payload.orders || [])
    meta.value = res.meta || payload.meta || { page: 1, per_page: 15, total: 0, pages: 0 }

    // Fetch all for stats (no page limit)
    const statsParams = { ...getFilterParams(), per_page: 500 }
    const statsRes = await adminApi.getOrders(statsParams)
    const statsPayload = statsRes.data || statsRes
    allOrders.value = Array.isArray(statsPayload) ? statsPayload : (statsPayload.data || statsPayload.orders || [])
  } catch (err) {
    console.error('Failed to load orders:', err)
  } finally {
    loadingOrders.value = false
    loading.value = false
  }
}

onMounted(async () => {
  await fetchLocations()
  await fetchOrders(true)
})

/* ── Filter watchers ───────────────────────────────── */
watch([filterLoc, filterStatus], () => {
  currentPage.value = 1
  fetchOrders()
})

/* ── Date presets ──────────────────────────────────── */
const applyPreset = (preset) => {
  datePreset.value = preset
  const now = new Date()
  const fmt = (d) => d.toISOString().slice(0, 10)
  if (preset === 'today') {
    dateFrom.value = fmt(now)
    dateTo.value = fmt(now)
  } else if (preset === '7d') {
    dateFrom.value = fmt(new Date(now - 7 * 86400000))
    dateTo.value = fmt(now)
  } else if (preset === '30d') {
    dateFrom.value = fmt(new Date(now - 30 * 86400000))
    dateTo.value = fmt(now)
  } else if (preset === 'all') {
    dateFrom.value = ''
    dateTo.value = ''
  }
  currentPage.value = 1
  fetchOrders()
}

/* ── Client-side plan filter on stats ──────────────── */
const filteredForStats = computed(() => {
  if (filterPlan.value === 'all') return allOrders.value
  return allOrders.value.filter((o) => o.plan_label === filterPlan.value)
})

const filteredForTable = computed(() => {
  if (filterPlan.value === 'all') return pageOrders.value
  return pageOrders.value.filter((o) => o.plan_label === filterPlan.value)
})

/* ── Summary stats ─────────────────────────────────── */
const totalRevenue = computed(() =>
  filteredForStats.value.filter((o) => o.status === 'paid').reduce((s, x) => s + Number(x.total_amount || 0), 0)
)
const totalTokens = computed(() =>
  filteredForStats.value.filter((o) => o.status === 'paid').reduce((s, x) => s + Number(x.quantity || 0), 0)
)
const avgOrder = computed(() => {
  const paid = filteredForStats.value.filter((o) => o.status === 'paid')
  return paid.length ? +(totalRevenue.value / paid.length).toFixed(2) : 0
})

/* ── Helpers ───────────────────────────────────────── */
const formatDate = (d) => d ? d.slice(0, 16).replace('T', ' ') : '—'

const planLabels = computed(() => {
  const labels = new Set(allOrders.value.map((o) => o.plan_label).filter(Boolean))
  return [...labels].sort()
})

/* ── CSV Export ────────────────────────────────────── */
const exportCsv = () => {
  const headers = ['Date', 'Reference', 'Location', 'Plan', 'Qty', 'Amount', 'Status', 'Email']
  const rows = filteredForStats.value.map((o) => ({
    Date: formatDate(o.created_at),
    Reference: o.paystack_ref || '—',
    Location: o.location_name || '—',
    Plan: o.plan_label || '—',
    Qty: o.quantity || 0,
    Amount: currency(o.total_amount || 0),
    Status: o.status,
    Email: o.customer_email || '(not provided)',
  }))
  const csv = [headers.join(','), ...rows.map((r) => Object.values(r).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `richwifi-sales-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filters + summary -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">
          Sales Records
          <span class="text-brand-dark/35">({{ meta.total }} total)</span>
        </h3>
        <button type="button"
          class="clay-btn-light rounded-lg bg-brand/[0.06] px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand/10"
          @click="exportCsv">
          ↓ Export CSV
        </button>
      </div>

      <!-- Row 1: Date presets -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded-xl border border-brand/15">
          <button v-for="p in [{id:'today',label:'Today'},{id:'7d',label:'7 days'},{id:'30d',label:'30 days'},{id:'all',label:'All time'}]"
            :key="p.id" type="button"
            class="px-3 py-1.5 text-[11px] font-bold transition"
            :class="datePreset === p.id ? 'bg-gradient-to-r from-brand to-accent text-white' : 'bg-surface text-brand-dark/55 hover:bg-brand/5'"
            @click="applyPreset(p.id)">
            {{ p.label }}
          </button>
        </div>
        <span class="text-[10px] font-semibold text-brand-dark/35">or</span>
        <input v-model="dateFrom" type="date"
          class="rounded-xl border border-brand/10 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          @change="datePreset = ''; currentPage = 1; fetchOrders()" />
        <span class="text-[10px] text-brand-dark/35">to</span>
        <input v-model="dateTo" type="date"
          class="rounded-xl border border-brand/10 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          @change="datePreset = ''; currentPage = 1; fetchOrders()" />
      </div>

      <!-- Row 2: Location, Plan, Status -->
      <div class="mt-2 flex flex-wrap gap-2">
        <select v-model="filterLoc"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All locations</option>
          <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-model="filterPlan"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All plans</option>
          <option v-for="p in planLabels" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterStatus"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
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

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="h-6 w-6 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
    </div>

    <!-- Sales table -->
    <div v-else class="clay overflow-hidden rounded-2xl bg-surface p-4 sm:p-5">
      <div v-if="loadingOrders" class="flex items-center justify-center py-2">
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-brand/15 border-t-brand"></div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-brand/10 text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">
              <th class="px-3 py-2.5">Date</th>
              <th class="px-3 py-2.5">Reference</th>
              <th class="px-3 py-2.5">Location</th>
              <th class="px-3 py-2.5">Plan</th>
              <th class="px-3 py-2.5 text-right">Qty</th>
              <th class="px-3 py-2.5 text-right">Amount</th>
              <th class="px-3 py-2.5">Status</th>
              <th class="px-3 py-2.5">Email</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filteredForTable" :key="o.id" class="border-b border-brand/5 transition hover:bg-brand/[0.02]">
              <td class="whitespace-nowrap px-3 py-2.5 font-medium text-brand-dark/65">{{ formatDate(o.created_at) }}</td>
              <td class="px-3 py-2.5">
                <span class="rounded-md bg-brand/[0.06] px-2 py-0.5 font-mono text-[11px] font-bold text-brand/80">
                  {{ o.paystack_ref || '—' }}
                </span>
              </td>
              <td class="px-3 py-2.5 font-medium text-brand-dark/65">{{ o.location_name || '—' }}</td>
              <td class="px-3 py-2.5 font-medium text-brand-dark/65">{{ o.plan_label || '—' }}</td>
              <td class="px-3 py-2.5 text-right font-bold text-brand-dark/70">{{ o.quantity || 0 }}</td>
              <td class="px-3 py-2.5 text-right font-heading font-black text-brand">{{ currency(o.total_amount || 0) }}</td>
              <td class="px-3 py-2.5">
                <span :class="[
                  'inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                  o.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                  o.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                  o.status === 'refunded' ? 'bg-purple-50 text-purple-700' :
                  'bg-red-50 text-red-600',
                ]">{{ o.status }}</span>
              </td>
              <td class="px-3 py-2.5 font-medium text-brand-dark/45">{{ o.customer_email || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!loading && !filteredForTable.length" class="py-12 text-center text-xs font-semibold text-brand-dark/35">
        No sales match your filters.
      </p>

      <!-- Pagination -->
      <Pagination
        :page="meta.page"
        :total-pages="meta.pages"
        :total="meta.total"
        :per-page="meta.per_page"
        @update:page="(p) => { currentPage = p; fetchOrders() }"
      />
    </div>
  </div>
</template>
