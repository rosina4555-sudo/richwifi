<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../services/api'

const LOCATION_THEMES = [
  { name: 'Brand Red', css: 'from-[#6d0214]/80 to-[#c50125]/60' },
  { name: 'Royal Blue', css: 'from-[#3b4cca] to-[#667eea]' },
  { name: 'Emerald', css: 'from-[#059669] to-[#10b981]' },
  { name: 'Sunset', css: 'from-[#ea580c] to-[#f59e0b]' },
  { name: 'Purple', css: 'from-[#6d28d9] to-[#a78bfa]' },
]

const currency = (value) => `₵${Number(value).toFixed(2)}`

const locations = ref([])
const loading = ref(true)
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', address: '', themeIndex: 0 })
const saving = ref(false)
const error = ref('')

// Plan editing state
const editingPlan = ref(null)
const planForm = ref({ price: 0 })

// Plan creation state
const showPlanForm = ref(false)
const planCreatingFor = ref(null) // location object
const newPlan = ref({ plan_key: 'daily', label: '1 Day', price: 5, validity_days: 1 })
const planSaving = ref(false)
const planError = ref('')

const PLAN_PRESETS = [
  { key: 'hourly', label: '1 Hour', validity: 1 },
  { key: 'daily', label: '1 Day', validity: 1 },
  { key: 'weekly', label: '1 Week', validity: 7 },
  { key: 'monthly', label: '1 Month', validity: 30 },
]

// Update label and validity when plan_key changes
const onPlanKeyChange = () => {
  const preset = PLAN_PRESETS.find(p => p.key === newPlan.value.plan_key)
  if (preset) {
    newPlan.value.label = preset.label
    newPlan.value.validity_days = preset.validity
  }
}

// Check if existing keys to disable them in the dropdown
const existingPlanKeys = computed(() => {
  if (!planCreatingFor.value) return []
  return (planCreatingFor.value.plans || []).map(p => p.plan_key)
})

const fetchLocations = async () => {
  loading.value = true
  try {
    const res = await adminApi.getLocations()
    locations.value = res.data || res.locations || []
  } catch (err) {
    console.error('Failed to load locations:', err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchLocations)

/* ── Location CRUD ──────────────────────────────────── */
const openCreate = () => {
  editing.value = null
  form.value = { name: '', address: '', themeIndex: 0 }
  showForm.value = true
}

const openEdit = (loc) => {
  editing.value = loc
  form.value = {
    name: loc.name,
    address: loc.address,
    themeIndex: loc.theme_index ?? 0,
  }
  showForm.value = true
}

const save = async () => {
  if (!form.value.name.trim() || !form.value.address.trim()) return
  saving.value = true
  error.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      address: form.value.address.trim(),
      theme_color: LOCATION_THEMES[form.value.themeIndex]?.css || '',
    }
    if (editing.value) {
      await adminApi.updateLocation(editing.value.id, payload)
    } else {
      await adminApi.createLocation(payload)
    }
    await fetchLocations()
    showForm.value = false
  } catch (err) {
    error.value = err.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

const toggleLocation = async (loc) => {
  try {
    await adminApi.toggleLocation(loc.id, loc.is_active ? 0 : 1)
    await fetchLocations()
  } catch (err) {
    alert(err.message || 'Failed to toggle')
  }
}



const restoreLocation = async (loc) => {
  try {
    await adminApi.toggleLocation(loc.id, 1)
    await fetchLocations()
  } catch (err) {
    alert(err.message || 'Failed to restore')
  }
}

/* ── Plan management ────────────────────────────────── */
const openPlanEdit = (plan) => {
  editingPlan.value = plan
  planForm.value = { price: Number(plan.price) }
}

const savePlan = async () => {
  if (!editingPlan.value) return
  try {
    await adminApi.updatePlan(editingPlan.value.plan_id || editingPlan.value.id, {
      price: planForm.value.price,
    })
    editingPlan.value = null
    await fetchLocations()
  } catch (err) {
    alert(err.message || 'Failed to update plan')
  }
}

const togglePlan = async (plan) => {
  try {
    await adminApi.togglePlan(plan.plan_id || plan.id, plan.is_active ? 0 : 1)
    await fetchLocations()
  } catch (err) {
    alert(err.message || 'Failed to toggle plan')
  }
}

const openPlanCreate = (loc) => {
  planCreatingFor.value = loc
  // Determine which keys already exist
  const existingKeys = (loc.plans || []).map(p => p.plan_key)
  // Default to the first available preset
  const availablePreset = PLAN_PRESETS.find(p => !existingKeys.includes(p.key)) || PLAN_PRESETS[0]
  newPlan.value = {
    plan_key: availablePreset.key,
    label: availablePreset.label,
    price: 5,
    validity_days: availablePreset.validity,
  }
  planError.value = ''
  showPlanForm.value = true
}

const savePlanCreate = async () => {
  if (!planCreatingFor.value) return
  planSaving.value = true
  planError.value = ''
  try {
    await adminApi.createPlan({
      location_id: planCreatingFor.value.id,
      plan_key: newPlan.value.plan_key,
      label: newPlan.value.label.trim(),
      price: Number(newPlan.value.price),
      validity_days: Number(newPlan.value.validity_days),
    })
    await fetchLocations()
    showPlanForm.value = false
  } catch (err) {
    planError.value = err.message || 'Failed to create plan'
  } finally {
    planSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
        Locations <span class="text-brand-dark/35">({{ locations.length }})</span>
      </h2>
      <button
        type="button"
        class="clay-btn rounded-xl bg-gradient-to-r from-brand to-accent px-4 py-2 text-xs font-extrabold text-white"
        @click="openCreate"
      >
        + Add Location
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
    </div>

    <!-- Location form modal -->
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-brand-dark/50 backdrop-blur-sm" @click="showForm = false"></div>
      <div class="clay relative w-full max-w-md rounded-t-3xl bg-surface p-5 sm:rounded-3xl sm:p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-heading text-base font-bold text-brand">
            {{ editing ? 'Edit Location' : 'New Location' }}
          </h3>
          <button type="button" class="rounded-lg p-1 text-brand-dark/40 hover:text-brand" @click="showForm = false">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div v-if="error" class="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{{ error }}</div>
        <label class="block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Name</span>
          <input v-model="form.name" type="text" placeholder="e.g. Downtown Hub" class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>
        <label class="mt-3 block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Address</span>
          <input v-model="form.address" type="text" placeholder="e.g. 124 Main Street, Accra" class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>
        <div class="mt-4">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Theme</span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <button v-for="(t, i) in LOCATION_THEMES" :key="t.name" type="button"
              class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br transition-all duration-200"
              :class="[t.css, form.themeIndex === i ? 'ring-2 ring-brand ring-offset-2 scale-110' : 'hover:scale-105']"
              :title="t.name" @click="form.themeIndex = i"></button>
          </div>
        </div>
        <button type="button"
          class="clay-btn mt-5 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
          :disabled="!form.name.trim() || !form.address.trim() || saving" @click="save">
          {{ saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Location' }}
        </button>
      </div>
    </div>

    <!-- Plan create modal -->
    <div v-if="showPlanForm" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-brand-dark/50 backdrop-blur-sm" @click="showPlanForm = false"></div>
      <div class="clay relative w-full max-w-sm rounded-t-3xl bg-surface p-5 sm:rounded-3xl sm:p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-heading text-base font-bold text-brand">
            New Plan — {{ planCreatingFor?.name }}
          </h3>
          <button type="button" class="rounded-lg p-1 text-brand-dark/40 hover:text-brand" @click="showPlanForm = false">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div v-if="planError" class="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{{ planError }}</div>

        <!-- Plan type -->
        <label class="block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Plan Type</span>
          <select v-model="newPlan.plan_key" @change="onPlanKeyChange"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none">
            <option value="hourly" :disabled="existingPlanKeys.includes('hourly')">Hourly</option>
            <option value="daily" :disabled="existingPlanKeys.includes('daily')">Daily</option>
            <option value="weekly" :disabled="existingPlanKeys.includes('weekly')">Weekly</option>
            <option value="monthly" :disabled="existingPlanKeys.includes('monthly')">Monthly</option>
          </select>
        </label>

        <!-- Label -->
        <label class="mt-3 block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Label</span>
          <input v-model="newPlan.label" type="text" placeholder="e.g. 1 Day"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>

        <!-- Price -->
        <label class="mt-3 block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Price (₵)</span>
          <input v-model.number="newPlan.price" type="number" min="0.50" step="0.50"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>

        <!-- Validity -->
        <label class="mt-3 block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Validity (days)</span>
          <input v-model.number="newPlan.validity_days" type="number" min="1" step="1"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>

        <button type="button"
          class="clay-btn mt-5 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
          :disabled="!newPlan.label.trim() || newPlan.price <= 0 || newPlan.validity_days <= 0 || planSaving"
          @click="savePlanCreate">
          {{ planSaving ? 'Creating…' : 'Create Plan' }}
        </button>
      </div>
    </div>

    <!-- Plan edit modal -->
    <div v-if="editingPlan" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-brand-dark/50 backdrop-blur-sm" @click="editingPlan = null"></div>
      <div class="clay relative w-full max-w-sm rounded-t-3xl bg-surface p-5 sm:rounded-3xl sm:p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-heading text-base font-bold text-brand">Edit Plan — {{ editingPlan.plan_label || editingPlan.label }}</h3>
          <button type="button" class="rounded-lg p-1 text-brand-dark/40 hover:text-brand" @click="editingPlan = null">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <label class="block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Price (₵)</span>
          <input v-model.number="planForm.price" type="number" min="0" step="0.50"
            class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>
        <button type="button"
          class="clay-btn mt-4 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-2.5 text-sm font-extrabold text-white"
          @click="savePlan">Save Price</button>
      </div>
    </div>

    <!-- Location list -->
    <div class="space-y-3">
      <div
        v-for="loc in locations"
        :key="loc.id"
        class="clay flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-5"
        :class="!loc.is_active ? 'opacity-60' : ''"
      >
        <!-- Location header -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br shadow-sm" :class="loc.theme_color || 'from-[#6d0214]/80 to-[#c50125]/60'"></div>
            <div class="min-w-0">
              <p class="font-heading truncate text-sm font-bold text-brand">
                {{ loc.name }}
                <span v-if="!loc.is_active" class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600 uppercase">Archived</span>
              </p>
              <p class="mt-0.5 truncate text-xs text-brand-dark/50">{{ loc.address }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button type="button"
              class="rounded-lg px-2 py-1.5 text-[11px] font-semibold transition"
              :class="loc.is_active ? 'text-amber-600/70 hover:bg-amber-50 hover:text-amber-600' : 'text-emerald-600/70 hover:bg-emerald-50 hover:text-emerald-600'"
              @click="loc.is_active ? toggleLocation(loc) : restoreLocation(loc)">
              {{ loc.is_active ? 'Disable' : 'Restore' }}
            </button>
            <button type="button" class="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-brand-dark/50 transition hover:bg-brand/5 hover:text-brand" @click="openEdit(loc)">Edit</button>
          </div>
        </div>

        <!-- Plans table -->
        <div v-if="(loc.plans || []).length" class="overflow-x-auto rounded-xl bg-brand/[0.03]">
          <div class="flex items-center justify-between border-b border-brand/10 px-3 py-1.5">
            <span class="text-[10px] font-bold tracking-wider text-brand-dark/40 uppercase">Plans</span>
            <button type="button"
              class="rounded-lg px-2 py-0.5 text-[10px] font-bold text-brand/70 transition hover:bg-brand/5 hover:text-brand"
              @click="openPlanCreate(loc)">
              + Add Plan
            </button>
          </div>
          <table class="w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-brand/10 text-[10px] font-bold tracking-wider text-brand-dark/40 uppercase">
                <th class="px-3 py-2">Plan</th>
                <th class="px-3 py-2 text-right">Price</th>
                <th class="px-3 py-2 text-right">Validity</th>
                <th class="px-3 py-2 text-right">Stock</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plan in loc.plans" :key="plan.plan_id || plan.id" class="border-b border-brand/5">
                <td class="px-3 py-2 font-semibold text-brand-dark/70">{{ plan.plan_label || plan.label }}</td>
                <td class="px-3 py-2 text-right font-bold text-brand cursor-pointer hover:underline" @click="openPlanEdit(plan)">{{ currency(plan.price) }}</td>
                <td class="px-3 py-2 text-right text-brand-dark/50">{{ plan.validity_days }}d</td>
                <td class="px-3 py-2 text-right">
                  <span class="font-bold" :class="plan.available_stock > 0 ? 'text-emerald-600' : 'text-red-500'">
                    {{ plan.available_stock ?? '—' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-center">
                  <button type="button"
                    class="rounded-full px-2 py-0.5 text-[10px] font-extrabold transition"
                    :class="plan.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
                    @click="togglePlan(plan)">
                    {{ plan.is_active ? 'Active' : 'Disabled' }}
                  </button>
                </td>
                <td class="px-3 py-2 text-right">
                  <button type="button" class="text-[11px] font-semibold text-brand/70 hover:text-brand transition" @click="openPlanEdit(plan)">Edit price</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="!loading && !locations.length" class="py-12 text-center text-sm font-semibold text-brand-dark/40">
        No locations yet. Click "Add Location" to get started.
      </p>
    </div>
  </div>
</template>
