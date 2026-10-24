import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerServiceWorker } from './services/push'

// Register the Web Push service worker (no-op where unsupported).
// Best-effort: SW failure must never block the app.
registerServiceWorker()

createApp(App).mount('#app')
