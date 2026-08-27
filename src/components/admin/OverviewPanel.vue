<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../services/api'
import KpiCard from './KpiCard.vue'
import BarChart from './BarChart.vue'

const loading = ref(true)
const overview = ref({})
const dailySales = ref([])
const byLocation = ref([])
const byPlan = ref([])
const inventory = ref([])

const currency = (value) => `₵${Number(value).toFixed(2)}`

onMounted(async () => {
  try {
    const [overviewRes, dailyRes, locRes, planRes, invRes] = await Promise.all([
      adminApi.getOverview(),
      adminApi.getDailySales({ days: 14 }),
      adminApi.getByLocation(),
      adminApi.getByPlan(),
      adminApi.getInventory(),
    ])
    overview.value = overviewRes.data || overviewRes
    dailySales.value = dailyRes.data || dailyRes
    byLocation.value = locRes.data || locRes
    byPlan.value = planRes.data || planRes
    inventory.value = invRes.data || invRes
  } catch (err) {
    console.error('Failed to load analytics:', err)
  } finally {
    loading.value = false
  }
})

// Backend: { current: { total_revenue, total_orders, tokens_sold, avg_order_value }, deltas: { revenue: { change }, orders: { change } } }
const current = computed(() => overview.value.current || {})
const deltas = computed(() => overview.value.deltas || {})

// Chart data: fill empty days so the chart looks real
const chartData = computed(() => {
  const salesMap = {}
  for (const d of dailySales.value) {
    salesMap[d.date] = Number(d.revenue) || 0
  }
  const result = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    result.push({
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: salesMap[key] || 0,
    })
  }
  return result
})

// Compute percent for byPlan
const totalPlanRevenue = computed(() =>
  byPlan.value.reduce((s, p) => s + Number(p.revenue || 0), 0)
)
const planWithPercent = computed(() =>
  byPlan.value.map((p) => ({
    ...p,
    percent: totalPlanRevenue.value
      ? +((Number(p.revenue) / totalPlanRevenue.value) * 100).toFixed(1)
      : 0,
  }))
)

// Compute percent for byLocation
const totalLocRevenue = computed(() =>
  byLocation.value.reduce((s, l) => s + Number(l.revenue || 0), 0)
)
const locWithPercent = computed(() =>
  byLocation.value.map((l) => ({
    ...l,
    percent: totalLocRevenue.value
      ? +((Number(l.revenue) / totalLocRevenue.value) * 100).toFixed(1)
      : 0,
  }))
)

// Inventory grouped by location
const inventoryByLocation = computed(() => {
  const map = {}
  for (const item of inventory.value) {
    const locId = item.location_id
    if (!map[locId]) {
      map[locId] = { id: locId, name: item.location, plans: [] }
    }
    map[locId].plans.push(item)
  }
  return Object.values(map)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-brand/15 border-t-brand"></div>
    </div>

    <template v-else>
      <!-- KPIs -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label="Total Revenue"
          :value="Number(current.total_revenue || 0).toFixed(0)"
          prefix="₵"
          :delta="Number(deltas.revenue?.change || 0)"
        />
        <KpiCard
          label="Orders"
          :value="current.total_orders || 0"
          :delta="Number(deltas.orders?.change || 0)"
        />
        <KpiCard
          label="Tickets Sold"
          :value="current.tokens_sold || 0"
        />
        <KpiCard
          label="Avg Order"
          :value="Number(current.avg_order_value || 0).toFixed(2)"
          prefix="₵"
        />
      </div>

      <!-- Revenue chart -->
      <div v-if="chartData.length" class="clay rounded-2xl bg-surface p-4 sm:p-6">
        <div class="mb-4 flex items-end justify-between">
          <h3 class="font-heading text-sm font-bold tracking-tight text-brand">Revenue — Last 14 days</h3>
          <span class="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand/80">
            {{ currency(current.total_revenue || 0) }} total
          </span>
        </div>
        <BarChart
          :data="chartData"
          height="14rem"
          bar-color="from-brand to-accent"
          :currency="true"
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Revenue by plan — backend: [{ plan, revenue, orders }] -->
        <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
          <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Revenue by Plan</h3>
          <div class="space-y-3">
            <div v-for="d in planWithPercent" :key="d.plan_id">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="font-semibold text-brand-dark/70">{{ d.plan }}</span>
                <span class="font-bold text-brand">{{ currency(d.revenue) }}</span>
              </div>
              <div class="h-2.5 w-full overflow-hidden rounded-full bg-brand/10">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
                  :style="{ width: `${d.percent}%` }"
                ></div>
              </div>
              <div class="mt-0.5 flex items-center justify-between text-[10px] font-bold text-brand-dark/40">
                <span>{{ d.orders }} order{{ d.orders !== 1 ? 's' : '' }}</span>
                <span>{{ d.percent }}%</span>
              </div>
            </div>
            <p v-if="!byPlan.length" class="py-4 text-center text-xs text-brand-dark/40">No plan data yet</p>
          </div>
        </div>

        <!-- Revenue by location — backend: [{ location, revenue, orders }] -->
        <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
          <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Revenue by Location</h3>
          <div class="space-y-3">
            <div v-for="l in locWithPercent" :key="l.location_id">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="font-semibold text-brand-dark/70">{{ l.location }}</span>
                <span class="font-bold text-brand">{{ currency(l.revenue) }}</span>
              </div>
              <div class="h-2.5 w-full overflow-hidden rounded-full bg-brand/10">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-brand/70 to-accent/70 transition-all duration-500"
                  :style="{ width: `${l.percent}%` }"
                ></div>
              </div>
              <div class="mt-0.5 flex items-center justify-between text-[10px] font-bold text-brand-dark/40">
                <span>{{ l.orders }} order{{ l.orders !== 1 ? 's' : '' }}</span>
                <span>{{ l.percent }}%</span>
              </div>
            </div>
            <p v-if="!byLocation.length" class="py-4 text-center text-xs text-brand-dark/40">No location data yet</p>
          </div>
        </div>
      </div>

      <!-- Ticket inventory — backend: [{ location, plan, available, reserved, sold, total, price }] -->
      <div class="clay rounded-2xl bg-surface p-4 sm:p-5">
        <h3 class="font-heading mb-3 text-sm font-bold tracking-tight text-brand">Ticket Inventory</h3>
        <div class="space-y-3">
          <div v-for="loc in inventoryByLocation" :key="loc.id" class="rounded-xl bg-brand/[0.03] p-3">
            <p class="font-heading text-xs font-bold text-brand-dark/70">{{ loc.name }}</p>
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-left text-[11px]">
                <thead>
                  <tr class="text-[10px] font-bold tracking-wider text-brand-dark/40 uppercase">
                    <th class="py-1 pr-3">Plan</th>
                    <th class="py-1 pr-3 text-right">Price</th>
                    <th class="py-1 pr-3 text-right text-emerald-600">Available</th>
                    <th class="py-1 pr-3 text-right text-amber-600">Reserved</th>
                    <th class="py-1 pr-3 text-right text-brand">Sold</th>
                    <th class="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in loc.plans" :key="p.plan_id" class="border-t border-brand/5">
                    <td class="py-1.5 pr-3 font-semibold text-brand-dark/70">{{ p.plan }}</td>
                    <td class="py-1.5 pr-3 text-right font-medium text-brand-dark/55">{{ currency(p.price) }}</td>
                    <td class="py-1.5 pr-3 text-right font-bold text-emerald-600">{{ p.available }}</td>
                    <td class="py-1.5 pr-3 text-right font-bold text-amber-600">{{ p.reserved }}</td>
                    <td class="py-1.5 pr-3 text-right font-bold text-brand">{{ p.sold }}</td>
                    <td class="py-1.5 text-right font-bold text-brand-dark/50">{{ p.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p v-if="!inventory.length" class="py-4 text-center text-xs text-brand-dark/40">No inventory data yet</p>
        </div>
      </div>
    </template>
  </div>
</template>
