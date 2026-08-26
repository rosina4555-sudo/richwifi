<script setup>
import { ref, computed } from 'vue'
import LocationCard from '../components/LocationCard.vue'
import CheckoutModal from '../components/CheckoutModal.vue'
import { locations } from '../data/locations'
import logo from '../assets/logo.png'

const searchQuery = ref('')
const selectedLocation = ref(null)
const carouselEl = ref(null)
const activeDot = ref(0)

const filteredLocations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return locations
  return locations.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q),
  )
})

// Sync dots with carousel scroll position
const onCarouselScroll = () => {
  const el = carouselEl.value
  if (!el || !el.children.length) return
  const children = [...el.children]
  const center = el.scrollLeft + el.clientWidth / 2
  let nearest = 0
  let minDist = Infinity
  children.forEach((child, i) => {
    const childCenter = child.offsetLeft + child.offsetWidth / 2
    const dist = Math.abs(childCenter - center)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  })
  activeDot.value = nearest
}

const goToSlide = (i) => {
  const el = carouselEl.value
  if (!el || !el.children[i]) return
  const target = el.children[i]
  el.scrollTo({
    left: target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2,
    behavior: 'smooth',
  })
}

const handleBuy = (location) => {
  selectedLocation.value = location
}

const closeCheckout = () => {
  selectedLocation.value = null
}
</script>

<template>
  <!-- One-screen app shell on mobile; normal scrolling page on md+ -->
  <div
    class="flex h-dvh flex-col overflow-hidden text-brand-dark md:h-auto md:min-h-screen md:overflow-visible"
  >
    <!-- Header -->
    <header class="shrink-0 border-b border-brand/10 bg-surface/95 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16">
        <a href="#" class="flex shrink-0 items-center" aria-label="RichWiFi home">
          <img
            :src="logo"
            alt="RichWiFi"
            class="h-8 w-auto max-w-[10rem] object-contain sm:h-9 sm:max-w-none"
            draggable="false"
          />
        </a>
        <nav class="flex items-center gap-4 text-sm font-semibold sm:gap-6">
          <a href="#" class="text-brand transition-colors hover:text-accent">Home</a>
          <a href="#" class="text-brand-dark/50 transition-colors hover:text-accent">My Tickets</a>
        </nav>
      </div>
    </header>

    <main class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-4 pb-3 md:py-10">
      <!-- Compact clay hero -->
      <section
        class="relative isolate shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-dark via-brand to-accent px-5 py-5 text-center text-white sm:px-8 sm:py-10 md:rounded-[2rem]"
      >
        <div
          class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#ffffff20,transparent_55%)]"
        ></div>
        <div
          class="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
        ></div>

        <h1
          class="font-heading text-xl leading-tight font-bold tracking-tight text-balance sm:text-3xl lg:text-4xl"
        >
          Community Hotspot Network
        </h1>
        <p class="mx-auto mt-1.5 hidden max-w-md text-sm leading-relaxed text-white/85 sm:block">
          Secure, high-speed Wi-Fi tokens for every nearby location.
          Daily, weekly &amp; monthly plans — connect instantly.
        </p>

        <form class="mx-auto mt-3.5 flex w-full max-w-md gap-2 sm:mt-5 sm:gap-3" @submit.prevent>
          <div class="relative flex-1">
            <svg
              class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-white/60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search locations…"
              class="w-full rounded-2xl border border-white/15 bg-black/15 py-2.5 pr-4 pl-10 text-sm font-medium text-white placeholder:text-white/55 focus:border-white/35 focus:outline-none sm:py-3"
            />
          </div>
          <button
            type="submit"
            class="clay-btn-light shrink-0 rounded-2xl bg-surface px-5 py-2.5 text-sm font-bold text-brand sm:px-7 sm:py-3"
          >
            Search
          </button>
        </form>
      </section>

      <!-- Locations -->
      <section class="flex min-h-0 flex-1 flex-col mt-4 sm:mt-8">
        <div class="mb-2.5 flex shrink-0 items-end justify-between gap-4 sm:mb-5">
          <h2 class="font-heading text-base font-bold tracking-tight text-brand sm:text-xl lg:text-2xl">
            Available Locations
          </h2>
          <p class="text-xs font-medium text-brand-dark/45 sm:text-sm">
            {{ filteredLocations.length }}
            {{ filteredLocations.length === 1 ? 'spot' : 'spots' }} near you
          </p>
        </div>

        <!-- Mobile: swipeable snap carousel that fits the screen -->
        <div
          v-if="filteredLocations.length"
          ref="carouselEl"
          class="hide-scrollbar -mx-4 flex min-h-0 snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-p-6 px-4 pb-1 md:static md:mx-0 md:grid md:flex-none md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-3 lg:gap-6"
          @scroll.passive="onCarouselScroll"
        >
          <div
            v-for="(location, i) in filteredLocations"
            :key="location.id"
            class="w-[82vw] max-w-[22rem] shrink-0 snap-center last:snap-end md:w-full md:max-w-none md:shrink"
          >
            <LocationCard :location="location" :featured="i === 0" @buy="handleBuy" />
          </div>
        </div>

        <!-- Dot indicators (mobile carousel only) -->
        <div
          v-if="filteredLocations.length > 1"
          class="mt-3 flex shrink-0 items-center justify-center gap-2 md:hidden"
        >
          <button
            v-for="(_, i) in filteredLocations"
            :key="i"
            type="button"
            :aria-label="`Go to location ${i + 1}`"
            class="h-2 rounded-full transition-all duration-300"
            :class="[
              i === activeDot
                ? 'w-6 bg-gradient-to-r from-brand to-accent shadow-sm'
                : 'w-2 bg-brand/15 hover:bg-brand/30',
            ]"
            @click="goToSlide(i)"
          ></button>
        </div>

        <div
          v-else
          class="clay flex flex-1 flex-col items-center justify-center rounded-3xl border border-brand/10 bg-surface py-10 text-center md:flex-none"
        >
          <p class="font-heading text-base font-bold text-brand-dark/70">No locations found</p>
          <p class="mt-1 text-sm text-brand-dark/50">Try a different name or area.</p>
        </div>
      </section>
    </main>

    <!-- Footer: slim bar on mobile, full footer on desktop -->
    <footer class="shrink-0 border-t border-brand/10 bg-surface">
      <!-- Mobile -->
      <div class="flex items-center justify-between gap-3 px-4 py-2 md:hidden">
        <a href="#" aria-label="RichWiFi home" class="shrink-0">
          <img
            :src="logo"
            alt="RichWiFi"
            class="h-4 w-auto max-w-24 object-contain"
            draggable="false"
          />
        </a>
        <p class="text-[10px] font-medium text-brand-dark/40">
          © 2026 · Community Hotspot Network
        </p>
      </div>

      <!-- Desktop -->
      <div class="mx-auto hidden max-w-6xl px-4 py-8 md:block">
        <div class="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div class="max-w-sm">
            <a href="#" aria-label="RichWiFi home">
              <img
                :src="logo"
                alt="RichWiFi"
                class="h-8 w-auto max-w-xs object-contain"
                draggable="false"
              />
            </a>
            <p class="mt-2.5 text-sm leading-relaxed text-brand-dark/55">
              Secure, high-speed Wi-Fi tokens for every nearby location.
              Stay connected, together.
            </p>
          </div>
          <div class="flex gap-14">
            <div>
              <h3 class="font-heading text-xs font-bold tracking-widest text-brand uppercase">Explore</h3>
              <ul class="mt-3 space-y-2 text-sm font-medium text-brand-dark/60">
                <li><a href="#" class="transition-colors hover:text-accent">Locations</a></li>
                <li><a href="#" class="transition-colors hover:text-accent">My Tickets</a></li>
                <li><a href="#" class="transition-colors hover:text-accent">Support</a></li>
              </ul>
            </div>
            <div>
              <h3 class="font-heading text-xs font-bold tracking-widest text-brand uppercase">Contact</h3>
              <ul class="mt-3 space-y-2 text-sm font-medium text-brand-dark/60">
                <li>support@richwifi.com</li>
                <li>+1 (234) 567-890</li>
                <li>124 Main Street, Cityville</li>
              </ul>
            </div>
          </div>
        </div>
        <p class="mt-8 border-t border-brand/10 pt-4 text-center text-xs text-brand-dark/45">
          © 2026 RichWiFi · Community Hotspot Network · Stay connected, together.
        </p>
      </div>
    </footer>

    <!-- Purchase flow -->
    <CheckoutModal
      v-if="selectedLocation"
      :location="selectedLocation"
      @close="closeCheckout"
    />
  </div>
</template>
