/**
 * RichWiFi API Client
 *
 * Handles all communication with the backend.
 * JWT tokens are stored in localStorage and attached to every request.
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

const TOKEN_KEY = 'rw_backend_token'
const ADMIN_KEY = 'rw_backend_admin'

/* ── Token management ────────────────────────────────── */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getAdmin() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY))
  } catch {
    return null
  }
}

export function setAdmin(admin) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}

export function isAuthenticated() {
  return !!getToken()
}

/* ── Fetch wrapper ───────────────────────────────────── */
async function request(method, path, body = null, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config = { method, headers }
  if (body && method !== 'GET') {
    config.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, config)
  } catch (fetchErr) {
    throw new Error('Cannot connect to server. Please check your connection.')
  }

  // Handle 401 — clear auth and redirect
  if (res.status === 401 && !options.allow401) {
    clearAuth()
    window.location.hash = '#/admin'
    window.location.reload()
    throw new Error('Session expired')
  }

  // Parse JSON safely
  let data
  try {
    data = await res.json()
  } catch {
    // Non-JSON response (server crash, 502, etc)
    const friendly = {
      502: 'Server is temporarily unavailable. Please try again in a moment.',
      500: 'Something went wrong on our end. Please try again.',
      503: 'Service is temporarily unavailable. Please try again later.',
      404: 'The requested resource was not found.',
      429: 'Too many requests. Please wait a moment and try again.',
    }
    throw new Error(friendly[res.status] || 'Unable to connect to the server. Please try again.')
  }

  if (!res.ok) {
    // Use backend error message if available, otherwise show friendly message
    const backendMsg = data?.error || ''
    if (backendMsg && !backendMsg.includes('status') && !backendMsg.includes('(')) {
      throw new Error(backendMsg)
    }
    const friendly = {
      400: 'Please check your input and try again.',
      401: 'Your session has expired. Please log in again.',
      403: 'You do not have permission to do this.',
      404: 'Not found. Please check and try again.',
      409: 'This action conflicts with existing data. Please try again.',
      429: 'Too many requests. Please wait a moment.',
      500: 'Something went wrong. Please try again.',
    }
    throw new Error(friendly[res.status] || backendMsg || 'Something went wrong. Please try again.')
  }

  return data
}

/* ── Public API (no auth) ────────────────────────────── */
export const api = {
  // Locations
  getLocations: () => request('GET', '/api/locations'),
  getPlans: (locationId) => request('GET', `/api/plans/${locationId}`),
  getStock: (locationId, planId) => request('GET', `/api/stock/${locationId}/${planId}`),

  // Orders
  createOrder: (data) => request('POST', '/api/orders', data),
  getOrderStatus: (orderId) => request('GET', `/api/orders/${orderId}/status`, null, { allow401: true }),

  // Purchase lookup by phone number
  lookupTokens: (data) => request('POST', '/api/tokens/lookup', data),

  // Web Push
  pushVapidKey: () => request('GET', '/api/push/vapid-public-key'),
  pushSubscribe: (data) => request('POST', '/api/push/subscribe', data),
  pushUnsubscribe: (data) => request('POST', '/api/push/unsubscribe', data),
}

/* ── Admin API (JWT required) ────────────────────────── */
export const adminApi = {
  // Auth
  login: (email, password) => request('POST', '/api/admin/auth/login', { email, password }, { allow401: true }),
  me: () => request('GET', '/api/admin/auth/me'),

  // Locations
  getLocations: () => request('GET', '/api/admin/locations'),
  createLocation: (data) => request('POST', '/api/admin/locations', data),
  updateLocation: (id, data) => request('PUT', `/api/admin/locations/${id}`, data),
  toggleLocation: (id, isActive) => request('PUT', `/api/admin/locations/${id}/toggle`, { is_active: isActive }),
  deleteLocation: (id) => request('DELETE', `/api/admin/locations/${id}`),

  // Plans
  getPlans: (locationId) => request('GET', `/api/admin/plans/${locationId}`),
  createPlan: (data) => request('POST', '/api/admin/plans', data),
  updatePlan: (id, data) => request('PUT', `/api/admin/plans/${id}`, data),
  togglePlan: (id, isActive) => request('PUT', `/api/admin/plans/${id}/toggle`, { is_active: isActive }),
  togglePlanAtLocation: (id, locationId, isActive) =>
    request('PUT', `/api/admin/plans/${id}/toggle/${locationId}`, { is_active: isActive }),
  removePlanOverride: (id, locationId) =>
    request('DELETE', `/api/admin/plans/${id}/toggle/${locationId}`),
  getVisibility: (id) => request('GET', `/api/admin/plans/${id}/visibility`),

  // Tokens
  getTokens: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/tokens${qs ? '?' + qs : ''}`)
  },
  importTokensPreview: (formData) => {
    // Step 1: Upload PDF, extract, validate — returns preview
    const token = getToken()
    return fetch(`${API_BASE}/api/admin/tokens/import/preview`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    }).then(r => {
      if (!r.ok) {
        return r.json().catch(() => null).then(data => {
          throw new Error(data?.error || 'Failed to process PDF. Please try again.')
        })
      }
      return r.json()
    })
  },
  importTokensConfirm: (previewId) => {
    // Step 2: Confirm and insert valid tokens
    return request('POST', '/api/admin/tokens/import/confirm', { previewId })
  },
  exportTokens: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return fetch(`${API_BASE}/api/admin/tokens/export${qs ? '?' + qs : ''}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    }).then(r => {
      if (!r.ok) throw new Error('Export failed. Please try again.')
      return r
    })
  },
  getBatches: () => request('GET', '/api/admin/tokens/batches'),

  // Orders
  getOrders: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/orders${qs ? '?' + qs : ''}`)
  },
  getOrder: (id) => request('GET', `/api/admin/orders/${id}`),
  refundOrder: (id) => request('POST', `/api/admin/orders/${id}/refund`),

  // Analytics
  getOverview: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/overview${qs ? '?' + qs : ''}`)
  },
  getDailySales: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/daily-sales${qs ? '?' + qs : ''}`)
  },
  getRevenueByDay: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/revenue-by-day${qs ? '?' + qs : ''}`)
  },
  getRevenueByHour: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/revenue-by-hour${qs ? '?' + qs : ''}`)
  },
  getByLocation: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/by-location${qs ? '?' + qs : ''}`)
  },
  getByPlan: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/by-plan${qs ? '?' + qs : ''}`)
  },
  getInventory: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/inventory${qs ? '?' + qs : ''}`)
  },
  getStockAlerts: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/stock-alerts${qs ? '?' + qs : ''}`)
  },
  getSmsLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/sms-log${qs ? '?' + qs : ''}`)
  },
  getPushLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request('GET', `/api/admin/analytics/push-log${qs ? '?' + qs : ''}`)
  },

  exportCsv: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return fetch(`${API_BASE}/api/admin/analytics/export${qs ? '?' + qs : ''}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    }).then(r => {
      if (!r.ok) throw new Error('Export failed. Please try again.')
      return r
    })
  },

  // Webhook simulator (dev only)
  simulatePayment: (orderId) => request('POST', '/api/test/webhooks/paystack', { orderId }),
}
