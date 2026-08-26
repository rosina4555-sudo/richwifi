import { reactive } from 'vue'

/* ── Plan definitions ─────────────────────────────────────── */
export const DURATION_PLANS = [
  { id: 'daily', label: '1 Day', duration: 'daily', price: 2, validity: '24 hours' },
  { id: 'weekly', label: '1 Week', duration: 'weekly', price: 7, validity: '7 days' },
  { id: 'monthly', label: '1 Month', duration: 'monthly', price: 20, validity: '30 days' },
]

export const LOCATION_THEMES = [
  { name: 'Brand Red', css: 'from-[#6d0214]/80 to-[#c50125]/60' },
  { name: 'Royal Blue', css: 'from-[#3b4cca] to-[#667eea]' },
  { name: 'Emerald', css: 'from-[#059669] to-[#10b981]' },
  { name: 'Sunset', css: 'from-[#ea580c] to-[#f59e0b]' },
  { name: 'Purple', css: 'from-[#6d28d9] to-[#a78bfa]' },
]

/* ── Helpers ─────────────────────────────────────────────── */
let _id = Date.now()
const uid = () => `id-${(++_id).toString(36)}`
const iso = (d) => d.toISOString()
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function makeCode(label) {
  const p = label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${p}-${seg()}-${seg()}`
}

function today() { return new Date() }

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  d.setHours(Math.floor(Math.random() * 14) + 8, Math.floor(Math.random() * 60), 0, 0)
  return d
}

function planPrice(plans, id) {
  return plans.find((p) => p.id === id)?.price ?? 2
}

/* ── Seed data ───────────────────────────────────────────── */
function seed() {
  const rnd = mulberry32(20260825)

  const locations = [
    {
      id: 'downtown', name: 'Downtown Hub', address: '124 Main Street, Cityville',
      color: 'from-[#6d0214]/80 to-[#c50125]/60', themeIndex: 0,
      plans: DURATION_PLANS.map((p) => ({ ...p })),
    },
    {
      id: 'uptown', name: 'Uptown Plaza', address: '88 Oak Avenue, Northside',
      color: 'from-[#3b4cca] to-[#667eea]', themeIndex: 1,
      plans: DURATION_PLANS.map((p) => ({ ...p })),
    },
    {
      id: 'riverside', name: 'Riverside Center', address: 'Market Street, Riverside',
      color: 'from-[#059669] to-[#10b981]', themeIndex: 2,
      plans: DURATION_PLANS.map((p) => ({ ...p })),
    },
  ]

  const tokens = []
  const sales = []
  const locIds = locations.map((l) => l.id)
  const planIds = DURATION_PLANS.map((p) => p.id)

  // Seed ~150 sales over past 30 days
  for (let d = 29; d >= 0; d--) {
    const count = Math.floor(rnd() * 5) + 1
    for (let j = 0; j < count; j++) {
      const locId = locIds[Math.floor(rnd() * locIds.length)]
      const planId = planIds[Math.floor(rnd() * planIds.length)]
      const loc = locations.find((l) => l.id === locId)
      const price = planPrice(loc.plans, planId)
      const qty = Math.floor(rnd() * 3) + 1
      const saleDate = daysAgo(d)
      const code = makeCode(planId === 'daily' ? 'DAY' : planId === 'weekly' ? 'WK' : 'MO')

      tokens.push({
        id: uid(), code, locationId: locId, planId,
        status: 'sold', createdAt: iso(saleDate), soldAt: iso(saleDate),
      })

      sales.push({
        id: uid(), locationId: locId, planId,
        quantity: qty, total: +(price * qty).toFixed(2),
        email: rnd() > 0.3 ? `user${Math.floor(rnd() * 999)}@demo.com` : '',
        ref: `RW-${Date.now().toString(36).slice(-6).toUpperCase()}${Math.floor(rnd() * 99)}`,
        date: iso(saleDate),
      })
    }
  }

  // Add some unsold tokens for inventory display
  for (const loc of locations) {
    for (const plan of loc.plans) {
      for (let k = 0; k < 15; k++) {
        tokens.push({
          id: uid(), code: makeCode(plan.label), locationId: loc.id, planId: plan.id,
          status: 'available', createdAt: iso(daysAgo(Math.floor(rnd() * 10))),
        })
      }
    }
  }

  return { locations, tokens, sales }
}

/* ── Persistence ─────────────────────────────────────────── */
const STORAGE_KEY = 'richwifi-store-v1'

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch { /* quota exceeded — ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data?.locations && data?.tokens && data?.sales) return data
  } catch { /* corrupted — ignore */ }
  return null
}

/* ── Reactive store ──────────────────────────────────────── */
export const store = reactive(load() || seed())

// Auto-persist on every mutation
const _persist = () => persist()
let _timer = null
const debouncedPersist = () => {
  clearTimeout(_timer)
  _timer = setTimeout(_persist, 300)
}

// Watch all top-level keys
const watchDeep = (obj) => {
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === 'object') {
      const handler = { set: debouncedPersist, deleteProperty: debouncedPersist }
      try { obj[key] = new Proxy(obj[key], handler) } catch { /* non-extensible */ }
    }
  }
}
watchDeep(store)

// Save on store change via JSON diff (simple)
let _snap = JSON.stringify(store)
setInterval(() => {
  const s = JSON.stringify(store)
  if (s !== _snap) { _snap = s; persist() }
}, 2000)

/* ── Mutations ───────────────────────────────────────────── */
export function addLocation({ name, address, themeIndex = 0 }) {
  const theme = LOCATION_THEMES[themeIndex]
  store.locations.push({
    id: uid(), name, address, color: theme.css, themeIndex,
    plans: DURATION_PLANS.map((p) => ({ ...p })),
  })
  persist()
}

export function updateLocation(id, patch) {
  const loc = store.locations.find((l) => l.id === id)
  if (!loc) return
  Object.assign(loc, patch)
  if (patch.themeIndex !== undefined) {
    loc.color = LOCATION_THEMES[patch.themeIndex].css
  }
  persist()
}

export function removeLocation(id) {
  const idx = store.locations.findIndex((l) => l.id === id)
  if (idx === -1) return
  store.locations.splice(idx, 1)
  // Remove related tokens and sales
  store.tokens.splice(0, store.tokens.length, ...store.tokens.filter((t) => t.locationId !== id))
  store.sales.splice(0, store.sales.length, ...store.sales.filter((s) => s.locationId !== id))
  persist()
}

export function updatePlanPrice(locationId, planId, price) {
  const loc = store.locations.find((l) => l.id === locationId)
  if (!loc) return
  const plan = loc.plans.find((p) => p.id === planId)
  if (plan) plan.price = +Number(price).toFixed(2)
  persist()
}

export function addTokenBatch({ locationId, planId, quantity }) {
  const plan = DURATION_PLANS.find((p) => p.id === planId)
  if (!plan) return []
  const now = new Date()
  const batch = []
  for (let i = 0; i < quantity; i++) {
    const token = {
      id: uid(), code: makeCode(plan.label), locationId, planId,
      status: 'available', createdAt: iso(now),
    }
    store.tokens.push(token)
    batch.push(token)
  }
  persist()
  return batch
}

export function recordSale({ locationId, planId, quantity, email }) {
  const loc = store.locations.find((l) => l.id === locationId)
  if (!loc) return { sale: null, codes: [] }
  const plan = loc.plans.find((p) => p.id === planId) || DURATION_PLANS.find((p) => p.id === planId)
  const price = plan?.price ?? 2

  // Assign available tokens as sold
  const codes = []
  const avail = store.tokens.filter(
    (t) => t.locationId === locationId && t.planId === planId && t.status === 'available',
  )
  const now = iso(new Date())

  for (let i = 0; i < quantity; i++) {
    if (avail[i]) {
      avail[i].status = 'sold'
      avail[i].soldAt = now
      codes.push(avail[i].code)
    } else {
      // Generate new tokens on-the-fly if inventory is short
      const label = plan?.label || 'Token'
      const code = makeCode(label)
      store.tokens.push({
        id: uid(), code, locationId, planId, status: 'sold', createdAt: now, soldAt: now,
      })
      codes.push(code)
    }
  }

  const sale = {
    id: uid(), locationId, planId, quantity,
    total: +(price * quantity).toFixed(2),
    email: email || '', ref: `RW-${Date.now().toString(36).slice(-6).toUpperCase()}`,
    date: now,
  }
  store.sales.push(sale)
  persist()
  return { sale, codes }
}

/* ── Analytics getters ───────────────────────────────────── */
export function kpis() {
  const sales = store.sales
  const now = today()
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7)
  const d14 = new Date(now); d14.setDate(d14.getDate() - 14)

  const recent = sales.filter((s) => new Date(s.date) >= d7)
  const previous = sales.filter((s) => { const d = new Date(s.date); return d >= d14 && d < d7 })

  const revenue = (arr) => arr.reduce((s, x) => s + x.total, 0)
  const orders = (arr) => arr.length
  const tokensSold = (arr) => arr.reduce((s, x) => s + x.quantity, 0)

  const rNow = revenue(recent), rPrev = revenue(previous)
  const oNow = orders(recent), oPrev = orders(previous)
  const tNow = tokensSold(recent), tPrev = tokensSold(previous)

  return {
    totalRevenue: revenue(sales),
    totalOrders: orders(sales),
    totalTokensSold: tokensSold(sales),
    avgOrderValue: sales.length ? +(revenue(sales) / orders(sales)).toFixed(2) : 0,
    revenueDelta: rPrev ? +(((rNow - rPrev) / rPrev) * 100).toFixed(1) : 0,
    ordersDelta: oPrev ? +(((oNow - oPrev) / oPrev) * 100).toFixed(1) : 0,
    tokensDelta: tPrev ? +(((tNow - tPrev) / tPrev) * 100).toFixed(1) : 0,
    availableTokens: store.tokens.filter((t) => t.status === 'available').length,
  }
}

export function dailyRevenue(days = 14) {
  const sales = store.sales
  const result = []
  const now = today()
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now); day.setDate(day.getDate() - d)
    const dayStr = day.toISOString().slice(0, 10)
    const daySales = sales.filter((s) => s.date.slice(0, 10) === dayStr)
    result.push({
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: +daySales.reduce((s, x) => s + x.total, 0).toFixed(2),
    })
  }
  return result
}

export function revenueByDuration() {
  const map = {}
  for (const s of store.sales) {
    map[s.planId] = (map[s.planId] || 0) + s.total
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0)
  return DURATION_PLANS.map((p) => ({
    label: p.label,
    value: +(map[p.id] || 0).toFixed(2),
    percent: total ? +(((map[p.id] || 0) / total) * 100).toFixed(1) : 0,
  }))
}

export function revenueByLocation() {
  const map = {}
  for (const s of store.sales) {
    map[s.locationId] = (map[s.locationId] || 0) + s.total
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0)
  return store.locations.map((l) => ({
    id: l.id,
    label: l.name,
    value: +((map[l.id] || 0)).toFixed(2),
    percent: total ? +(((map[l.id] || 0) / total) * 100).toFixed(1) : 0,
    color: l.color,
  })).sort((a, b) => b.value - a.value)
}

export const currency = (value) => `$${Number(value).toFixed(2)}`

export function tokenInventoryByLocation() {
  return store.locations.map((l) => {
    const tokens = store.tokens.filter((t) => t.locationId === l.id)
    return {
      id: l.id,
      name: l.name,
      available: tokens.filter((t) => t.status === 'available').length,
      sold: tokens.filter((t) => t.status === 'sold').length,
      total: tokens.length,
    }
  })
}
