// src/lib/storage.js
const KEY = 'jellyland_cycle_count'
const AUTH_KEY = 'jellyland_auth'
const EXPIRY_DAYS = 60          // how long saved counts stick around (until "Start fresh")
const AUTH_SESSION_DAYS = 2     // how long a PIN login stays valid on this device

export function saveProgress(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      ...data,
      savedAt: Date.now(),
      expiresAt: Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    }))
  } catch (e) { console.error('Save failed:', e) }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(KEY)
      return null
    }
    return data
  } catch { return null }
}

export function clearProgress() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function hasSavedProgress() {
  const d = loadProgress()
  return d && Object.keys(d.counts || {}).length > 0
}

// Auth persistence — device stays logged in for AUTH_SESSION_DAYS, then auto-logs-out.
// Logging out never touches saved cycle-count progress (separate key above), so anything
// locked/saved is still there when someone logs back in with the PIN.
//
// `user` is { id, name } when the PIN matched a staff_users row, or null when
// it matched the old shared PIN (identity unknown — that's fine, forms just
// fall back to letting someone type a name like before).
export function saveAuth(user = null) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      loggedInAt: Date.now(),
      expiresAt: Date.now() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000,
      user,
    }))
  } catch {}
}

export function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      localStorage.removeItem(AUTH_KEY)
      return false
    }
    return true
  } catch { return false }
}

// The logged-in user's { id, name }, or null if there isn't a session or the
// session was started with the old shared PIN (no identity attached).
export function loadAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data.expiresAt || Date.now() > data.expiresAt) return null
    return data.user || null
  } catch { return null }
}

export function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY) } catch {}
}
