// ---------------------------------------------------------------------------
// Excel workbook adapter.
//
// Reads the three clean tabs of "Community Sheet.xlsx" into the app's
// normalized model (optys / resources / allocations), and writes edits back
// into those tabs while preserving every other sheet in the file.
//
//   Resources    <- "UKI Employee List with Project"
//   Opportunities<- "Opportunity name" (sales pipeline)  +  delivery projects
//                    derived from allocations
//   Allocations  <- "Employee Allocation" (rich assignment table)
//
// xlsx@0.18 is CommonJS, so it is loaded via createRequire under ESM.
// ---------------------------------------------------------------------------

import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

export const SHEETS = {
  resources: 'UKI Employee List with Project',
  pipeline: 'Opportunity name',
  soList: 'SO_List',
  allocations: 'Employee Allocation',
  cwrList: 'CWR_List',
}

export const STATUSES = ['Pipeline', 'Active', 'Completed', 'On Hold']

export const BAND_LABELS = {
  A: 'Associate',
  PA: 'Programmer Analyst',
  PAT: 'Programmer Analyst Trainee',
  M: 'Manager',
  SM: 'Senior Manager',
  SA: 'Senior Associate',
  AD: 'Associate Director',
  D: 'Director',
  CWR: 'Contractor',
  Cont: 'Contractor',
  '#N/A': 'Unknown',
  '': 'Unknown',
}

// --- low-level helpers -----------------------------------------------------

export function readWorkbook(file) {
  // Read via an explicit buffer (fs.readFileSync) rather than handing the
  // path straight to XLSX.readFile: this guarantees the OS file handle is
  // opened, read, and closed synchronously in one step, with no possibility
  // of SheetJS keeping it open — so the workbook is never locked, even for
  // read-only access, and another process (Excel, this same server writing
  // a moment later, etc.) can always open it concurrently.
  const buf = fs.readFileSync(file)
  return XLSX.read(buf, { type: 'buffer', cellDates: false })
}

// Parse a workbook straight from an in-memory buffer (e.g. a blob downloaded
// from Azure Storage), same options as readWorkbook.
export function readWorkbookBuffer(buf) {
  return XLSX.read(buf, { type: 'buffer', cellDates: false })
}

// Serialize a workbook to a Buffer (for uploading back to blob storage).
export function workbookToBuffer(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// Validate that an (uploaded) workbook is actually our Community Sheet before
// we let it replace the live data. Parsing alone never throws on a wrong file
// (missing sheets just yield empty arrays — see rowsOf / the per-parser early
// returns), so we assert the expected tabs exist AND that parsing produces a
// non-trivial model. Returns { ok, errors[] }.
export function validateWorkbook(wb) {
  const errors = []
  if (!wb || !Array.isArray(wb.SheetNames)) {
    return { ok: false, errors: ['Not a readable .xlsx workbook'] }
  }
  const required = [SHEETS.resources, SHEETS.soList, SHEETS.allocations]
  for (const name of required) {
    if (!wb.SheetNames.includes(name)) errors.push(`Missing required sheet: "${name}"`)
  }
  if (errors.length === 0) {
    let parsed
    try {
      parsed = parseWorkbook(wb)
    } catch (err) {
      errors.push(`Workbook could not be parsed: ${err.message}`)
    }
    if (parsed) {
      if (!parsed.resources?.length) errors.push('No resources found (is "UKI Employee List with Project" populated?)')
      if (!parsed.optys?.length) errors.push('No opportunities found (is "SO_List" populated?)')
    }
  }
  return { ok: errors.length === 0, errors }
}

function rowsOf(wb, sheetName) {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim())

function num(v) {
  const n = Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// Excel serial date or m/d/yyyy string -> "YYYY-MM-DD" (or '' if unparseable).
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return ''
  // Excel serial (dates in this workbook land roughly 45000-47000)
  if (typeof v === 'number' || /^\d{4,6}$/.test(String(v).trim())) {
    const serial = Number(v)
    if (serial > 20000 && serial < 90000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000)
      const d = new Date(ms)
      return d.toISOString().slice(0, 10)
    }
  }
  const s = String(v).trim()
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
  if (m) {
    let [, mm, dd, yy] = m
    if (yy.length === 2) yy = '20' + yy
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

function cleanName(s) {
  return str(s).replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim()
}

function emailFromName(name) {
  const parts = cleanName(name)
    .replace(/,/g, ' ')
    .split(' ')
    .map((p) => p.replace(/[^a-zA-Z]/g, ''))
    .filter(Boolean)
  if (parts.length === 0) return 'unknown@cognizant.com'
  const first = parts[0].toLowerCase()
  const last = parts[parts.length - 1].toLowerCase()
  return parts.length === 1 ? `${first}@cognizant.com` : `${first}.${last}@cognizant.com`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// --- parsing ---------------------------------------------------------------

function parseResources(wb) {
  const rows = rowsOf(wb, SHEETS.resources)
  if (rows.length === 0) return []
  const header = rows[0] || []

  // Name-driven column resolution: some workbook revisions drop the
  // free-text "Current Project" column entirely, shifting everything after
  // "Band" — resolving by header name keeps this robust either way.
  const cLegalEntity = colIndex(header, ['Legal Entity'], -1) // may not exist
  const cId = colIndex(header, ['Associate ID'], 0)
  const cName = colIndex(header, ['Associate Name'], 1)
  const cSupervisorId = colIndex(header, ['New HCM Supervisor ID'], 2)
  const cSupervisor = colIndex(header, ['New HCM Supervisor Name'], 3)
  const cBand = colIndex(header, ['Band'], 4)
  const cCurrentProject = colIndex(header, ['Current Project'], -1) // may not exist
  const cProjectId = colIndex(header, ['Project ID'], 6)
  const cProjectName = colIndex(header, ['Project Name'], 7)
  const cAccountId = colIndex(header, ['Account ID'], 8)
  const cAccountName = colIndex(header, ['Account Name'], 9)
  const cParentCustomer = colIndex(header, ['Parent Customer'], 10)
  const cStatus = colIndex(header, ['Status'], -1) // may not exist
  const cPctAllocated = colIndex(header, ['%Allocated', '% Allocated', 'Percent Allocated'], -1)
  const cComments = colIndex(header, ['Comments'], 11)

  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    let id = str(r[cId])
    const name = str(r[cName])
    // Recruiting candidates (new hires not yet onboarded) often have no
    // Associate ID assigned yet — skip only truly blank rows (no id AND no
    // name), and synthesize a stable id from the row position so these
    // candidates still surface as resources instead of being silently
    // dropped.
    if (!id && !name) continue
    if (!id) id = `new-${i}`
    const parentCustomer = str(r[cParentCustomer])
    // Bench rule: no parent customer, or parked on the internal "CTS" pool,
    // means the person isn't billing to a real account right now.
    const onBench = !parentCustomer || parentCustomer.trim().toUpperCase() === 'CTS'
    out.push({
      id,
      name: cleanName(r[cName]),
      email: emailFromName(r[cName]),
      band: str(r[cBand]) || '#N/A',
      role: str(r[cBand]) || '#N/A',
      max_hours: 40,
      supervisorId: str(r[cSupervisorId]),
      supervisor: cleanName(r[cSupervisor]),
      currentProject: cCurrentProject >= 0 ? str(r[cCurrentProject]) : '',
      projectId: str(r[cProjectId]),
      projectName: str(r[cProjectName]),
      accountId: str(r[cAccountId]),
      accountName: str(r[cAccountName]),
      parentCustomer,
      legalEntity: cLegalEntity >= 0 ? str(r[cLegalEntity]) : '',
      status: cStatus >= 0 ? str(r[cStatus]) : '',
      pctAllocated: cPctAllocated >= 0 ? num(r[cPctAllocated]) : null,
      allocationStatus: onBench ? 'Bench' : 'Allocated',
      comments: str(r[cComments]),
      source: 'uki',
    })
  }
  return out
}

// Resolve a column index by trying header names in order (case-insensitive,
// whitespace-trimmed). Falls back to `fallbackIdx` if none of the names are
// found in the header row — keeps this resilient if someone inserts/renames
// columns in the sheet (e.g. adding "Account_Id"/"Project_Id").
function colIndex(header, names, fallbackIdx) {
  const norm = (s) => str(s).toLowerCase().replace(/\s+/g, ' ').trim()
  const wanted = names.map(norm)
  for (let c = 0; c < header.length; c++) {
    if (wanted.includes(norm(header[c]))) return c
  }
  return fallbackIdx
}

function parsePipeline(wb) {
  const rows = rowsOf(wb, SHEETS.pipeline)
  if (rows.length === 0) return []
  const header = rows[0] || []

  // Column resolution is name-driven so the sheet can gain/lose/reorder
  // columns (e.g. inserted "Account_Id"/"Project_Id") without breaking parsing.
  const cSoStatus = colIndex(header, ['SO Line Status', 'Opty_ID', 'Opty ID'], 0)
  const cVertical = colIndex(header, ['Vertical'], 3)
  const cPractice = colIndex(header, ['Practice'], 4)
  const cSubVertical = colIndex(header, ['SubVertical'], 5)
  const cSubPractice = colIndex(header, ['SubPractice'], 6)
  const cAccountName = colIndex(header, ['Account Name'], 9)
  const cProjectName = colIndex(header, ['Opportunity_Name', 'Opportunity Name', 'Project Name'], 10)
  const cCountry = colIndex(header, ['Country'], 11)
  const cCity = colIndex(header, ['City'], 12)
  const cRateCard = colIndex(header, ['T&MRateCard', 'T&M Rate Card'], 13)
  const cQuantity = colIndex(header, ['Quantity'], 14)
  const cWinzone = colIndex(header, ['Winzone'], 15)
  const cRevenue = colIndex(header, ['Revenue'], 16)
  const cSalesStage = colIndex(header, ['Sales_stage', 'Sales Stage'], 17)

  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const project = str(r[cProjectName])
    if (!project) continue
    const soStatus = str(r[cSoStatus])
    // A real SO number means the sale is in flight; otherwise it's pipeline.
    const status = /^\d{5,}$/.test(soStatus) ? 'Active' : 'Pipeline'
    out.push({
      id: `opp-${i}`,
      name: project,
      client: str(r[cAccountName]),
      budget: num(r[cRevenue]),
      status,
      start_date: '',
      end_date: '',
      kind: 'Pipeline',
      soStatus,
      vertical: str(r[cVertical]),
      practice: str(r[cPractice]),
      subVertical: str(r[cSubVertical]),
      subPractice: str(r[cSubPractice]),
      country: str(r[cCountry]),
      city: str(r[cCity]),
      rateCard: str(r[cRateCard]),
      quantity: str(r[cQuantity]),
      winzone: str(r[cWinzone]),
      sales_stage: str(r[cSalesStage]),
      projectId: '',
      customerId: '',
      editable: true,
    })
  }
  return out
}

// Parse the "SO_List" sheet: one row per staffing/SO line requested against
// a project. Multiple rows commonly share the same Project/Account (one row
// per headcount requested), so this is intentionally kept flat — grouping
// into opportunities happens in buildSOOpportunities().
//
// Current sheet columns (as of the Sep 2026 refresh): SO_Number, Vertical,
// Parent Customer, Project ID, Project Name, Hiring Manager, SO GRADE,
// Demand Role Description, Requirement Month, Requirement Month-Week,
// Location (column 11 — its header cell is literally "London" in the source
// file today rather than "Location", since every existing row happens to be
// London; matched positionally as a fallback so it still works once the
// header is corrected), Winzone, Status.
// "Description"/"Staff Assigned" are app-managed columns appended by
// applyToWorkbook() the first time a row is edited on the Opportunities
// page; they won't exist on a freshly-imported sheet, hence the fallback
// index of -1 (colIndex returns -1 -> treated as "column absent").
function parseSOList(wb) {
  const rows = rowsOf(wb, SHEETS.soList)
  if (rows.length === 0) return []
  const header = rows[0] || []

  const cSoId = colIndex(header, ['SO_Number', 'SO ID', 'SO_ID'], 0)
  const cVertical = colIndex(header, ['Vertical'], 1)
  const cAccountName = colIndex(header, ['Parent Customer', 'AccountName', 'Account Name'], 2)
  const cProjectId = colIndex(header, ['Project ID', 'Project_ID'], 3)
  const cProjectName = colIndex(header, ['Project Name', 'Project_name'], 4)
  const cHiringManagerId = colIndex(header, ['Hiring Manager', 'Hiring_ManagerID'], 5)
  const cGrade = colIndex(header, ['SO GRADE', 'Grade'], 6)
  const cRoleDescription = colIndex(header, ['Demand Role Description'], 7)
  const cRequirementMonth = colIndex(header, ['Requirement Month'], 8)
  const cRequirementMonthWeek = colIndex(header, ['Requirement Month-Week'], 9)
  const cLocation = colIndex(header, ['Location'], 10)
  const cWinzone = colIndex(header, ['Winzone'], 11)
  const cStatus = colIndex(header, ['Status'], 12)
  const cDescription = colIndex(header, ['Description'], -1)
  const cStaffAssigned = colIndex(header, ['Staff Assigned', 'Staff_Assigned'], -1)

  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const projectName = str(r[cProjectName])
    const accountName = str(r[cAccountName])
    if (!projectName && !accountName) continue
    out.push({
      soId: str(r[cSoId]),
      vertical: str(r[cVertical]),
      accountName,
      projectId: str(r[cProjectId]),
      projectName,
      hiringManagerId: str(r[cHiringManagerId]),
      grade: str(r[cGrade]),
      roleDescription: str(r[cRoleDescription]),
      requirementMonth: str(r[cRequirementMonth]),
      requirementMonthWeek: str(r[cRequirementMonthWeek]),
      description: cDescription >= 0 ? str(r[cDescription]) : '',
      staffAssigned: cStaffAssigned >= 0 ? Number(r[cStaffAssigned]) || 0 : 0,
      location: str(r[cLocation]),
      winzone: str(r[cWinzone]),
      status: str(r[cStatus]),
    })
  }
  return out
}

// Turn each flat SO_List row into an opportunity-shaped record for the
// Opportunities page (one row per SO line, not grouped): Opportunity Name <-
// Project Name, Account <- Parent Customer, SO Number <- SO_Number, Grade <-
// SO GRADE, Location <- the sheet's Location column (see parseSOList).
// `soDriven` is true when Project ID is present (i.e. the ask is tied to a
// real delivery project) and drives the top-level "SO Available" / "SO Not
// Available" hierarchy on the Opportunities page. The sheet currently has no
// Revenue column, so budget defaults to 0. `description`/`soNumber`/
// `location`/`staffAssigned` are user-editable via the Opportunities page
// (PUT /api/optys/:id) and are persisted back into SO_List by
// applyToWorkbook().
function buildSOOpportunities(soRows) {
  let n = 0
  const out = []
  for (const s of soRows) {
    n += 1
    out.push({
      id: `so-${n}`,
      name: s.projectName || 'Unspecified',
      client: s.accountName || 'Unspecified',
      budget: 0,
      status: 'Active',
      start_date: '',
      end_date: '',
      kind: 'SO',
      soStatus: s.status || '',
      soNumber: s.soId,
      grade: s.grade,
      location: s.location || '',
      soDriven: !!s.projectId,
      vertical: s.vertical,
      practice: '',
      subVertical: '',
      subPractice: '',
      country: '',
      city: '',
      rateCard: '',
      quantity: 1,
      winzone: s.winzone || '',
      sales_stage: s.requirementMonth || '',
      projectId: s.projectId,
      customerId: '',
      description: s.description || s.roleDescription || '',
      staffAssigned: s.staffAssigned || 0,
      roleDescription: s.roleDescription,
      requirementMonthWeek: s.requirementMonthWeek,
      hiringManagerId: s.hiringManagerId,
      editable: true,
    })
  }
  return out
}

// Read the CWR_List sheet (contractor/agency candidate pipeline) as a flat,
// read-only list. Header row: Agency, Agency SPOC, Candidate Name,
// Project Name, Key Skills, Status, Reason. This is intentionally never
// cached beyond the single request — parseWorkbook() is called fresh on
// every /api request (see server/index.js), so this always reflects
// whatever is currently on disk.
export function parseCwrList(wb) {
  const rows = rowsOf(wb, SHEETS.cwrList)
  if (rows.length === 0) return []
  const header = (rows[0] || []).map((c) => str(c))
  const idx = (label) => header.indexOf(label)
  const cAgency = idx('Agency')
  const cSpoc = idx('Agency SPOC')
  const cCandidate = idx('Candidate Name')
  const cProject = idx('Project Name')
  const cSkills = idx('Key Skills')
  const cStatus = idx('Status')
  const cReason = idx('Reason')

  const out = []
  let n = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || []
    const candidateName = str(r[cCandidate])
    const agency = str(r[cAgency])
    // Skip fully blank rows.
    if (!candidateName && !agency) continue
    n += 1
    out.push({
      id: `cwr-${n}`,
      agencyName: agency,
      agencySpoc: str(r[cSpoc]),
      candidateName,
      projectName: str(r[cProject]),
      keySkill: str(r[cSkills]),
      status: str(r[cStatus]),
      reason: str(r[cReason]),
    })
  }
  return out
}

// Locate the rich assignment table inside the (messy) Employee Allocation
// sheet by finding the header cell "Employee ID". Works for both the original
// layout and the clean layout this module writes back.
function parseAllocations(wb, resourcesById) {
  const rows = rowsOf(wb, SHEETS.allocations)
  let hr = -1
  let hc = -1
  let hoursCol = null
  let roleCol = null
  // The sheet contains two tables; target the rich one whose header row has
  // both "Employee ID" and "Assignment Start Date" (positional layout:
  // EmpID, Name, ProjectID, ProjectName, CustomerID, CustomerName, Start, End).
  for (let i = 0; i < rows.length && hr < 0; i++) {
    const row = (rows[i] || []).map((c) => str(c))
    if (!row.includes('Assignment Start Date')) continue
    const ci = row.indexOf('Employee ID')
    if (ci >= 0) {
      hr = i
      hc = ci
    }
  }
  if (hr < 0) return []
  const header = rows[hr] || []
  for (let c = 0; c < header.length; c++) {
    const label = str(header[c])
    if (label === 'Hours/Week') hoursCol = c
    if (label === 'Role on Project') roleCol = c
  }

  const out = []
  let n = 0
  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const empId = str(r[hc])
    if (!empId) continue
    // Positional read relative to the "Employee ID" header cell.
    const projectId = str(r[hc + 2])
    const projectName = str(r[hc + 3])
    const customerId = str(r[hc + 4])
    const customerName = str(r[hc + 5])
    const startDate = toISODate(r[hc + 6])
    const endDate = toISODate(r[hc + 7])
    const hours = hoursCol != null ? num(r[hoursCol]) : 40
    const role = roleCol != null ? str(r[roleCol]) : ''
    n += 1
    out.push({
      id: `alloc-${n}`,
      resource_id: empId,
      empName: cleanName(r[hc + 1]),
      projectId,
      projectName,
      customerId,
      customerName,
      hours_allocated: hours || 40,
      role_on_project: role || (resourcesById[empId] ? BAND_LABELS[resourcesById[empId].band] || resourcesById[empId].band : 'Team Member'),
      start_date: startDate,
      end_date: endDate,
      // opty_id resolved after delivery projects are built
      opty_id: projectId ? `proj-${projectId}` : '',
    })
  }
  return out
}

// Build the full normalized dataset from the workbook.
export function parseWorkbook(wb) {
  const resources = parseResources(wb)
  const resourcesById = Object.fromEntries(resources.map((r) => [r.id, r]))

  const pipeline = parsePipeline(wb)
  // The Opportunities page is built entirely from SO_List (one row per
  // requested headcount); the sales-pipeline sheet above is a separate,
  // independently editable source (manually-added Pipeline opportunities).
  const soRows = parseSOList(wb)
  const soOptys = buildSOOpportunities(soRows)
  const allocations = parseAllocations(wb, resourcesById)

  // Ensure every allocated employee exists as a resource (some assignment
  // rows reference people not in the UKI list).
  for (const a of allocations) {
    if (!resourcesById[a.resource_id]) {
      const parentCustomer = a.customerName || ''
      const onBench = !parentCustomer || parentCustomer.trim().toUpperCase() === 'CTS'
      const r = {
        id: a.resource_id,
        name: a.empName || `Associate ${a.resource_id}`,
        email: emailFromName(a.empName || a.resource_id),
        band: '#N/A',
        role: '#N/A',
        max_hours: 40,
        supervisorId: '',
        supervisor: '',
        currentProject: a.projectName,
        projectId: a.projectId,
        projectName: a.projectName,
        accountId: a.customerId,
        accountName: a.customerName,
        parentCustomer,
        status: 'Active',
        pctAllocated: null,
        allocationStatus: onBench ? 'Bench' : 'Allocated',
        comments: '',
        source: 'alloc',
      }
      resources.push(r)
      resourcesById[r.id] = r
    }
  }

  // Derive delivery-project opportunities from allocations.
  const today = todayISO()
  const deliveryById = {}
  for (const a of allocations) {
    if (!a.projectId) continue
    const id = `proj-${a.projectId}`
    if (deliveryById[id]) {
      // widen the project window if a later assignment extends it
      if (a.end_date && a.end_date > (deliveryById[id].end_date || '')) deliveryById[id].end_date = a.end_date
      if (a.start_date && (!deliveryById[id].start_date || a.start_date < deliveryById[id].start_date))
        deliveryById[id].start_date = a.start_date
      continue
    }
    const bench = /PDP|CDB-AIA|AIM Internal|LEAVE|Bench/i.test(`${a.projectName} ${a.customerName}`)
    let status = 'Active'
    if (bench) status = 'On Hold'
    else if (a.end_date && a.end_date < today) status = 'Completed'
    deliveryById[id] = {
      id,
      name: a.projectName || `Project ${a.projectId}`,
      client: a.customerName,
      budget: 0,
      status,
      start_date: a.start_date || '',
      end_date: a.end_date || '',
      kind: 'Delivery',
      soStatus: '',
      vertical: '',
      practice: '',
      subVertical: '',
      subPractice: '',
      country: '',
      city: '',
      rateCard: '',
      quantity: '',
      winzone: '',
      projectId: a.projectId,
      customerId: a.customerId,
      editable: false,
    }
  }

  const optys = [...pipeline, ...soOptys, ...Object.values(deliveryById)]

  // Any allocation whose opty_id doesn't resolve falls back to a delivery opty
  // (or is dropped if it truly has no project).
  const optyIds = new Set(optys.map((o) => o.id))
  const cleanAllocations = allocations.filter((a) => a.opty_id && optyIds.has(a.opty_id))

  const roles = [...new Set(resources.map((r) => r.band))].sort()

  return {
    optys,
    resources,
    allocations: cleanAllocations,
    meta: { roles, statuses: STATUSES, bandLabels: BAND_LABELS },
  }
}

// --- writing back ----------------------------------------------------------

// SheetJS iterates the full !ref range on write, so collapse each sheet's
// declared range to the cells that actually exist (the "Demands" tab claims
// ~1M rows). Without this, writeFile hangs.
function tightenRef(ws) {
  let maxR = -1
  let maxC = -1
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue
    const m = /^([A-Z]+)(\d+)$/.exec(key)
    if (!m) continue
    const c = XLSX.utils.decode_col(m[1])
    const r = parseInt(m[2], 10) - 1
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  ws['!ref'] = maxR < 0 ? 'A1' : XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
}

function replaceSheet(wb, name, aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  wb.Sheets[name] = ws
  if (!wb.SheetNames.includes(name)) wb.SheetNames.push(name)
}

// Rewrite the three clean tabs from the normalized state; leave others intact.
export function applyToWorkbook(wb, state) {
  const { optys, resources, allocations } = state

  // Resources -> UKI Employee List with Project
  const resHeader = [
    'Associate ID',
    'Associate Name',
    'New HCM Supervisor ID',
    'New HCM Supervisor Name',
    'Band',
    'Current Project',
    'Project ID',
    'Project Name',
    'Account ID',
    'Account Name',
    'Parent Customer',
    'Status',
    '%Allocated',
    'Comments',
  ]
  const resRows = resources.map((r) => [
    r.id,
    r.name,
    r.supervisorId || '',
    r.supervisor || '',
    r.band || '',
    r.currentProject || '',
    r.projectId || '',
    r.projectName || '',
    r.accountId || '',
    r.accountName || '',
    r.parentCustomer || '',
    r.status || '',
    r.pctAllocated ?? '',
    r.comments || '',
  ])
  replaceSheet(wb, SHEETS.resources, [resHeader, ...resRows])

  // Pipeline opportunities -> Opportunity name
  const pipeHeader = [
    'SO Line Status',
    'Pool Name',
    'Department',
    'Vertical',
    'Practice',
    'SubVertical',
    'SubPractice',
    'BU',
    'BU_New',
    'Account Name',
    'Opportunity_Name',
    'Country',
    'City',
    'T&MRateCard',
    'Quantity',
    'Winzone',
    'Revenue',
    'Sales_stage',
  ]
  const pipeRows = optys
    .filter((o) => o.kind === 'Pipeline')
    .map((o) => [
      o.soStatus || '',
      'NA',
      'AIA',
      o.vertical || '',
      o.practice || '',
      o.subVertical || '',
      o.subPractice || '',
      'AIA',
      'AIA',
      o.client || '',
      o.name || '',
      o.country || '',
      o.city || '',
      o.rateCard || '',
      o.quantity || '',
      o.winzone || '',
      o.budget || 0,
      o.sales_stage || '',
    ])
  replaceSheet(wb, SHEETS.pipeline, [pipeHeader, ...pipeRows])

  // Allocations -> Employee Allocation (clean, positional to match parser)
  const optyById = Object.fromEntries(optys.map((o) => [o.id, o]))
  const allocHeader = [
    'Employee ID',
    'Employee Name',
    'Project ID',
    'Project Name',
    'Customer ID',
    'Customer Name',
    'Assignment Start Date',
    'Assignment End Date',
    'Hours/Week',
    'Role on Project',
  ]
  const resById = Object.fromEntries(resources.map((r) => [r.id, r]))
  const allocRows = allocations.map((a) => {
    const o = optyById[a.opty_id] || {}
    const res = resById[a.resource_id] || {}
    return [
      a.resource_id,
      res.name || a.empName || '',
      a.projectId || o.projectId || '',
      a.projectName || o.name || '',
      a.customerId || o.customerId || '',
      a.customerName || o.client || '',
      a.start_date || '',
      a.end_date || '',
      a.hours_allocated || 0,
      a.role_on_project || '',
    ]
  })
  replaceSheet(wb, SHEETS.allocations, [allocHeader, ...allocRows])

  // SO opportunities -> SO_List (matches the current sheet's real columns —
  // Location/Winzone/Status are genuine sheet columns, cleaned up here to use
  // proper header names instead of the source file's literal "London"
  // header; Description/Staff Assigned are app-managed columns appended so
  // user edits from the Opportunities page round-trip on reload).
  const soHeader = [
    'SO_Number',
    'Vertical',
    'Parent Customer',
    'Project ID',
    'Project Name',
    'Hiring Manager',
    'SO GRADE',
    'Demand Role Description',
    'Requirement Month',
    'Requirement Month-Week',
    'Location',
    'Winzone',
    'Status',
    'Description',
    'Staff Assigned',
  ]
  const soRows = optys
    .filter((o) => o.kind === 'SO')
    .map((o) => [
      o.soNumber || '',
      o.vertical || '',
      o.client || '',
      o.projectId || '',
      o.name || '',
      o.hiringManagerId || '',
      o.grade || '',
      o.roleDescription || '',
      o.sales_stage || '',
      o.requirementMonthWeek || '',
      o.location || '',
      o.winzone || '',
      o.soStatus || '',
      o.description || '',
      o.staffAssigned || 0,
    ])
  if (soRows.length) replaceSheet(wb, SHEETS.soList, [soHeader, ...soRows])

  for (const name of wb.SheetNames) tightenRef(wb.Sheets[name])
  return wb
}

export function writeWorkbook(wb, file) {
  XLSX.writeFile(wb, file)
}

export function backupOnce(file) {
  const bak = file.replace(/\.xlsx$/i, '.backup.xlsx')
  if (!fs.existsSync(bak) && fs.existsSync(file)) {
    fs.copyFileSync(file, bak)
    return bak
  }
  return null
}
