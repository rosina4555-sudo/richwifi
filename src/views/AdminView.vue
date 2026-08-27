<script setup>
import { ref, computed, onMounted } from 'vue'
import { logout } from '../services/auth'
import { adminApi, getAdmin } from '../services/api'
import OverviewPanel from '../components/admin/OverviewPanel.vue'
import LocationsPanel from '../components/admin/LocationsPanel.vue'
import TokensPanel from '../components/admin/TokensPanel.vue'
import SalesPanel from '../components/admin/SalesPanel.vue'
import logo from '../assets/logo.png'

const tabs = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'locations', label: 'Locations', icon: 'pin' },
  { id: 'tokens', label: 'Tickets', icon: 'key' },
  { id: 'sales', label: 'Sales', icon: 'receipt' },
]
const activeTab = ref('overview')
const adminInfo = ref(getAdmin())

const panels = { overview: OverviewPanel, locations: LocationsPanel, tokens: TokensPanel, sales: SalesPanel }
const ActivePanel = computed(() => panels[activeTab.value])
</script>

<template>
  <div class="flex min-h-screen flex-col bg-brand-dark/[0.03] text-brand-dark">
    <!-- Header -->
    <header class="sticky top-0 z-40 border-b border-brand/10 bg-surface/95 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16">
        <div class="flex items-center gap-3">
          <img :src="logo" alt="RichWiFi" class="h-6 w-auto max-w-[7rem] object-contain sm:h-7" draggable="false" />
          <span class="rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-extrabold tracking-widest text-brand uppercase">Admin</span>
          <span v-if="adminInfo?.email" class="hidden text-xs text-brand-dark/45 sm:inline">
            {{ adminInfo.email }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <a href="#" class="flex items-center gap-1.5 text-xs font-semibold text-brand-dark/55 transition hover:text-accent">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Site
          </a>
          <span class="h-3 w-px bg-brand/15"></span>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-red-500/70 transition hover:bg-red-50 hover:text-red-600"
            @click="logout"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </div>
      <!-- Tab bar -->
      <div class="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 hide-scrollbar">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-200"
          :class="[
            activeTab === t.id
              ? 'bg-gradient-to-r from-brand to-accent text-white shadow-md shadow-accent/25'
              : 'text-brand-dark/55 hover:bg-brand/5 hover:text-brand',
          ]"
          @click="activeTab = t.id"
        >
          <!-- icons -->
          <svg v-if="t.icon === 'chart'" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          <svg v-else-if="t.icon === 'pin'" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <svg v-else-if="t.icon === 'key'" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/></svg>
          {{ t.label }}
        </button>
      </div>
    </header>

    <!-- Panel -->
    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
      <KeepAlive>
        <component :is="ActivePanel" />
      </KeepAlive>
    </main>
  </div>
</template>
