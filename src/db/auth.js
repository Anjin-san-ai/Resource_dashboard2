// ---------------------------------------------------------------------------
// Auth API client.
//
// Talks to the /api/auth/* routes on the Express server (see server/index.js
// + server/users.js). A bearer token issued at login is stored in
// localStorage and attached to subsequent requests; sessions are in-memory
// on the server, so they don't survive an API restart (fine for this
// internal tool — the user just logs in again).
// ---------------------------------------------------------------------------

const BASE = '/api/auth'
const TOKEN_KEY = 'allocate.authToken'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}

export function requestAccess(data) {
  return request('/request-access', { method: 'POST', body: JSON.stringify(data) })
}

export async function login(username, password) {
  const { token, user } = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setToken(token)
  return user
}

export async function logout() {
  try {
    await request('/logout', { method: 'POST' })
  } finally {
    setToken(null)
  }
}

export async function me() {
  const { user } = await request('/me')
  return user
}

export async function listPending() {
  const { pending } = await request('/pending')
  return pending
}

export async function listUsers() {
  const { users } = await request('/users')
  return users
}

// Revoke access for an already-approved user (or delete a previously
// rejected one). Removes the user record entirely from users.json.
export function deleteUser(id) {
  return request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// Admin-only: force-set another user's password. They'll be required to
// choose their own new password the next time they log in.
export function adminSetPassword(id, password) {
  return request(`/admin/set-password/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

// Self-service password change (also used for the forced first-login change
// after an admin resets a password).
export function changePassword(currentPassword, newPassword) {
  return request('/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

// Admin-only: create a ready-to-use login in one step.
export function adminCreateUser(data) {
  return request('/admin/create-user', { method: 'POST', body: JSON.stringify(data) })
}

export const approveRequest = (id) => request(`/approve/${encodeURIComponent(id)}`, { method: 'POST' })
export const rejectRequest = (id) => request(`/reject/${encodeURIComponent(id)}`, { method: 'POST' })
