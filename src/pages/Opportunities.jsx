import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Briefcase,
  Filter,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  Building2,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { currency, EmptyState, CollapseChevron, ExpandHint } from '../components/ui.jsx'

const BLANK = {
  vertical: '',
  client: '',
  name: '',
  sales_stage: '',
  budget: '',
}

function OptyForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || BLANK)
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Project name is required'
    if (!form.client.trim()) e.client = 'Account name is required'
    if (form.budget !== '' && Number(form.budget) < 0) e.budget = 'Budget cannot be negative'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (ev) => {
    ev.preventDefault()
    if (validate()) onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Vertical</label>
          <input className="input" value={form.vertical} onChange={(e) => set('vertical', e.target.value)} placeholder="e.g. FSI" />
          {errors.vertical && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.vertical}</p>}
        </div>
        <div>
          <label className="label">Account name</label>
          <input className="input" value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="Account / client name" />
          {errors.client && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.client}</p>}
        </div>
      </div>

      <div>
        <label className="label">Project name</label>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Atlas CRM Modernization" />
        {errors.name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Expected Date</label>
          <input
            className="input"
            value={form.sales_stage}
            onChange={(e) => set('sales_stage', e.target.value)}
            placeholder="e.g. Oct 2026"
          />
          {errors.sales_stage && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.sales_stage}</p>}
        </div>
        <div>
          <label className="label">Budget (USD)</label>
          <input
            type="number"
            min="0"
            className="input"
            value={form.budget}
            onChange={(e) => set('budget', e.target.value)}
            placeholder="250000"
          />
          {errors.budget && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.budget}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {initial ? 'Save changes' : 'Create opportunity'}
        </button>
      </div>
    </form>
  )
}

// Edit form for SO_LIST-derived opportunities. Most SO_LIST columns are
// sourced straight from the sheet, but description/SO number/location/staff
// assigned are user-editable and round-trip back into SO_LIST via
// PUT /api/optys/:id (see server/index.js + workbook.js applyToWorkbook).
function SOOptyEditForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    description: initial.description || '',
    soNumber: initial.soNumber || '',
    location: initial.location || '',
    staffAssigned: initial.staffAssigned ?? 0,
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (ev) => {
    ev.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Account name</label>
          <input className="input" value={initial.client} disabled />
        </div>
        <div>
          <label className="label">Project name</label>
          <input className="input" value={initial.name} disabled />
        </div>
      </div>

      <div>
        <label className="label">Role Description</label>
        <input className="input" value={initial.roleDescription || ''} disabled />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Describe this SO / opportunity"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">SO Number</label>
          <input className="input" value={form.soNumber} onChange={(e) => set('soNumber', e.target.value)} />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div>
          <label className="label">Staff Assigned</label>
          <input
            type="number"
            min="0"
            className="input"
            value={form.staffAssigned}
            onChange={(e) => set('staffAssigned', e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save changes
        </button>
      </div>
    </form>
  )
}

// Create form for new opportunities. "Add Project" creates a new row in the
// SO_List sheet tab (not the sales-pipeline sheet) — fields mirror SO_List's
// real columns: SO_Number, Vertical, Parent Customer, Project ID, Project
// Name, Hiring Manager, Demand Role Description, Requirement Month,
// Location, Winzone, Status. See server/index.js POST /api/optys and
// workbook.js applyToWorkbook for how these round-trip into the sheet.
const SO_BLANK = {
  soNumber: '',
  vertical: '',
  client: '',
  projectId: '',
  name: '',
  hiringManagerId: '',
  roleDescription: '',
  requirementMonth: '',
  location: '',
  winzone: '',
  status: '',
}

function SOOptyCreateForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(SO_BLANK)
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Project name is required'
    if (!form.client.trim()) e.client = 'Parent customer name is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (ev) => {
    ev.preventDefault()
    if (validate()) onSubmit({ ...form, kind: 'SO' })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">SO Number</label>
          <input className="input" value={form.soNumber} onChange={(e) => set('soNumber', e.target.value)} placeholder="e.g. 500123" />
        </div>
        <div>
          <label className="label">Vertical</label>
          <input className="input" value={form.vertical} onChange={(e) => set('vertical', e.target.value)} placeholder="e.g. FSI" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Parent Customer Name</label>
          <input className="input" value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="Account / client name" />
          {errors.client && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.client}</p>}
        </div>
        <div>
          <label className="label">Project ID</label>
          <input className="input" value={form.projectId} onChange={(e) => set('projectId', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className="label">Project Name</label>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Atlas CRM Modernization" />
        {errors.name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Hiring Manager ID</label>
          <input className="input" value={form.hiringManagerId} onChange={(e) => set('hiringManagerId', e.target.value)} />
        </div>
        <div>
          <label className="label">Demand Role</label>
          <input className="input" value={form.roleDescription} onChange={(e) => set('roleDescription', e.target.value)} placeholder="e.g. Senior Java Developer" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Requirement Start</label>
          <input className="input" value={form.requirementMonth} onChange={(e) => set('requirementMonth', e.target.value)} placeholder="e.g. Oct 2026" />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. London" />
        </div>
        <div>
          <label className="label">Winzone</label>
          <input className="input" value={form.winzone} onChange={(e) => set('winzone', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Status</label>
        <input className="input" value={form.status} onChange={(e) => set('status', e.target.value)} placeholder="e.g. Open" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Create opportunity
        </button>
      </div>
    </form>
  )
}

export default function Opportunities() {
  const { data, createOpty, updateOpty, deleteOpty, allocatedHours, pendingFilter, setPendingFilter } = useApp()
  const { allocations } = data
  // Show only opportunities sourced from SO_LIST (kind: "SO").
  // Delivery and pipeline-sheet rows are intentionally excluded.
  const optys = useMemo(() => data.optys.filter((o) => o.kind === 'SO'), [data.optys])

  const [search, setSearch] = useState('')
  const [salesStageFilter, setSalesStageFilter] = useState('All')
  const [maxBudget, setMaxBudget] = useState('')
  const [editing, setEditing] = useState(null) // opty object or 'new'
  const [deleting, setDeleting] = useState(null)

  // Honor a filter handed over from the Dashboard pie chart.
  useEffect(() => {
    if (pendingFilter?.type === 'status') {
      setSalesStageFilter(pendingFilter.value)
      setPendingFilter(null)
    }
  }, [pendingFilter, setPendingFilter])

  const budgetCeiling = useMemo(
    () => optys.reduce((m, o) => Math.max(m, Number(o.budget) || 0), 0),
    [optys],
  )

  const salesStages = useMemo(
    () => [...new Set(optys.map((o) => o.sales_stage).filter(Boolean))].sort(),
    [optys],
  )

  const filtered = useMemo(() => {
    return optys.filter((o) => {
      if (salesStageFilter !== 'All' && o.sales_stage !== salesStageFilter) return false
      if (maxBudget && Number(o.budget) > Number(maxBudget)) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !o.name.toLowerCase().includes(q) &&
          !o.client.toLowerCase().includes(q) &&
          !(o.vertical || '').toLowerCase().includes(q) &&
          !(o.sales_stage || '').toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [optys, salesStageFilter, maxBudget, search])

  const allocCount = (optyId) => allocations.filter((a) => a.opty_id === optyId).length

  const clearFilters = () => {
    setSearch('')
    setSalesStageFilter('All')
    setMaxBudget('')
  }
  const hasFilters = search || salesStageFilter !== 'All' || maxBudget

  // --- Hierarchical grouping: SO Available/Not Available -> Vertical -> Projects
  // Top-level split: SO Available (SO_Number is not blank/null) vs SO Not
  // Available (SO_Number is blank/null), independent of whether the
  // opportunity is tied to a delivery project via Project_ID. Account is no
  // longer a separate hierarchy level — it's shown as a column in the
  // projects table instead (see render below).
  const groupByVertical = (list) => {
    const verticals = new Map()
    for (const o of list) {
      const resourceNeeded = Number(o.quantity) || 0
      const staffCount = allocations.filter((a) => a.opty_id === o.id).length

      const vKey = o.vertical || 'Unspecified'
      if (!verticals.has(vKey))
        verticals.set(vKey, { key: vKey, projects: [], budget: 0, count: 0, resourceNeeded: 0, staffCount: 0 })
      const v = verticals.get(vKey)
      v.projects.push(o)
      v.budget += Number(o.budget) || 0
      v.count += 1
      v.resourceNeeded += resourceNeeded
      v.staffCount += staffCount
    }
    return [...verticals.values()].sort((a, b) => a.key.localeCompare(b.key))
  }

  const categories = useMemo(() => {
    const driven = filtered.filter((o) => !!(o.soNumber && String(o.soNumber).trim()))
    const notAvailable = filtered.filter((o) => !(o.soNumber && String(o.soNumber).trim()))
    return [
      { key: 'driven', label: 'SO Available', list: driven, verticals: groupByVertical(driven) },
      { key: 'notAvailable', label: 'SO Not Available', list: notAvailable, verticals: groupByVertical(notAvailable) },
    ].filter((c) => c.list.length > 0)
  }, [filtered, allocations])

  const [openCategories, setOpenCategories] = useState(new Set())
  const [openVerticals, setOpenVerticals] = useState(new Set())

  const toggleCategory = (key) => {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleVertical = (key) => {
    setOpenVerticals((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allCollapsed = openCategories.size === 0 && openVerticals.size === 0
  const toggleCollapseAll = () => {
    if (allCollapsed) {
      // Expand all
      setOpenCategories(new Set(categories.map((c) => c.key)))
      setOpenVerticals(new Set(categories.flatMap((c) => c.verticals.map((v) => `${c.key}||${v.key}`))))
    } else {
      // Collapse all
      setOpenCategories(new Set())
      setOpenVerticals(new Set())
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                className="input pl-10"
                placeholder="Search by project or client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input sm:w-44" value={salesStageFilter} onChange={(e) => setSalesStageFilter(e.target.value)}>
              <option>All</option>
              {salesStages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button className="btn-ghost" onClick={clearFilters}>
                <X size={16} /> Clear
              </button>
            )}
            {filtered.length > 0 && (
              <button className="btn-ghost" onClick={toggleCollapseAll}>
                {allCollapsed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={18} /> Add Project
            </button>
          </div>
        </div>
      </div>

      {/* Hierarchical accordion: Vertical -> Account -> Projects */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No opportunities found"
          message={hasFilters ? 'Try adjusting your filters.' : 'Create your first opportunity to get started.'}
          action={
            !hasFilters && (
              <button className="btn-primary" onClick={() => setEditing('new')}>
                <Plus size={18} /> Add Project
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {categories.map((c) => {
            const cOpen = openCategories.has(c.key)
            const catCount = c.list.length
            return (
              <div className={`card overflow-hidden ${cOpen ? 'ring-1 ring-brand-500/30 dark:ring-accent-500/30' : ''}`} key={c.key}>
                <button
                  aria-expanded={cOpen}
                  className="group flex w-full items-center justify-between gap-3 bg-slate-900/[0.03] px-5 py-4 text-left transition-colors hover:bg-slate-900/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                  onClick={() => toggleCategory(c.key)}
                >
                  <div className="flex items-center gap-3">
                    <CollapseChevron open={cOpen} size={18} />
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100">{c.label}</span>
                    <span
                      className={`badge ${
                        c.key === 'driven'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      }`}
                    >
                      {catCount} opportunit{catCount === 1 ? 'y' : 'ies'}
                    </span>
                  </div>
                  <ExpandHint open={cOpen} />
                </button>

                {cOpen && (
                  <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 p-3 dark:border-night-700 dark:bg-night-800/60">
                    {c.verticals.map((v) => {
                      const vKey = `${c.key}||${v.key}`
                      const vOpen = openVerticals.has(vKey)
                      return (
                        <div key={vKey} className="card overflow-hidden">
                          <button
                            aria-expanded={vOpen}
                            className="group flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-night-800"
                            onClick={() => toggleVertical(vKey)}
                          >
                            <div className="flex items-center gap-3">
                              <CollapseChevron open={vOpen} size={16} />
                              <Layers size={16} className="shrink-0 text-violet-500" />
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{v.key}</span>
                              <span className="badge bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300">
                                {v.count} project{v.count === 1 ? '' : 's'}
                              </span>
                              <span className="badge bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                                {v.resourceNeeded} needed
                              </span>
                              <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                {v.staffCount} staffed
                              </span>
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{v.budget ? currency(v.budget) : '—'}</span>
                          </button>

                          {vOpen && (
                            <div className="overflow-x-auto border-t border-slate-200 bg-white dark:border-night-700 dark:bg-night-850">
                              <table className="w-full text-left text-sm">
                                <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
                                  <tr>
                                    <th className="py-2 pl-11 pr-5 font-semibold">Account</th>
                                    <th className="px-5 py-2 font-semibold">Opportunity Name</th>
                                    <th className="px-5 py-2 font-semibold">SO Number</th>
                                    <th className="px-5 py-2 font-semibold">Grade</th>
                                    <th className="px-5 py-2 font-semibold">Role Description</th>
                                    <th className="px-5 py-2 font-semibold">Location</th>
                                    <th className="px-5 py-2 font-semibold">Expected Date</th>
                                    <th className="px-5 py-2 font-semibold">Revenue</th>
                                    <th className="px-5 py-2 font-semibold">Resource Needed</th>
                                    <th className="px-5 py-2 font-semibold">Staff</th>
                                    <th className="px-5 py-2 text-right font-semibold">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-night-800">
                                  {v.projects.map((o) => (
                                    <tr key={o.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-night-800/70">
                                      <td className="py-3 pl-11 pr-5 text-slate-600 dark:text-slate-300">
                                        <span className="inline-flex items-center gap-1.5">
                                          <Building2 size={13} className="shrink-0 text-brand-500" />
                                          {o.client || <span className="text-slate-300 dark:text-slate-600">—</span>}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3 text-slate-800 dark:text-slate-200">{o.name}</td>
                                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        {o.soNumber || <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        {o.grade || <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3 max-w-xs truncate text-slate-600 dark:text-slate-300" title={o.roleDescription || ''}>
                                        {o.roleDescription || <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        {o.location || <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
                                        {o.sales_stage ? (
                                          <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{o.sales_stage}</span>
                                        ) : (
                                          <span className="text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                      </td>
                                      <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                                        {o.budget ? currency(o.budget) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">
                                        {o.quantity ? o.quantity : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                      </td>
                                      <td className="px-5 py-3">
                                        <span className="badge bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300">
                                          {allocCount(o.id)} assigned
                                        </span>
                                      </td>
                                      <td className="px-5 py-3">
                                        <div className="flex justify-end gap-1">
                                          <button
                                            className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-accent-500/15 dark:hover:text-accent-300"
                                            onClick={() => setEditing(o)}
                                            aria-label="Edit"
                                          >
                                            <Pencil size={16} />
                                          </button>
                                          {o.kind === 'Pipeline' && (
                                            <button
                                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                                              onClick={() => setDeleting(o)}
                                              aria-label="Delete"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <div className="px-1 text-xs text-slate-500 dark:text-slate-400">
            Showing {filtered.length} of {optys.length} opportunities across {categories.length} categor
            {categories.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add Opportunity' : 'Edit Opportunity'}
        subtitle={editing === 'new' ? 'Create a new project in SO_List' : editing?.name}
      >
        {editing === 'new' && (
          <SOOptyCreateForm
            onCancel={() => setEditing(null)}
            onSubmit={(form) => {
              createOpty(form)
              setEditing(null)
            }}
          />
        )}
        {editing && editing !== 'new' && editing.kind === 'SO' && (
          <SOOptyEditForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={(form) => {
              updateOpty(editing.id, form)
              setEditing(null)
            }}
          />
        )}
        {editing && editing !== 'new' && editing.kind !== 'SO' && (
          <OptyForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={(form) => {
              updateOpty(editing.id, form)
              setEditing(null)
            }}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteOpty(deleting.id)}
        title="Delete opportunity?"
        confirmLabel="Delete project"
        message={
          deleting
            ? `"${deleting.name}" will be permanently removed. This also purges ${allocCount(
                deleting.id,
              )} staff allocation(s) linked to it.`
            : ''
        }
      />
    </div>
  )
}
