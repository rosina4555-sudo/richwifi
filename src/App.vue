<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { isAuthenticated } from './services/auth'
import HomeView from './views/HomeView.vue'
import AdminLogin from './views/AdminLogin.vue'
import AdminView from './views/AdminView.vue'

const hash = ref(window.location.hash)
const authed = ref(false)
const ready = ref(false) // wait for session check before rendering

const onHash = () => { hash.value = window.location.hash }
onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  if (hash.value.startsWith('#/admin')) {
    authed.value = await isAuthenticated()
  }
  ready.value = true
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))

const isHome = computed(() => !hash.value.startsWith('#/admin'))
const isLogin = computed(() => hash.value.startsWith('#/admin') && !authed.value)
const isDashboard = computed(() => hash.value.startsWith('#/admin') && authed.value)

const onAuthenticated = () => {
  authed.value = true
}
</script>

<template>
  <template v-if="ready">
    <HomeView v-if="isHome" />
    <AdminLogin v-else-if="isLogin" @authenticated="onAuthenticated" />
    <AdminView v-else-if="isDashboard" />
  </template>
</template>
