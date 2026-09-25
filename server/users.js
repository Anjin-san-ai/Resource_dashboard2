// ---------------------------------------------------------------------------
// Login-based access control.
//
// Users are persisted to "users.json" at the repo root (a separate file from
// the Community Sheet workbook — login accounts aren't business data and
// don't belong in the xlsx). Passwords are never stored in plaintext: each
// user gets a random salt and a scrypt hash (Node's built-in crypto, so no
// extra dependency is required for a demo-scale auth system).
//
// Access model:
//   - Anyone can submit a "request access" form (employee id, name, desired
//     username/password) -> creates a user with status "pending".
//   - Only an administrator can approve (status -> "approved") or reject
//     (request removed) a pending user.
//   - Only "approved" users can log in.
//   - A default admin (username "admin", password "admin@123") is seeded on
//     first run so there's always at least one approver.
//
// Sessions are simple bearer tokens kept in an in-memory Map (token ->
// username). They intentionally don't survive an API server restart —
// that's fine for this internal tool; users just log in again.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, '..', 'users.json')

const DEFAULT_ADMIN = {
  employeeId: 'ADMIN001',
  name: 'Administrator',
  username: 'admin',
  password: 'admin@123',
  role: 'admin',
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex')
  // Constant-time comparison to avoid timing side-channels.
  const a = Buffer.from(check, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return []
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

// Ensure the default admin account exists (first run, or if someone deletes
// every admin account from users.json). Idempotent.
export function ensureSeedAdmin() {
  const users = loadUsers()
  if (users.some((u) => u.role === 'admin')) return
  const { salt, hash } = hashPassword(DEFAULT_ADMIN.password)
  users.push({
    id: makeId('user'),
    employeeId: DEFAULT_ADMIN.employeeId,
    name: DEFAULT_ADMIN.name,
    username: DEFAULT_ADMIN.username,
    role: DEFAULT_ADMIN.role,
    status: 'approved',
    salt,
    hash,
    createdAt: new Date().toISOString(),
  })
  saveUsers(users)
}

export function findByUsername(username) {
  const t = String(username || '').trim().toLowerCase()
  return loadUsers().find((u) => u.username.toLowerCase() === t)
}

export function findById(id) {
  return loadUsers().find((u) => u.id === id)
}

// Strip credential material before sending a user object to the client.
export function sanitize(user) {
  if (!user) return null
  const { salt, hash, ...rest } = user
  return rest
}

export function createAccessRequest({ employeeId, name, username, password }) {
  const users = loadUsers()
  const uname = String(username || '').trim()
  if (!uname) throw new Error('Username is required')
  if (!String(employeeId || '').trim()) throw new Error('Employee ID is required')
  if (!String(name || '').trim()) throw new Error('Name is required')
  if (!password || String(password).length < 4) throw new Error('Password must be at least 4 characters')
  if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
    throw new Error('That username is already taken or pending approval')
  }
  const { salt, hash } = hashPassword(password)
  const row = {
    id: makeId('user'),
    employeeId: String(employeeId).trim(),
    name: String(name).trim(),
    username: uname,
    role: 'user',
    status: 'pending',
    salt,
    hash,
    createdAt: new Date().toISOString(),
  }
  users.push(row)
  saveUsers(users)
  return sanitize(row)
}

export function approveUser(id) {
  const users = loadUsers()
  const u = users.find((x) => x.id === id)
  if (!u) throw new Error('Request not found')
  u.status = 'approved'
  u.approvedAt = new Date().toISOString()
  saveUsers(users)
  return sanitize(u)
}

// Admin-initiated: create a ready-to-use (already approved) login in one step,
// skipping the self-service request/approve flow. Used by the "Create login"
// form on the Access Requests page.
export function adminCreateUser({ employeeId, name, username, password, role = 'user', mustChangePassword = false }) {
  const users = loadUsers()
  const uname = String(username || '').trim()
  if (!uname) throw new Error('Username is required')
  if (!String(employeeId || '').trim()) throw new Error('Employee ID is required')
  if (!String(name || '').trim()) throw new Error('Name is required')
  if (!password || String(password).length < 4) throw new Error('Password must be at least 4 characters')
  if (role !== 'user' && role !== 'admin') throw new Error('Invalid role')
  if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
    throw new Error('That username is already taken')
  }
  const { salt, hash } = hashPassword(password)
  const now = new Date().toISOString()
  const row = {
    id: makeId('user'),
    employeeId: String(employeeId).trim(),
    name: String(name).trim(),
    username: uname,
    role,
    status: 'approved',
    salt,
    hash,
    createdAt: now,
    approvedAt: now,
    mustChangePassword: !!mustChangePassword,
    createdByAdmin: true,
  }
  users.push(row)
  saveUsers(users)
  return sanitize(row)
}

export function rejectUser(id) {
  const users = loadUsers()
  const next = users.filter((x) => x.id !== id)
  if (next.length === users.length) throw new Error('Request not found')
  saveUsers(next)
  return { ok: true }
}

// Remove a user entirely — used both for rejecting a pending request and for
// revoking an already-approved user's access. Guards against removing the
// last remaining admin account, since that would lock everyone out of the
// Access Requests page (no one left to approve new users).
export function deleteUser(id) {
  const users = loadUsers()
  const target = users.find((x) => x.id === id)
  if (!target) throw new Error('User not found')
  if (target.role === 'admin') {
    const otherAdmins = users.filter((u) => u.role === 'admin' && u.id !== id)
    if (otherAdmins.length === 0) {
      throw new Error('Cannot delete the last remaining administrator account')
    }
  }
  const next = users.filter((x) => x.id !== id)
  saveUsers(next)
  // Any active session tokens for this user become invalid on their next
  // request since sessionUser() re-looks-up the username via findByUsername.
  return { ok: true }
}

export function verifyLogin(username, password) {
  const u = findByUsername(username)
  if (!u) throw new Error('Invalid username or password')
  if (u.status === 'pending') throw new Error('Your access request is still pending administrator approval')
  if (u.status === 'rejected') throw new Error('Your access request was rejected')
  if (!verifyPassword(password, u.salt, u.hash)) throw new Error('Invalid username or password')
  return sanitize(u)
}

// Admin-initiated password reset: sets a new password for any user and flags
// `mustChangePassword` so the affected user is forced to pick their own
// password the next time they log in (see /api/auth/change-password and the
// forced-change screen in App.jsx).
export function adminSetPassword(id, newPassword) {
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('Password must be at least 4 characters')
  }
  const users = loadUsers()
  const u = users.find((x) => x.id === id)
  if (!u) throw new Error('User not found')
  const { salt, hash } = hashPassword(newPassword)
  u.salt = salt
  u.hash = hash
  u.mustChangePassword = true
  u.passwordSetByAdminAt = new Date().toISOString()
  saveUsers(users)
  return sanitize(u)
}

// Self-service password change. `currentPassword` must match unless the
// account is currently flagged `mustChangePassword` (i.e. an admin just
// reset it and the user hasn't logged in with the temp password to a full
// session yet — in that flow the caller is already authenticated via the
// session created at login, so we still allow the change but don't require
// re-confirming the temp password, matching a typical "first login" reset
// flow).
export function changeOwnPassword(username, currentPassword, newPassword) {
  if (!newPassword || String(newPassword).length < 4) {
    throw new Error('New password must be at least 4 characters')
  }
  const users = loadUsers()
  const u = users.find((x) => x.username.toLowerCase() === String(username || '').trim().toLowerCase())
  if (!u) throw new Error('User not found')
  if (!u.mustChangePassword) {
    if (!currentPassword || !verifyPassword(currentPassword, u.salt, u.hash)) {
      throw new Error('Current password is incorrect')
    }
  }
  const { salt, hash } = hashPassword(newPassword)
  u.salt = salt
  u.hash = hash
  u.mustChangePassword = false
  saveUsers(users)
  return sanitize(u)
}

// --- session tokens (in-memory; reset on API restart) ----------------------

const sessions = new Map() // token -> { username, createdAt }

export function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, { username, createdAt: Date.now() })
  return token
}

export function sessionUser(token) {
  const s = token && sessions.get(token)
  if (!s) return null
  const u = findByUsername(s.username)
  return u ? sanitize(u) : null
}

export function destroySession(token) {
  sessions.delete(token)
}
