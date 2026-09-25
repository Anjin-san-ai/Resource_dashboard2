import { getToken } from './auth.js'

const BASE = '/api/agent'

async function request(path, options = {}) {
  const token = getToken()
  const response = await fetch(BASE + path, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch {
      /* Ignore non-JSON error bodies. */
    }
    throw new Error(message)
  }
  return response.json()
}

export function getAgentStatus() {
  return request('/status')
}

export function sendAgentMessages(messages) {
  return request('/chat', { method: 'POST', body: JSON.stringify({ messages }) })
}