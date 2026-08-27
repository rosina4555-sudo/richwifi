<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { adminApi } from '../../services/api'
import Pagination from './Pagination.vue'

const tokens = ref([])
const locations = ref([])
const loading = ref(true)
const loadingTable = ref(false)

const meta = ref({ page: 1, per_page: 20, total: 0, pages: 0 })

/* ── Filters (server-side) ─────────────────────────── */
const filterLoc = ref('all')
const filterStatus = ref('all')
const filterSearch = ref('')
const currentPage = ref(1)

/* ── Import state ──────────────────────────────────── */
const importStep = ref('form') // 'form' | 'preview' | 'result'
const importFile = ref(null)
const importLocationId = ref('')
const importPlanId = ref('')
const previewData = ref(null)
const importLoading = ref(false)
const importResult = ref(null)
const importError = ref('')

/* ── Plans for selected location ───────────────────── */
const locationPlans = computed(() => {
  const loc = locations.value.find(l => l.id === importLocationId.value)
  return loc?.plans || []
})

/* ── Data loading ──────────────────────────────────── */
const fetchTokens = async (showLoader = false) => {
  if (showLoader) loading.value = true
  else loadingTable.value = true

  try {
    const params = { page: currentPage.value, per_page: 20 }
    if (filterLoc.value !== 'all') params.location_id = filterLoc.value
    if (filterStatus.value !== 'all') params.status = filterStatus.value

    const res = await adminApi.getTokens(params)
    const data = res.data || res
    tokens.value = Array.isArray(data) ? data : (data.data || data.tokens || [])
    meta.value = res.meta || data.meta || { page: 1, per_page: 20, total: 0, pages: 0 }
  } catch (err) {
    console.error('Failed to load tokens:', err)
  } finally {
    loading.value = false
    loadingTable.value = false
  }
}

const fetchLocations = async () => {
  try {
    const res = await adminApi.getLocations()
    const data = res.data || res
    locations.value = Array.isArray(data) ? data : (data.data || data.locations || [])
  } catch (err) {
    console.error('Failed to load locations:', err)
  }
}

onMounted(async () => {
  await fetchLocations()
  await fetchTokens(true)
})

/* ── Filter watchers ───────────────────────────────── */
watch([filterLoc, filterStatus], () => {
  currentPage.value = 1
  fetchTokens()
})

/* ── Client-side code search within current page ────── */
const displayTokens = ref([])
watch(tokens, (newTokens) => {
  if (!filterSearch.value.trim()) {
    displayTokens.value = newTokens
    return
  }
  const q = filterSearch.value.trim().toLowerCase()
  displayTokens.value = newTokens.filter((t) => (t.code || '').toLowerCase().includes(q))
}, { immediate: true })

/* ── Import: Step 1 — Upload & Preview ─────────────── */
const handlePreview = async () => {
  if (!importFile.value || !importLocationId.value || !importPlanId.value) return
  importLoading.value = true
  importError.value = ''
  importResult.value = null
  previewData.value = null

  try {
    const formData = new FormData()
    formData.append('pdf', importFile.value)
    formData.append('locationId', importLocationId.value)
    formData.append('planId', importPlanId.value)

    const res = await adminApi.importTokensPreview(formData)
    if (!res.success) {
      importError.value = res.error || 'Failed to parse PDF'
      importStep.value = 'form'
      return
    }
    previewData.value = res.data
    importStep.value = 'preview'
  } catch (err) {
    importError.value = err.message || 'Failed to parse PDF'
    importStep.value = 'form'
  } finally {
    importLoading.value = false
  }
}

/* ── Import: Step 2 — Confirm ──────────────────────── */
const handleConfirm = async () => {
  if (!previewData.value?.previewId) return
  importLoading.value = true
  importError.value = ''

  try {
    const res = await adminApi.importTokensConfirm(previewData.value.previewId)
    if (!res.success) {
      importError.value = res.error || 'Import failed'
      return
    }
    importResult.value = res.data
    importStep.value = 'result'
    currentPage.value = 1
    await fetchTokens()
  } catch (err) {
    importError.value = err.message || 'Import failed'
  } finally {
    importLoading.value = false
  }
}

const resetImport = () => {
  importStep.value = 'form'
  importFile.value = null
  importLocationId.value = ''
  importPlanId.value = ''
  previewData.value = null
  importResult.value = null
  importError.value = ''
}

/* ── Helpers ───────────────────────────────────────── */
const statusColor = (s) => ({
  available: 'bg-emerald-50 text-emerald-700',
  reserved: 'bg-amber-50 text-amber-700',
  sold: 'bg-brand/10 text-brand/80',
  used: 'bg-brand-dark/10 text-brand-dark/50',
  expired: 'bg-red-50 text-red-600',
  revoked: 'bg-red-100 text-red-700',
}[s] || 'bg-gray-50 text-gray-500')

const locName = (id) => locations.value.find((l) => l.id === id)?.name || '—'
const planLabel = (id) => {
  for (const loc of locations.value) {
    const plan = (loc.plans || []).find((p) => (p.plan_id || p.id) === id)
    if (plan) return plan.plan_label || plan.label
  }
  return '—'
}

/* ── CSV Export ────────────────────────────────────── */
const exportInventory = async () => {
  try {
    const res = await adminApi.exportTokens({})
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `richwifi-tickets-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Fallback: export current page
    const headers = ['Code', 'Location', 'Plan', 'Status', 'Created']
    const rows = displayTokens.value.map((t) => ({
      Code: t.code,
      Location: locName(t.location_id),
      Plan: planLabel(t.plan_id),
      Status: t.status,
      Created: (t.created_at || '').slice(0, 10),
    }))
    const csv = [headers.join(','), ...rows.map((r) => Object.values(r).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `richwifi-tickets-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Import tokens -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <h3 class="font-heading text-sm font-bold tracking-tight text-brand">Import Tickets (MikroTicket PDF)</h3>

      <!-- Step 1: Form -->
      <div v-if="importStep === 'form'" class="mt-3">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex-1 min-w-[8rem]">
            <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Location</span>
            <select v-model="importLocationId" class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none">
              <option value="" disabled>Select location</option>
              <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
          </label>
          <label class="flex-1 min-w-[7rem]">
            <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">Plan</span>
            <select v-model="importPlanId" class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none">
              <option value="" disabled>Select plan</option>
              <option v-for="p in locationPlans" :key="p.plan_id || p.id" :value="p.plan_id || p.id">{{ p.plan_label || p.label }} — ₵{{ Number(p.price).toFixed(2) }}</option>
            </select>
          </label>
          <label class="flex-1 min-w-[10rem]">
            <span class="text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">PDF File</span>
            <input type="file" accept=".pdf"
              class="clay-well mt-1 w-full rounded-xl bg-brand/[0.04] px-3 py-2 text-xs font-semibold text-brand-dark file:mr-2 file:rounded-lg file:border-0 file:bg-brand/10 file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-brand"
              @change="importFile = $event.target.files[0]" />
          </label>
          <button type="button"
            class="clay-btn rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-2 text-xs font-extrabold text-white disabled:opacity-40"
            :disabled="!importFile || !importLocationId || !importPlanId || importLoading" @click="handlePreview">
            {{ importLoading ? 'Processing…' : 'Process PDF' }}
          </button>
        </div>
        <p class="mt-2 text-[10px] text-brand-dark/40">Upload a MikroTicket PDF. The system will extract and validate all ticket codes before importing.</p>
      </div>

      <!-- Step 2: Preview -->
      <div v-if="importStep === 'preview' && previewData" class="mt-3">
        <!-- Plan mismatch warning -->
        <div v-if="!previewData.plan_match" class="mb-3 rounded-xl border-2 border-red-200 bg-red-50 p-3">
          <p class="text-xs font-bold text-red-600">⚠ Plan mismatch detected!</p>
          <p class="mt-1 text-[11px] text-red-500">
            PDF contains <strong>{{ previewData.pdf_plan }}</strong> but you selected <strong>{{ previewData.selected_plan }}</strong>.
            Importing this will cause inventory errors.
          </p>
          <button type="button" class="mt-2 rounded-lg bg-red-100 px-3 py-1 text-[11px] font-bold text-red-600 hover:bg-red-200" @click="resetImport">
            Cancel & Choose Correct Plan
          </button>
        </div>

        <!-- Summary cards -->
        <div class="mb-3 grid grid-cols-3 gap-2">
          <div class="rounded-xl bg-emerald-50 px-3 py-2 text-center">
            <p class="text-lg font-extrabold text-emerald-700">{{ previewData.summary.valid }}</p>
            <p class="text-[10px] font-bold text-emerald-600 uppercase">Valid</p>
          </div>
          <div class="rounded-xl bg-amber-50 px-3 py-2 text-center">
            <p class="text-lg font-extrabold text-amber-600">{{ previewData.summary.duplicates }}</p>
            <p class="text-[10px] font-bold text-amber-600 uppercase">Duplicates</p>
          </div>
          <div class="rounded-xl bg-red-50 px-3 py-2 text-center">
            <p class="text-lg font-extrabold text-red-600">{{ previewData.summary.invalid }}</p>
            <p class="text-[10px] font-bold text-red-500 uppercase">Invalid</p>
          </div>
        </div>

        <!-- Ticket list -->
        <div class="max-h-64 overflow-y-auto rounded-xl border border-brand/10">
          <table class="w-full text-left text-[11px]">
            <thead class="sticky top-0 bg-surface">
              <tr class="border-b border-brand/10 text-[10px] font-bold tracking-wider text-brand-dark/40 uppercase">
                <th class="px-3 py-1.5">#</th>
                <th class="px-3 py-1.5">Code</th>
                <th class="px-3 py-1.5">Plan (PDF)</th>
                <th class="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in previewData.tickets" :key="t.code" class="border-b border-brand/5">
                <td class="px-3 py-1.5 text-brand-dark/40">{{ t.ticket_number }}</td>
                <td class="px-3 py-1.5 font-mono font-bold text-brand">{{ t.code }}</td>
                <td class="px-3 py-1.5 text-brand-dark/50">{{ t.plan || '—' }}</td>
                <td class="px-3 py-1.5">
                  <span v-if="t.status === 'valid'" class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">✓ Valid</span>
                  <span v-else-if="t.status === 'duplicate'" class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">⚠ {{ t.reason }}</span>
                  <span v-else class="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">✗ {{ t.reason }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Actions -->
        <div class="mt-3 flex items-center justify-between">
          <button type="button"
            class="rounded-xl border border-brand/15 px-4 py-2 text-xs font-bold text-brand-dark/50 transition hover:bg-brand/5"
            @click="resetImport">
            Cancel
          </button>
          <button type="button"
            class="clay-btn rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-2 text-xs font-extrabold text-white disabled:opacity-40"
            :disabled="previewData.summary.valid === 0 || importLoading || !previewData.plan_match"
            @click="handleConfirm">
            {{ importLoading ? 'Importing…' : 'Import ' + previewData.summary.valid + ' Tokens' }}
          </button>
        </div>
      </div>

      <!-- Step 3: Result -->
      <div v-if="importStep === 'result' && importResult" class="mt-3">
        <div class="rounded-xl bg-emerald-50 p-4 text-center">
          <p class="text-2xl">✅</p>
          <p class="mt-1 text-sm font-extrabold text-emerald-700">Import Complete</p>
          <div class="mt-2 flex justify-center gap-4 text-xs">
            <span class="font-bold text-emerald-600">{{ importResult.inserted }} imported</span>
            <span v-if="importResult.duplicates" class="font-bold text-amber-600">{{ importResult.duplicates }} duplicates skipped</span>
            <span v-if="importResult.skipped" class="font-bold text-red-500">{{ importResult.skipped }} invalid skipped</span>
          </div>
        </div>
        <button type="button"
          class="mt-3 w-full rounded-xl bg-brand/5 py-2 text-xs font-bold text-brand transition hover:bg-brand/10"
          @click="resetImport">
          Import Another PDF
        </button>
      </div>

      <!-- Error -->
      <div v-if="importError" class="mt-2.5">
        <p class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
          ✗ {{ importError }}
        </p>
      </div>
    </div>        <!-- Ticket inventory -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">
          Ticket Inventory
          <span class="text-brand-dark/35">({{ meta.total }} total)</span>
        </h3>
        <button type="button"
          class="clay-btn-light rounded-lg bg-brand/[0.06] px-3 py-1.5 text-[11px] font-bold text-brand transition hover:bg-brand/10"
          @click="exportInventory">
          ↓ Export CSV
        </button>
      </div>

      <!-- Server-side filters -->
      <div class="mb-3 flex flex-wrap gap-2">
        <select v-model="filterLoc"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All locations</option>
          <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-model="filterStatus"
          class="rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 focus:ring-2 focus:ring-brand/20 focus:outline-none">
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
          <option value="used">Used</option>
          <option value="expired">Expired</option>
        </select>
        <input v-model="filterSearch" type="search" placeholder="Search codes on this page…"
          class="w-44 rounded-xl border border-brand/10 bg-surface px-3 py-1.5 text-[11px] font-semibold text-brand-dark/70 placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/20 focus:outline-none" />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="h-6 w-6 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
      </div>

      <!-- Table -->
      <template v-else>
        <div v-if="loadingTable" class="flex items-center justify-center py-2">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-brand/15 border-t-brand"></div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-brand/10 text-[10px] font-bold tracking-widest text-brand-dark/50 uppercase">
                <th class="px-3 py-2">Code</th>
                <th class="px-3 py-2">Location</th>
                <th class="px-3 py-2">Plan</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Created</th>
                <th class="px-3 py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in displayTokens" :key="t.id" class="border-b border-brand/5 transition hover:bg-brand/[0.02]">
                <td class="px-3 py-2 font-mono font-bold text-brand">{{ t.code }}</td>
                <td class="px-3 py-2 font-medium text-brand-dark/65">{{ locName(t.location_id) }}</td>
                <td class="px-3 py-2 font-medium text-brand-dark/65">{{ planLabel(t.plan_id) }}</td>
                <td class="px-3 py-2">
                  <span :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold', statusColor(t.status)]">
                    {{ t.status }}
                  </span>
                </td>
                <td class="px-3 py-2 text-brand-dark/45">{{ (t.created_at || '').slice(0, 10) }}</td>
                <td class="px-3 py-2 text-brand-dark/45">{{ (t.expires_at || '').slice(0, 10) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!displayTokens.length" class="py-8 text-center text-xs font-semibold text-brand-dark/35">
          No tickets match your filters.
        </p>

        <!-- Pagination -->
        <Pagination
          :page="meta.page"
          :total-pages="meta.pages"
          :total="meta.total"
          :per-page="meta.per_page"
          @update:page="(p) => { currentPage = p; fetchTokens() }"
        />
      </template>
    </div>
  </div>
</template>
