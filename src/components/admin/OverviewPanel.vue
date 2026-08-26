<script setup>
import { computed } from 'vue'
import { kpis, dailyRevenue, revenueByDuration, revenueByLocation, tokenInventoryByLocation, currency } from '../../data/store'
import KpiCard from './KpiCard.vue'
import BarChart from './BarChart.vue'

const k = computed(() => kpis())
const revenueData = computed(() => dailyRevenue(14))
const byDuration = computed(() => revenueByDuration())
const byLocation = computed(() => revenueByLocation())
const inventory = computed(() => tokenInventoryByLocation())
const maxRevenue = computed(() => Math.max(...byLocation.value.map((l) => l.value), 1))
</script>

<template>
  <div class="space-y-6">
    <!-- KPIs -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <KpiCard label="Total Revenue" :value="currency(k.totalRevenue).slice(1)" prefix="$" :delta="k.revenueDelta" />
      <KpiCard label="Orders" :value="k.totalOrders" :delta="k.ordersDelta" />
      <KpiCard label="Tokens Sold" :value="k.totalTokensSold" :delta="k.tokensDelta" />
      <KpiCard label="Avg Order" :value="k.avgOrderValue.toFixed(2)" prefix="$" />
    </div>

    <!-- Revenue over 14 days -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-6">
      <div class="mb-4 flex items-end justify-between">
        <h3 class="font-heading text-sm font-bold tracking-tight text-brand">Revenue — Last 14 days</h3>
        <span class="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand/80">
          {{ currency(k.totalRevenue).slice(1) }} total
        </span>
      </div>
      <BarChart
        :data="revenueData"
        height="8rem"
        bar-color="from-brand to-accent"
      />
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Revenue by duration -->
      <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
        <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Revenue by Plan</h3>
        <div class="space-y-3">
          <div v-for="d in byDuration" :key="d.label">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-semibold text-brand-dark/70">{{ d.label }}</span>
              <span class="font-bold text-brand">${{ d.value.toFixed(2) }}</span>
            </div>
            <div class="h-2.5 w-full overflow-hidden rounded-full bg-brand/10">
              <div
                class="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
                :style="{ width: `${d.percent}%` }"
              ></div>
            </div>
            <span class="mt-0.5 block text-right text-[10px] font-bold text-brand-dark/40">{{ d.percent }}%</span>
          </div>
        </div>
      </div>

      <!-- Revenue by location -->
      <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
        <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Revenue by Location</h3>
        <div class="space-y-3">
          <div v-for="l in byLocation" :key="l.id">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-semibold text-brand-dark/70">{{ l.label }}</span>
              <span class="font-bold text-brand">${{ l.value.toFixed(2) }}</span>
            </div>
            <div class="h-2.5 w-full overflow-hidden rounded-full bg-brand/10">
              <div
                class="h-full rounded-full bg-gradient-to-r from-brand/70 to-accent/70 transition-all duration-500"
                :style="{ width: `${l.percent}%` }"
              ></div>
            </div>
            <span class="mt-0.5 block text-right text-[10px] font-bold text-brand-dark/40">{{ l.percent }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Token inventory overview -->
    <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
      <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Token Inventory</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div v-for="loc in inventory" :key="loc.id" class="clay-well rounded-xl bg-brand/[0.04] p-3">
          <p class="font-heading text-xs font-bold text-brand-dark/70">{{ loc.name }}</p>
          <div class="mt-2 flex gap-3 text-center">
            <div>
              <p class="font-heading text-lg font-black text-emerald-600">{{ loc.available }}</p>
              <p class="text-[10px] font-semibold text-brand-dark/45">Available</p>
            </div>
            <div>
              <p class="font-heading text-lg font-black text-brand">{{ loc.sold }}</p>
              <p class="text-[10px] font-semibold text-brand-dark/45">Sold</p>
            </div>
            <div>
              <p class="font-heading text-lg font-black text-brand-dark/50">{{ loc.total }}</p>
              <p class="text-[10px] font-semibold text-brand-dark/45">Total</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
