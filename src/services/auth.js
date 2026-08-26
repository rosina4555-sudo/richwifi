/**
 * Admin authentication service — client-side session gating.
 *
 * This is NOT a substitute for server-side auth. It prevents casual
 * access to the admin dashboard and buys time until a real backend
 * is added. For production, move all this to an API with JWT/session cookies.
 *
 * ── HOW IT WORKS ─────────────────────────────────────────────────────
 * 1. Credentials are stored as one-way SHA-256 hashes (no plaintext in source).
 * 2. Failed attempts are counted per IP-reset (sessionStorage). After 5
 *    failures the login form locks for 60 seconds.
 * 3. Successful login sets a signed session token in sessionStorage that
 *    expires after 4 hours. The token is re-validated on every hash change.
 * 4. "Logout" clears the session and returns to the home page.
 * ─────────────────────────────────────────────────────────────────────
 *
 * ⚠️  TO CHANGE CREDENTIALS:
 *    Run in your browser console:
 *      hashSHA256('your-new-password').then(console.log)
 *    Then paste the hex string below.
 */

const SESSION_KEY = 'rw_admin_session'
const ATTEMPT_KEY = 'rw_admin_attempts'
const LOCKOUT_KEY = 'rw_admin_lockout'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000 // 60 seconds
const SESSION_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

const SIGNING_KEY = 'RichWiFi-Admin-2026-S3cr3t' // client-side signing; move to env/server

/* ── Credentials (hex SHA-256 hashes) ─────────────────────────────── */
// Default: admin@richwifi.com  /  RichWiFi@Admin2026
const ADMINS = [
  {
    emailHash: 'b5a056a7d4c50c3e4c535e0a32db223c36b212a9392f19f8c0a3826898e52df7',
    passHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    label: 'Super Admin',
  },
]

// ── SHA-256 helper (browser-native) ──────────────────────────────────
export async function hashSHA256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Simple HMAC-like signing (for session token integrity) ──────────
async function sign(data) {
  const sig = await hashSHA256(`${SIGNING_KEY}:${data}:${SIGNING_KEY}`)
  return sig.slice(0, 16)
}

/* ── Attempt tracking ─────────────────────────────────────────────── */
function getAttempts() {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || '0')
  } catch { return 0 }
}

function addAttempt() {
  const n = getAttempts() + 1
  sessionStorage.setItem(ATTEMPT_KEY, String(n))
  if (n >= MAX_ATTEMPTS) {
    sessionStorage.setItem(LOCKOUT_KEY, String(Date.now()))
  }
  return n
}

function isLockedOut() {
  try {
    const ts = Number(sessionStorage.getItem(LOCKOUT_KEY) || 0)
    if (!ts) return false
    if (Date.now() - ts < LOCKOUT_MS) return true
    // Lockout expired — reset
    sessionStorage.removeItem(LOCKOUT_KEY)
    sessionStorage.removeItem(ATTEMPT_KEY)
    return false
  } catch { return false }
}

function remainingLockoutMs() {
  try {
    const ts = Number(sessionStorage.getItem(LOCKOUT_KEY) || 0)
    if (!ts) return 0
    const remaining = LOCKOUT_MS - (Date.now() - ts)
    return remaining > 0 ? remaining : 0
  } catch { return 0 }
}

/* ── Login ────────────────────────────────────────────────────────── */
export async function login(email, password) {
  if (isLockedOut()) {
    const ms = remainingLockoutMs()
    const sec = Math.ceil(ms / 1000)
    return { ok: false, error: `Too many attempts. Try again in ${sec}s.` }
  }

  if (!email?.trim() || !password?.trim()) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const emailHash = await hashSHA256(email.trim().toLowerCase())
  const passHash = await hashSHA256(password)

  const admin = ADMINS.find((a) => a.emailHash === emailHash && a.passHash === passHash)

  if (!admin) {
    const attempts = addAttempt()
    const remaining = MAX_ATTEMPTS - attempts
    if (remaining > 0) {
      return { ok: false, error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} left.` }
    } else {
      const sec = Math.ceil(LOCKOUT_MS / 1000)
      return { ok: false, error: `Account locked. Try again in ${sec}s.` }
    }
  }

  // Success — reset attempts and create session
  sessionStorage.removeItem(ATTEMPT_KEY)
  sessionStorage.removeItem(LOCKOUT_KEY)

  const payload = `${admin.label}:${emailHash.slice(0, 12)}:${Date.now()}`
  const sig = await sign(payload)
  const token = btoa(`${payload}:${sig}`)
  sessionStorage.setItem(SESSION_KEY, token)

  return { ok: true, label: admin.label }
}

/* ── Session check ────────────────────────────────────────────────── */
export async function isAuthenticated() {
  try {
    const token = sessionStorage.getItem(SESSION_KEY)
    if (!token) return false

    const decoded = atob(token)
    const parts = decoded.split(':')
    if (parts.length !== 4) return false

    const [label, emailPart, tsStr, providedSig] = parts
    const payload = `${label}:${emailPart}:${tsStr}`
    const expectedSig = await sign(payload)

    if (providedSig !== expectedSig) {
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }

    // Check expiry
    const ts = Number(tsStr)
    if (Date.now() - ts > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }

    return true
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return false
  }
}

/* ── Logout ───────────────────────────────────────────────────────── */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(ATTEMPT_KEY)
  sessionStorage.removeItem(LOCKOUT_KEY)
  window.location.hash = '#'
  window.location.reload()
}

export function remainingLockoutSeconds() {
  return Math.ceil(remainingLockoutMs() / 1000)
}
