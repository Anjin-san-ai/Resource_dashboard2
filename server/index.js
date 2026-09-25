// ---------------------------------------------------------------------------
// Data API for the Allocate dashboard.
//
// Every /api request re-reads "Community Sheet.xlsx" fresh from disk (see the
// middleware below) — there is no in-memory cache serving stale data across
// requests, so edits made directly in Excel are reflected on the very next
// request with no polling/watching needed. Mutations write straight back
// into the workbook (preserving every other sheet). A one-time .backup.xlsx
// is taken before the first write.
// ---------------------------------------------------------------------------

import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  readWorkbook,
  parseWorkbook,
  parseCwrList,
  applyToWorkbook,
  writeWorkbook,
  backupOnce,
} from './workbook.js'
import { initStorage, workingFilePath, storageMode, syncUp, syncDownIfChanged } from './storage.js'
import {
  ensureSeedAdmin,
  createAccessRequest,
  adminCreateUser,
  approveUser,
  rejectUser,
  deleteUser,
  adminSetPassword,
  changeOwnPassword,
  verifyLogin,
  createSession,
  sessionUser,
  destroySession,
  loadUsers,
  sanitize,
} from './users.js'
import { createDashboardAgent } from './agent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Azure App Service injects PORT; keep API_PORT for existing local scripts.
const PORT = process.env.PORT || process.env.API_PORT || 3001

// Choose workbook storage: local file (default) or Azure Blob when configured.
// Top-level await is valid here — this is an ESM module ("type":"module").
const storageInfo = await initStorage()
const FILE = workingFilePath()

let wb = null
let state = { optys: [], resources: [], allocations: [], meta: {} }
// mtime of the working file that the current in-memory parse reflects; lets
// load() skip re-parsing the (large) workbook when nothing changed.
let loadedVersion = null

// Connected Server-Sent-Events clients + a broadcast helper. Used to push a
// lightweight "data-changed" ping so browsers refetch immediately instead of
// waiting for a poll.
const sseClients = new Set()
function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try {
      res.write(payload)
    } catch {
      /* client went away; the close handler will remove it */
    }
  }
}

function load({ force = false } = {}) {
  let version = 'missing'
  try {
    version = String(fs.statSync(FILE).mtimeMs)
  } catch {
    /* file not present yet */
  }
  // Skip re-reading/parsing when the working file is unchanged since last load
  // — the working file only changes on a local edit, an app mutation, or a
  // blob sync-down, so this stays correct while avoiding a full parse per GET.
  if (!force && wb && version === loadedVersion) return
  wb = readWorkbook(FILE)
  state = parseWorkbook(wb)
  loadedVersion = version
}

// Persist current state back into the workbook file (and up to blob storage).
function save() {
  backupOnce(FILE)
  applyToWorkbook(wb, state)
  writeWorkbook(wb, FILE)
  loadedVersion = null // working file just changed; re-read on next load
  // Push the change up to blob storage (no-op in local mode). Fire-and-forget
  // so a slow upload never blocks the mutation response; errors are logged.
  syncUp().catch((e) => console.error('[storage] syncUp failed:', e.message))
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

// Rebuild derived data (delivery optys, orphan cleanup) after a mutation, then
// save. We re-derive by writing to the workbook and re-parsing so the in-memory
// model always matches what a fresh load would produce.
function persistAndReload() {
  save()
  state = parseWorkbook(wb)
  // Tell every connected browser to refetch now (near-instant refresh).
  broadcast('data-changed', { source: 'app' })
}

const app = express()
app.use(express.json())
const dashboardAgent = createDashboardAgent(() => state)
const agentCallsByUser = new Map()

// --- Auth (login-based access) ---------------------------------------------
// Registered before the workbook-load middleware below so login/access-
// request calls don't trigger a needless xlsx read on every keystroke of
// "wrong password" retries — these routes never touch the workbook.
ensureSeedAdmin()

function getToken(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

// Attaches req.user (or null) from the bearer token; never blocks by itself.
function withUser(req, res, next) {
  req.user = sessionUser(getToken(req))
  next()
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' })
  }
  next()
}

app.post('/api/auth/request-access', (req, res) => {
  try {
    const row = createAccessRequest(req.body || {})
    res.json({ ok: true, request: row })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  try {
    const user = verifyLogin(username, password)
    const token = createSession(user.username)
    res.json({ token, user })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

app.post('/api/auth/logout', withUser, (req, res) => {
  destroySession(getToken(req))
  res.json({ ok: true })
})

app.get('/api/auth/me', withUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  res.json({ user: req.user })
})

// Administrator-only: list pending access requests + full user directory.
app.get('/api/auth/pending', withUser, requireAdmin, (req, res) => {
  const pending = loadUsers().filter((u) => u.status === 'pending').map(sanitize)
  res.json({ pending })
})

app.get('/api/auth/users', withUser, requireAdmin, (req, res) => {
  res.json({ users: loadUsers().map(sanitize) })
})

// Administrator-only: create a ready-to-use login directly (no self-service
// request needed). Used by the "Create login" form on Access Requests.
app.post('/api/auth/admin/create-user', withUser, requireAdmin, (req, res) => {
  try {
    const user = adminCreateUser(req.body || {})
    res.json({ ok: true, user })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/auth/approve/:id', withUser, requireAdmin, (req, res) => {
  try {
    const user = approveUser(req.params.id)
    res.json({ ok: true, user })
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
})

app.post('/api/auth/reject/:id', withUser, requireAdmin, (req, res) => {
  try {
    res.json(rejectUser(req.params.id))
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
})

// Revoke access for an already-approved (or previously rejected) user.
// Distinct from /reject/:id (which is for pending requests) purely for
// clarity in the client, but both ultimately remove the user record.
app.delete('/api/auth/users/:id', withUser, requireAdmin, (req, res) => {
  try {
    res.json(deleteUser(req.params.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Administrator-only: force-set a user's password. The user is flagged
// mustChangePassword so they're required to pick their own password on next
// login (enforced client-side via a blocking screen — see App.jsx).
app.post('/api/auth/admin/set-password/:id', withUser, requireAdmin, (req, res) => {
  try {
    const { password } = req.body || {}
    const user = adminSetPassword(req.params.id, password)
    res.json({ ok: true, user })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Self-service password change, also used for the forced first-change flow
// after an admin resets a password. `currentPassword` is required unless the
// account is currently flagged mustChangePassword.
app.post('/api/auth/change-password', withUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  try {
    const { currentPassword, newPassword } = req.body || {}
    const user = changeOwnPassword(req.user.username, currentPassword, newPassword)
    res.json({ ok: true, user })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// --- Live refresh (SSE) ----------------------------------------------------
// Browsers open EventSource('/api/events') and get a "data-changed" ping
// whenever the workbook changes (an app edit, or an external upload picked up
// via the Event Grid webhook / safety poll). No auth: the stream carries no
// data, only a signal to refetch the (auth-protected) /api/data. Registered
// before the workbook-load + auth middleware so it never triggers a parse and
// never requires a token.
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()
  res.write(`event: hello\ndata: ${JSON.stringify({ mode: storageMode() })}\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// --- Ingestion webhook (Azure Event Grid) ----------------------------------
// Blob Storage → Event Grid → here, when a new "Community Sheet.xlsx" lands
// (uploaded directly, or copied in by a Power Automate flow watching a
// SharePoint/OneDrive library). Handles the one-time subscription-validation
// handshake, then on BlobCreated pulls the new workbook down (validated in
// storage.syncDownIfChanged) and broadcasts a refresh. Guarded by a shared
// secret in the query string (EVENTGRID_SECRET).
app.post('/api/hooks/blob-changed', async (req, res, next) => {
  try {
    const secret = process.env.EVENTGRID_SECRET
    if (secret && req.query.secret !== secret) {
      return res.status(401).json({ error: 'bad secret' })
    }
    const events = Array.isArray(req.body) ? req.body : [req.body].filter(Boolean)
    for (const ev of events) {
      if (ev?.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent') {
        return res.json({ validationResponse: ev.data?.validationCode })
      }
    }
    const changed = await syncDownIfChanged({ force: true })
    if (changed) {
      load({ force: true })
      broadcast('data-changed', { source: 'ingest' })
    }
    res.json({ ok: true, changed })
  } catch (err) {
    next(err)
  }
})

// Guard: every remaining /api route (the data endpoints) requires a signed-in
// user. Auth routes above and /api/events + the webhook are already handled,
// so they're unaffected. Closes the previous gap where data mutations were
// completely unauthenticated.
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' })
  next()
}
app.use('/api', withUser, requireUser)

// Always read the workbook fresh from disk before handling any /api request
// — the in-memory `wb`/`state` are treated purely as scratch space for the
// duration of a single request, never as a cache serving stale data across
// requests. This guarantees GET /api/data (and every mutation's starting
// point) reflects whatever is currently on disk in "Community Sheet.xlsx",
// including edits made directly in Excel moments ago. XLSX.readFile() only
// opens the file for reading (fs.readFileSync under the hood) and closes the
// handle immediately, so this never locks the file — Excel (or anything
// else) can keep it open at the same time. Only writes (save()) require the
// file to be unlocked, which is unavoidable and now surfaces as the friendly
// "close the file in Excel" error instead of a stack trace.
app.use('/api', (req, res, next) => {
  // Belt-and-braces against any client/proxy/browser caching layer: tell
  // every API response it must never be served from cache, since the whole
  // point of re-reading the workbook per-request is that stale data is
  // never acceptable here.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  try {
    load()
    next()
  } catch (err) {
    next(err)
  }
})

app.get('/api/data', (req, res) => {
  res.json(state)
})

app.get('/api/agent/status', (req, res) => {
  res.json({ configured: dashboardAgent.isConfigured() })
})

app.post('/api/agent/chat', (req, res) => {
  const now = Date.now()
  const recentCalls = (agentCallsByUser.get(req.user.username) || []).filter((time) => now - time < 60_000)
  if (recentCalls.length >= 12) {
    return res.status(429).json({ error: 'Assistant rate limit reached. Try again in a minute.' })
  }
  recentCalls.push(now)
  agentCallsByUser.set(req.user.username, recentCalls)

  const input = req.body?.messages
  if (!Array.isArray(input) || input.length === 0 || input.length > 12) {
    return res.status(400).json({ error: 'Send between 1 and 12 chat messages.' })
  }
  const messages = input.map((message) => ({
    role: message?.role,
    content: typeof message?.content === 'string' ? message.content.trim() : '',
  }))
  if (messages.some((message) => !['user', 'assistant'].includes(message.role) || !message.content || message.content.length > 1500)) {
    return res.status(400).json({ error: 'Each message must be text under 1,500 characters.' })
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > 7000) {
    return res.status(400).json({ error: 'Conversation is too long. Start a new chat.' })
  }
  if (!dashboardAgent.isConfigured()) {
    return res.status(503).json({ error: 'The dashboard assistant is not configured yet.' })
  }

  dashboardAgent.respond(messages)
    .then((result) => res.json(result))
    .catch((error) => {
      const apiKey = process.env.AZURE_OPENAI_API_KEY
      const safeMessage = String(error?.message || 'Unknown assistant error')
        .replaceAll(apiKey || '\u0000', '[redacted]')
        .slice(0, 300)
      const diagnostics = {
        name: error?.name || 'Error',
        code: error?.code || null,
        status: error?.status || null,
        message: safeMessage,
      }
      console.error('[agent] request failed:', JSON.stringify(diagnostics))
      res.status(502).json({
        error: 'The assistant could not complete that request. Please try again.',
        ...(req.user.role === 'admin' ? { diagnostics } : {}),
      })
    })
})

// Contractor (CWR) status — read directly from the CWR_List sheet on every
// request (no caching, no polling). `load()` in the /api middleware above
// already re-reads "Community Sheet.xlsx" from disk for this request, so
// `wb` here always reflects the current file contents.
app.get('/api/cwr', (req, res) => {
  res.json({ cwr: parseCwrList(wb) })
})

// --- Opportunities ---------------------------------------------------------

// "Add Project" on the Opportunities page creates a new row in the SO_List
// tab (not the sales-pipeline sheet) — see workbook.js parseSOList /
// buildSOOpportunities / applyToWorkbook for the SO_List column mapping.
app.post('/api/optys', (req, res) => {
  const b = req.body || {}
  if (b.kind === 'SO') {
    const row = {
      id: makeId('so'),
      name: String(b.name || '').trim(),
      client: String(b.client || '').trim(),
      budget: 0,
      status: 'Active',
      start_date: '',
      end_date: '',
      kind: 'SO',
      soStatus: String(b.status || '').trim(),
      soNumber: String(b.soNumber || '').trim(),
      grade: '',
      location: String(b.location || '').trim(),
      soDriven: !!String(b.projectId || '').trim(),
      vertical: String(b.vertical || '').trim(),
      practice: '',
      subVertical: '',
      subPractice: '',
      country: '',
      city: '',
      rateCard: '',
      quantity: 1,
      winzone: String(b.winzone || '').trim(),
      sales_stage: String(b.requirementMonth || '').trim(),
      projectId: String(b.projectId || '').trim(),
      customerId: '',
      description: String(b.roleDescription || '').trim(),
      staffAssigned: 0,
      roleDescription: String(b.roleDescription || '').trim(),
      requirementMonthWeek: '',
      hiringManagerId: String(b.hiringManagerId || '').trim(),
      editable: true,
    }
    state.optys.push(row)
    persistAndReload()
    return res.json(row)
  }
  const row = {
    id: makeId('opp'),
    name: String(b.name || '').trim(),
    client: String(b.client || '').trim(),
    budget: Number(b.budget) || 0,
    status: b.status || 'Pipeline',
    start_date: b.start_date || '',
    end_date: b.end_date || '',
    kind: 'Pipeline',
    soStatus: b.soStatus || '',
    vertical: b.vertical || '',
    practice: b.practice || '',
    subVertical: '',
    subPractice: '',
    country: b.country || '',
    city: b.city || '',
    rateCard: b.rateCard || '',
    quantity: b.quantity || '',
    winzone: b.winzone || '',
    projectId: '',
    customerId: '',
    editable: true,
  }
  state.optys.push(row)
  persistAndReload()
  res.json(row)
})

app.put('/api/optys/:id', (req, res) => {
  const o = state.optys.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'not found' })
  if (o.kind === 'Delivery') return res.status(400).json({ error: 'Delivery projects are read-only' })
  if (o.kind === 'SO') {
    // SO-driven opportunities are derived from SO_LIST; only these fields
    // round-trip back into the sheet (see applyToWorkbook in workbook.js).
    Object.assign(o, {
      description: req.body.description ?? o.description,
      soNumber: req.body.soNumber ?? o.soNumber,
      location: req.body.location ?? o.location,
      staffAssigned:
        req.body.staffAssigned !== undefined ? Number(req.body.staffAssigned) || 0 : o.staffAssigned,
    })
    persistAndReload()
    return res.json(o)
  }
  Object.assign(o, {
    name: req.body.name ?? o.name,
    client: req.body.client ?? o.client,
    budget: req.body.budget !== undefined ? Number(req.body.budget) || 0 : o.budget,
    status: req.body.status ?? o.status,
    start_date: req.body.start_date ?? o.start_date,
    end_date: req.body.end_date ?? o.end_date,
    vertical: req.body.vertical ?? o.vertical,
    practice: req.body.practice ?? o.practice,
    country: req.body.country ?? o.country,
    city: req.body.city ?? o.city,
  })
  persistAndReload()
  res.json(o)
})

app.delete('/api/optys/:id', (req, res) => {
  const o = state.optys.find((x) => x.id === req.params.id)
  if (o && o.kind !== 'Pipeline') return res.status(400).json({ error: 'Delivery projects are read-only' })
  state.optys = state.optys.filter((x) => x.id !== req.params.id)
  // cascade: drop allocations linked to this opty
  state.allocations = state.allocations.filter((a) => a.opty_id !== req.params.id)
  persistAndReload()
  res.json({ ok: true })
})

// --- Resources -------------------------------------------------------------

app.post('/api/resources', (req, res) => {
  const b = req.body || {}
  const row = {
    id: makeId('res'),
    name: String(b.name || '').trim(),
    email: String(b.email || '').trim(),
    band: b.role || b.band || 'A',
    role: b.role || b.band || 'A',
    max_hours: Number(b.max_hours) || 40,
    supervisorId: '',
    supervisor: b.supervisor || '',
    currentProject: b.currentProject || '',
    projectId: '',
    projectName: b.currentProject || '',
    accountId: '',
    accountName: b.accountName || '',
    parentCustomer: '',
    comments: b.comments || '',
    source: 'app',
  }
  state.resources.push(row)
  persistAndReload()
  res.json(row)
})

app.put('/api/resources/:id', (req, res) => {
  const r = state.resources.find((x) => x.id === req.params.id)
  if (!r) return res.status(404).json({ error: 'not found' })
  const role = req.body.role ?? req.body.band
  Object.assign(r, {
    name: req.body.name ?? r.name,
    email: req.body.email ?? r.email,
    band: role ?? r.band,
    role: role ?? r.role,
    max_hours: req.body.max_hours !== undefined ? Number(req.body.max_hours) || 40 : r.max_hours,
    supervisor: req.body.supervisor ?? r.supervisor,
    currentProject: req.body.currentProject ?? r.currentProject,
    projectName: req.body.projectName ?? r.projectName,
    accountName: req.body.accountName ?? r.accountName,
    parentCustomer: req.body.parentCustomer ?? r.parentCustomer,
    status: req.body.status ?? r.status,
    pctAllocated: req.body.pctAllocated !== undefined ? Number(req.body.pctAllocated) : r.pctAllocated,
    comments: req.body.comments ?? r.comments,
  })
  // Keep the derived Bench/Allocated flag in sync with Parent Customer + Status
  // (mirrors the rule used at load time: CTS + Active => on bench).
  const onBench = (r.parentCustomer || '').trim().toUpperCase() === 'CTS' && r.status === 'Active'
  r.allocationStatus = onBench ? 'Bench' : 'Allocated'
  persistAndReload()
  res.json(r)
})

app.delete('/api/resources/:id', (req, res) => {
  state.resources = state.resources.filter((x) => x.id !== req.params.id)
  // cascade: drop allocations for this resource
  state.allocations = state.allocations.filter((a) => a.resource_id !== req.params.id)
  persistAndReload()
  res.json({ ok: true })
})

// --- Allocations -----------------------------------------------------------

function validateAllocationCapacity(resourceId, hoursAllocated, exceptAllocationId = null) {
  const resource = state.resources.find((row) => row.id === resourceId)
  if (!resource) throw new Error('Resource not found')
  const requestedHours = Number(hoursAllocated)
  if (!Number.isFinite(requestedHours) || requestedHours <= 0) {
    throw new Error('Allocated hours must be greater than zero')
  }
  const allocatedHours = state.allocations
    .filter((row) => row.resource_id === resourceId && row.id !== exceptAllocationId)
    .reduce((total, row) => total + (Number(row.hours_allocated) || 0), 0)
  const remainingHours = (Number(resource.max_hours) || 0) - allocatedHours
  if (requestedHours > remainingHours) {
    throw new Error(`Only ${Math.max(0, remainingHours)} hours remain for ${resource.name}`)
  }
}

app.post('/api/allocations', (req, res) => {
  const b = req.body || {}
  const opty = state.optys.find((o) => o.id === b.opty_id)
  const resource = state.resources.find((r) => r.id === b.resource_id)
  if (!opty) return res.status(400).json({ error: 'Opportunity not found' })
  if (!resource) return res.status(400).json({ error: 'Resource not found' })
  try {
    validateAllocationCapacity(resource.id, b.hours_allocated)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  const row = {
    id: makeId('alloc'),
    opty_id: b.opty_id,
    resource_id: b.resource_id,
    hours_allocated: Number(b.hours_allocated) || 0,
    role_on_project: String(b.role_on_project || '').trim(),
    start_date: b.start_date || '',
    end_date: b.end_date || '',
    projectId: opty?.projectId || '',
    projectName: opty?.name || '',
    customerId: opty?.customerId || '',
    customerName: opty?.client || '',
    empName: resource?.name || '',
  }
  state.allocations.push(row)
  persistAndReload()
  res.json(row)
})

app.put('/api/allocations/:id', (req, res) => {
  const a = state.allocations.find((x) => x.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'not found' })
  const nextOptyId = req.body.opty_id || a.opty_id
  const nextResourceId = req.body.resource_id || a.resource_id
  const nextHours = req.body.hours_allocated !== undefined ? Number(req.body.hours_allocated) : Number(a.hours_allocated)
  if (!state.optys.some((row) => row.id === nextOptyId)) return res.status(400).json({ error: 'Opportunity not found' })
  if (!state.resources.some((row) => row.id === nextResourceId)) return res.status(400).json({ error: 'Resource not found' })
  if (nextResourceId !== a.resource_id || nextHours !== Number(a.hours_allocated)) {
    try {
      validateAllocationCapacity(nextResourceId, nextHours, a.id)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  }
  if (req.body.opty_id && req.body.opty_id !== a.opty_id) {
    const opty = state.optys.find((o) => o.id === req.body.opty_id)
    a.opty_id = req.body.opty_id
    a.projectId = opty?.projectId || ''
    a.projectName = opty?.name || ''
    a.customerId = opty?.customerId || ''
    a.customerName = opty?.client || ''
  }
  if (req.body.resource_id && req.body.resource_id !== a.resource_id) {
    a.resource_id = req.body.resource_id
    a.empName = state.resources.find((r) => r.id === req.body.resource_id)?.name || ''
  }
  a.hours_allocated =
    req.body.hours_allocated !== undefined ? Number(req.body.hours_allocated) || 0 : a.hours_allocated
  a.role_on_project = req.body.role_on_project ?? a.role_on_project
  a.start_date = req.body.start_date ?? a.start_date
  a.end_date = req.body.end_date ?? a.end_date
  persistAndReload()
  res.json(a)
})

app.delete('/api/allocations/:id', (req, res) => {
  state.allocations = state.allocations.filter((x) => x.id !== req.params.id)
  persistAndReload()
  res.json({ ok: true })
})

// Turn a raw save failure into a friendly, user-facing message. The most
// common case by far is Windows locking the workbook file while it's open in
// Excel — fs.writeFileSync then throws EBUSY (or occasionally EPERM). Express
// 4 automatically catches synchronous throws from route handlers (all of our
// mutation routes call persistAndReload() synchronously), so this single
// error-handling middleware covers every route without extra try/catch.
function friendlyMessage(err) {
  if (err?.code === 'EBUSY' || err?.code === 'EPERM') {
    return `Couldn't save — "Community Sheet.xlsx" is open in Excel. Close the file in Excel and try again.`
  }
  return err?.message || 'Something went wrong while saving.'
}

// --- Serve the built SPA (single-origin BFF) -------------------------------
// In production this one Express service serves BOTH the compiled React app
// (dist/) and the /api, so it deploys as a single Azure App Service with no
// separate static host and no CORS. In development Vite serves the SPA on 5173
// and proxies /api here, so this block is harmless (nobody hits :3001 root).
const DIST = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  // SPA history fallback: any non-/api GET returns index.html.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api] request error:', err)
  res.status(500).json({ error: friendlyMessage(err) })
})

load({ force: true })

// Safety net + local live-refresh: periodically detect a changed workbook (a
// local Excel edit, or an external blob upload whose Event Grid ping we might
// have missed) and push a refresh. Cheap in local mode (a stat); less frequent
// in blob mode (a blob HEAD). This replaces the browser's old 5s poll with a
// server-side watcher + SSE push.
const POLL_MS = storageMode() === 'blob' ? 30000 : 4000
setInterval(async () => {
  try {
    if (await syncDownIfChanged()) {
      load({ force: true })
      broadcast('data-changed', { source: 'poll' })
    }
  } catch {
    /* transient; retry next tick */
  }
}, POLL_MS)

// Keepalive so proxies don't drop idle SSE streams.
setInterval(() => broadcast('ping'), 25000)

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`)
  console.log(`[api] storage mode: ${storageMode()} · working file "${path.basename(FILE)}"`)
  if (storageInfo?.error) console.log(`[api] (blob fallback reason: ${storageInfo.error})`)
})

// Last line of defense: never let an unexpected async error (e.g. a
// transient file lock while Excel autosaves) take the whole API process
// down. Log it and keep serving.
process.on('uncaughtException', (err) => {
  console.error('[api] uncaughtException (server kept alive):', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[api] unhandledRejection (server kept alive):', err)
})
