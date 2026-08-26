<script setup>
import { ref } from 'vue'
import { store, addLocation, updateLocation, removeLocation, updatePlanPrice, LOCATION_THEMES } from '../../data/store'

const showForm = ref(false)
const editing = ref(null) // null = create, object = edit
const form = ref({ name: '', address: '', themeIndex: 0 })

const openCreate = () => {
  editing.value = null
  form.value = { name: '', address: '', themeIndex: 0 }
  showForm.value = true
}

const openEdit = (loc) => {
  editing.value = loc
  form.value = { name: loc.name, address: loc.address, themeIndex: loc.themeIndex || 0 }
  showForm.value = true
}

const save = () => {
  if (!form.value.name.trim() || !form.value.address.trim()) return
  if (editing.value) {
    updateLocation(editing.value.id, {
      name: form.value.name.trim(),
      address: form.value.address.trim(),
      themeIndex: form.value.themeIndex,
    })
  } else {
    addLocation({
      name: form.value.name.trim(),
      address: form.value.address.trim(),
      themeIndex: form.value.themeIndex,
    })
  }
  showForm.value = false
}

const confirmDelete = (loc) => {
  if (confirm(`Delete "${loc.name}"? This will also remove all its tokens and sales records.`)) {
    removeLocation(loc.id)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-heading text-lg font-bold tracking-tight text-brand">
        Locations <span class="text-brand-dark/35">({{ store.locations.length }})</span>
      </h2>
      <button
        type="button"
        class="clay-btn rounded-xl bg-gradient-to-r from-brand to-accent px-4 py-2 text-xs font-extrabold text-white"
        @click="openCreate"
      >
        + Add Location
      </button>
    </div>

    <!-- Form modal -->
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

        <label class="block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Name</span>
          <input v-model="form.name" type="text" placeholder="e.g. Downtown Hub" class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>

        <label class="mt-3 block">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Address</span>
          <input v-model="form.address" type="text" placeholder="e.g. 124 Main Street, Cityville" class="clay-well mt-1.5 w-full rounded-xl bg-brand/[0.04] px-4 py-2.5 text-sm font-medium text-brand-dark placeholder:text-brand-dark/30 focus:ring-2 focus:ring-brand/30 focus:outline-none" />
        </label>

        <div class="mt-4">
          <span class="text-xs font-bold tracking-widest text-brand uppercase">Theme</span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <button
              v-for="(t, i) in LOCATION_THEMES"
              :key="t.name"
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br transition-all duration-200"
              :class="[t.css, form.themeIndex === i ? 'ring-2 ring-brand ring-offset-2 scale-110' : 'hover:scale-105']"
              :title="t.name"
              @click="form.themeIndex = i"
            ></button>
          </div>
        </div>

        <button
          type="button"
          class="clay-btn mt-5 w-full rounded-xl bg-gradient-to-r from-brand to-accent py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
          :disabled="!form.name.trim() || !form.address.trim()"
          @click="save"
        >
          {{ editing ? 'Save Changes' : 'Create Location' }}
        </button>
      </div>
    </div>

    <!-- Location list -->
    <div class="space-y-3">
      <div
        v-for="loc in store.locations"
        :key="loc.id"
        class="clay flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br shadow-sm" :class="loc.color"></div>
          <div class="min-w-0">
            <p class="font-heading truncate text-sm font-bold text-brand">{{ loc.name }}</p>
            <p class="mt-0.5 truncate text-xs text-brand-dark/50">{{ loc.address }}</p>
          </div>
        </div>

        <!-- Plan prices -->
        <div class="flex flex-wrap gap-2">
          <div
            v-for="plan in loc.plans"
            :key="plan.id"
            class="clay-well flex items-center gap-1.5 rounded-xl bg-brand/[0.04] px-2.5 py-1.5"
          >
            <span class="text-[10px] font-bold text-brand-dark/55">{{ plan.label }}</span>
            <div class="flex items-center">
              <span class="text-[10px] font-semibold text-brand-dark/40">$</span>
              <input
                :value="plan.price"
                type="number"
                min="0"
                step="0.5"
                class="w-12 bg-transparent text-center text-xs font-bold text-brand outline-none focus:ring-1 focus:ring-brand/30 rounded"
                @change="updatePlanPrice(loc.id, plan.id, $event.target.value)"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-dark/50 transition hover:bg-brand/5 hover:text-brand" @click="openEdit(loc)">Edit</button>
          <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-500/70 transition hover:bg-red-50 hover:text-red-600" @click="confirmDelete(loc)">Delete</button>
        </div>
      </div>

      <p v-if="!store.locations.length" class="py-12 text-center text-sm font-semibold text-brand-dark/40">
        No locations yet. Click "Add Location" to get started.
      </p>
    </div>
  </div>
</template>
