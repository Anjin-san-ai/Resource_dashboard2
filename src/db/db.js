// ---------------------------------------------------------------------------
// Data access layer.
//
// The app is backed by a small Express server that reads and writes
// "Community Sheet.xlsx" (see /server). This module is a thin async client
// over that REST API; every mutation is persisted to the workbook on the
// server. All functions return promises.
// ---------------------------------------------------------------------------

import { getToken } from './auth.js'

const BASE = '/api'

async function request(path, options = {}) {
  // Always bypass any browser/service-worker HTTP cache: the server re-reads
  // the workbook fresh, so a cached GET here would reintroduce stale data.
  // Attach the bearer token so the data routes (now auth-protected on the
  // BFF) accept the app's own reads/mutations.
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

export function fetchData() {
  return request('/data')
}

// Contractor (CWR) status: always reads CWR_List straight from the workbook
// on the server, never cached — call this directly rather than through
// AppContext's polled `data` so the page always shows the live sheet.
export function fetchCwrStatus() {
  return request('/cwr').then((body) => body.cwr)
}

// Opportunities
export const createOpty = (data) => request('/optys', { method: 'POST', body: JSON.stringify(data) })
export const updateOpty = (id, data) =>
  request(`/optys/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteOpty = (id) => request(`/optys/${encodeURIComponent(id)}`, { method: 'DELETE' })

// Resources
export const createResource = (data) => request('/resources', { method: 'POST', body: JSON.stringify(data) })
export const updateResource = (id, data) =>
  request(`/resources/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteResource = (id) => request(`/resources/${encodeURIComponent(id)}`, { method: 'DELETE' })

// Allocations
export const createAllocation = (data) =>
  request('/allocations', { method: 'POST', body: JSON.stringify(data) })
export const updateAllocation = (id, data) =>
  request(`/allocations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAllocation = (id) =>
  request(`/allocations/${encodeURIComponent(id)}`, { method: 'DELETE' })
