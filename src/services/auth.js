/**
 * Admin authentication service — delegates to the backend JWT.
 *
 * Backend handles password verification, JWT signing, and session expiry.
 * This module stores/clears the token and admin info in localStorage.
 */

import { adminApi, setToken, setAdmin, getToken, clearAuth } from './api'

/* ── Login ──────────────────────────────────────────────── */
export async function login(email, password) {
  if (!email?.trim() || !password?.trim()) {
    return { ok: false, error: 'Email and password are required.' }
  }

  try {
    const res = await adminApi.login(email.trim().toLowerCase(), password)
    // Backend returns: { data: { token: "...", admin: { id, email, role } } }
    const data = res.data || res
    const token = data.token
    const admin = data.admin

    if (token) {
      setToken(token)
    }
    if (admin) {
      setAdmin(admin)
    }

    return { ok: true, token, admin, label: admin?.role || 'Admin' }
  } catch (err) {
    const msg = err.message || 'Login failed'
    if (msg.includes('429') || msg.includes('Too many')) {
      return { ok: false, error: 'Too many attempts. Try again later.' }
    }
    if (msg.includes('Invalid') || msg.includes('401')) {
      return { ok: false, error: 'Invalid email or password.' }
    }
    return { ok: false, error: msg || 'Something went wrong. Please try again.' }
  }
}

/* ── Session check ──────────────────────────────────────── */
export async function isAuthenticated() {
  if (!getToken()) return false

  try {
    await adminApi.me()
    return true
  } catch {
    clearAuth()
    return false
  }
}

/* ── Logout ─────────────────────────────────────────────── */
export function logout() {
  clearAuth()
  window.location.hash = '#'
  window.location.reload()
}

/* ── Lockout (backend handles this now, keep for UI compat) */
export function remainingLockoutSeconds() {
  return 0
}
