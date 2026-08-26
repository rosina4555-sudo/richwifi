<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'

const hash = ref(window.location.hash)
const onHash = () => (hash.value = window.location.hash)
onMounted(() => window.addEventListener('hashchange', onHash))
onUnmounted(() => window.removeEventListener('hashchange', onHash))
</script>

<template>
  <AdminView v-if="hash.startsWith('#/admin')" />
  <HomeView v-else />
</template>
