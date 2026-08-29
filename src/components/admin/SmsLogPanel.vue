<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { adminApi } from '../../services/api'
import Pagination from './Pagination.vue'

const logs = ref([])
const summary = ref({})
const loading = ref(true)
const meta = ref({ page: 1, per_page: 20, total: 0, pages: 0 })
const currentPage = ref(1)

const filterStatus = ref('all')
const filterPhone = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const today = new Date().toISOString().slice(0, 10)
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
const datePreset = ref('7d')

const currency = (value) => `₵${Number(value).toFixed(2)}`

const statusColor = {
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-600',
  rate_limited: 'bg-amber-50 text-amber-700',
  insufficient_balance: 'bg-purple-50 text-purple-700',
}

const statusLabel = {
  sent: 'Sent',
  failed: 'Failed',
  rate_limited: 'Rate Limited',
  insufficient_balance: 'Low Balance',
}

const fetchLogs = async (resetPage = false) => {
  if (resetPage) currentPage.value = 1
  loading.value = true
  try {
    const params = { page: currentPage.value, per_page: 20 }
    if (filterStatus.value !== 'all') params.status = filterStatus.value
    if (filterPhone.value.trim()) params.phone = filterPhone.value.trim()
    if (dateFrom.value) params.from = dateFrom.value
    if (dateTo.value) params.to = dateTo.value

    const res = await adminApi.getSmsLog(params)
    const data = res.data || res
    logs.value = data.data || data.logs || []
    summary.value = data.summary || {}
    meta.value = data.meta || { page: 1, per_page: 20, total: 0, pages: 0 }
  } catch (err) {
    console.error('Failed to load SMS logs:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchLogs())

watch([filterStatus], () => fetchLogs(true))

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
  fetchLogs(true)
}

const formatDate = (d) => d ? d.slice(0, 16).replace('T', ' ') : '—'

const truncate = (str, len = 60) => {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '…' : str
}
</script>

<template>
  <div class="space-y-4">
    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="clay rounded-2xl bg-surface p-4 text-center">
        <p class="font-heading text-2xl font-black text-emerald-600">{{ summary.sent || 0 }}</p>
        <p class="text-[10px] font-bold text-brand-dark/40 uppercase tracking-wider">Sent</p>
      </div>
      <div class="clay rounded-2xl bg-surface p-4 text-center">
        <p class="font-heading text-2xl font-black text-red-500">{{ summary.failed || 0 }}</p>
        <p class="text-[10px] font-bold text-brand-dark/40 uppercase tracking-wider">Failed</p>
      </div>
      <div class="clay rounded-2xl bg-surface p-4 text-center">
        <p class="font-heading text-2xl font-black text-amber-600">{{ summary.rate_limited || 0 }}</p>
        <p class="text-[10px] font-bold text-brand-dark/40 uppercase tracking-wider">Rate Limited</p>
      </div>
      <div class="clay rounded-2xl bg-surface p-4 text-center">
        <p class="font-heading text-2xl font-black text-purple-600">{{ summary.insufficient_balance || 0 }}</p>
        <p class="text-[10px] font-bold text-brand-dark/40 uppercase tracking-wider">Low Balance</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">
          SMS Log
          <span class="text-brand-dark/35">({{ meta.total }} total)</span>
        </h3>
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
          @change="datePreset = ''; fetchLogs(true)" />
        <span class="text-[10px] text-brand-dark/35">to</span>
        <input v-model="dateTo" type="date"
          class="rounded-xl border border-brand/10 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          @change="datePreset = ''; fetchLogs(true)" />
      </div>

      <!-- Row 2: Status + Phone search -->
      <div class="mt-2 flex flex-wrap gap-2">
        <select v-model="filterStatus"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          @change="fetchLogs(true)">
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="rate_limited">Rate Limited</option>
          <option value="insufficient_balance">Low Balance</option>
        </select>
        <div class="relative">
          <input v-model="filterPhone" type="text" placeholder="Search phone…"
            class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 pl-7 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none"
            @keyup.enter="fetchLogs(true)" />
          <svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-dark/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="h-6 w-6 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
    </div>

    <!-- SMS log table -->
    <div v-else class="clay overflow-hidden rounded-2xl bg-surface p-4 sm:p-5">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-brand/10 text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">
              <th class="px-3 py-2.5">Date</th>
              <th class="px-3 py-2.5">Phone</th>
              <th class="px-3 py-2.5">Order</th>
              <th class="px-3 py-2.5">Location</th>
              <th class="px-3 py-2.5">Plan</th>
              <th class="px-3 py-2.5">Status</th>
              <th class="px-3 py-2.5">Attempts</th>
              <th class="px-3 py-2.5">Error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id" class="border-b border-brand/5 transition hover:bg-brand/[0.02]">
              <td class="whitespace-nowrap px-3 py-2.5 font-medium text-brand-dark/65">{{ formatDate(log.created_at) }}</td>
              <td class="px-3 py-2.5">
                <span class="font-mono text-[11px] font-bold text-brand/80">{{ log.phone }}</span>
              </td>
              <td class="px-3 py-2.5">
                <span class="rounded-md bg-brand/[0.06] px-2 py-0.5 font-mono text-[11px] font-bold text-brand/80">
                  {{ log.paystack_ref || '—' }}
                </span>
                <span class="block text-[10px] text-brand-dark/35">{{ currency(log.total_amount) }}</span>
              </td>
              <td class="px-3 py-2.5 font-medium text-brand-dark/65">{{ log.location_name || '—' }}</td>
              <td class="px-3 py-2.5 font-medium text-brand-dark/65">{{ log.plan_label || '—' }}</td>
              <td class="px-3 py-2.5">
                <span :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold', statusColor[log.status] || 'bg-gray-50 text-gray-600']">
                  {{ statusLabel[log.status] || log.status }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-center font-bold text-brand-dark/70">{{ log.attempts }}</td>
              <td class="px-3 py-2.5 max-w-[200px]">
                <span v-if="log.error_message" class="text-[10px] text-red-500" :title="log.error_message">
                  {{ truncate(log.error_message, 40) }}
                </span>
                <span v-else class="text-brand-dark/30">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!loading && !logs.length" class="py-12 text-center text-xs font-semibold text-brand-dark/35">
        No SMS logs match your filters.
      </p>

      <!-- Pagination -->
      <Pagination
        :page="meta.page"
        :total-pages="meta.pages"
        :total="meta.total"
        :per-page="meta.per_page"
        @update:page="(p) => { currentPage = p; fetchLogs() }"
      />
    </div>
  </div>
</template>
