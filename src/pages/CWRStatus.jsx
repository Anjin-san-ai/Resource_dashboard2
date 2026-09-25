import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, UserCog, Building2 } from 'lucide-react'
import { CollapseChevron, ExpandHint } from '../components/ui.jsx'
import { fetchCwrStatus } from '../db/db.js'

function statusTone(status) {
  const s = (status || '').trim().toLowerCase()
  if (s.includes('select') || s.includes('offer') || s.includes('active') || s.includes('onboard'))
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (s.includes('reject') || s.includes('closed') || s.includes('drop') || s.includes('withdraw'))
    return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
  if (s.includes('hold') || s.includes('pending') || s.includes('progress') || s.includes('interview'))
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300'
}

function CwrTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
          <tr>
            <th className="px-5 py-2 font-semibold">Agency SPOC</th>
            <th className="px-5 py-2 font-semibold">Candidate Name</th>
            <th className="px-5 py-2 font-semibold">Project Name</th>
            <th className="px-5 py-2 font-semibold">Key Skill</th>
            <th className="px-5 py-2 font-semibold">Status</th>
            <th className="px-5 py-2 font-semibold">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-night-800">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-night-800/70">
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.agencySpoc || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
              <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                {r.candidateName || <span className="text-slate-300 dark:text-slate-600">—</span>}
              </td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.projectName || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.keySkill || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
              <td className="px-5 py-3">
                <span className={`badge ${statusTone(r.status)}`}>{r.status || 'Unknown'}</span>
              </td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.reason || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Collapsible group: one card per Agency Name, header shows the agency
// name + candidate count and a chevron/toggle button; the table body only
// renders while expanded.
function AgencyGroup({ agencyName, rows, open, onToggle }) {
  return (
    <div className={`card overflow-hidden ${open ? 'ring-1 ring-brand-500/30 dark:ring-accent-500/30' : ''}`}>
      <button
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-left transition-colors hover:bg-slate-100/70 dark:border-night-700 dark:bg-night-800 dark:hover:bg-night-700/70"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <CollapseChevron open={open} size={18} />
          <Building2 size={16} className="text-brand-600 dark:text-accent-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{agencyName || 'Unspecified Agency'}</h3>
          <span className="badge bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300">{rows.length}</span>
        </div>
        <ExpandHint open={open} />
      </button>
      {open && <CwrTable rows={rows} />}
    </div>
  )
}

// Contractor (CWR) Status page. Deliberately bypasses AppContext's cached /
// polled `data` — every load/refresh calls the server directly, and the
// server itself re-reads the CWR_List sheet from disk on every request, so
// this table always reflects the current workbook contents, never a cache.
// Rows are grouped by Agency Name into collapsible sections.
export default function CwrStatus() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openAgencies, setOpenAgencies] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCwrStatus()
      setRows(data)
    } catch (err) {
      setError(err.message || 'Failed to load CWR status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const key = r.agencyName || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const toggleAgency = (name) => {
    setOpenAgencies((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const allOpen = groups.length > 0 && groups.every(([name]) => openAgencies.has(name))
  const expandAll = () => setOpenAgencies(new Set(groups.map(([name]) => name)))
  const collapseAll = () => setOpenAgencies(new Set())

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog size={16} className="text-brand-600 dark:text-accent-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Contractor (CWR) Status</h3>
          <span className="badge bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300">{rows.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-subtle"
            onClick={allOpen ? collapseAll : expandAll}
            disabled={loading || groups.length === 0}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button
            className="btn-subtle flex items-center gap-1.5"
            onClick={load}
            disabled={loading}
            aria-label="Refresh CWR status"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="card p-6">
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
        </div>
      ) : loading ? (
        <div className="card p-6">
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading CWR data…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-6">
          <p className="text-sm text-slate-400 dark:text-slate-500">No CWR records found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([agencyName, agencyRows]) => (
            <AgencyGroup
              key={agencyName || '(unspecified)'}
              agencyName={agencyName}
              rows={agencyRows}
              open={openAgencies.has(agencyName)}
              onToggle={() => toggleAgency(agencyName)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
