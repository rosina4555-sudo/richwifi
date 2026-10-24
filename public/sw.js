/**
 * RichWiFi service worker — Web Push delivery.
 *
 * Receives encrypted push payloads from the backend and turns them into
 * system notifications. Payload shape (set by PushService::buildTicketPayload):
 *   { title, body, icon, data: { orderId, reference, url } }
 */

self.addEventListener('push', (event) => {
  let payload = {
    title: 'RichWiFi',
    body: 'You have a new message.',
    icon: '/favicon.svg',
    data: { url: '/' },
  }

  try {
    if (event.data) {
      const parsed = event.data.json()
      payload = { ...payload, ...parsed }
    }
  } catch {
    // Non-JSON payload — keep defaults
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'RichWiFi', {
      body: payload.body || '',
      icon: payload.icon || '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.data?.orderId || 'richwifi-ticket',
      renotify: false,
      data: payload.data || { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = event.notification.data?.url || '/'
  const url = new URL(target, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an already-open tab first (e.g. customer still on the site)
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})

// Allow the page to trigger a test notification (dev/debug only)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data
    event.source.showNotification(title, options)
  }
})
