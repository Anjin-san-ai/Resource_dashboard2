import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Mail, Search, Users, Briefcase, Building2, UserCog } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { RoleBadge, UtilizationBar, EmptyState, StatusDot, AllocationFlag, PctAllocatedFlag } from '../components/ui.jsx'

const BLANK = { name: '', role: 'A', email: '', max_hours: 40, currentProject: '', accountName: '' }

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  'bg-brand-100 text-brand-700 dark:bg-accent-500/15 dark:text-accent-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
]
function avatarColor(id) {
  let sum = 0
  for (const ch of id) sum += ch.charCodeAt(0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function ResourceForm({ initial, onSubmit, onCancel, isEmailTaken, roles, bandLabel }) {
  const [form, setForm] = useState(initial || BLANK)
  const [errors, setErrors] = useState({})
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    const email = form.email.trim()
    if (!email) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email'
    else if (isEmailTaken(email, initial?.id)) e.email = 'This email is already in use'
    if (!(Number(form.max_hours) > 0)) e.max_hours = 'Max hours must be positive'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (ev) => {
    ev.preventDefault()
    if (validate()) onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Full name</label>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ava Thompson" />
        {errors.name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Band</label>
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
            {(roles && roles.length ? roles : ['A', 'SA', 'M', 'SM', 'AD', 'CWR']).map((r) => (
              <option key={r} value={r}>
                {bandLabel ? `${r} — ${bandLabel(r)}` : r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Max weekly hours</label>
          <input
            type="number"
            min="1"
            className="input"
            value={form.max_hours}
            onChange={(e) => set('max_hours', e.target.value)}
          />
          {errors.max_hours && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.max_hours}</p>}
        </div>
      </div>
      <div>
        <label className="label">Corporate email</label>
        <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" />
        {errors.email && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{errors.email}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Current project</label>
          <input
            className="input"
            value={form.currentProject || ''}
            onChange={(e) => set('currentProject', e.target.value)}
            placeholder="e.g. On Bench"
          />
        </div>
        <div>
          <label className="label">Account</label>
          <input
            className="input"
            value={form.accountName || ''}
            onChange={(e) => set('accountName', e.target.value)}
            placeholder="Client / account"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {initial ? 'Save changes' : 'Add resource'}
        </button>
      </div>
    </form>
  )
}

export default function Resources() {
  const {
    data,
    meta,
    bandLabel,
    createResource,
    updateResource,
    deleteResource,
    isEmailTaken,
    utilization,
    allocatedHours,
    pendingFilter,
    setPendingFilter,
  } = useApp()
  const { resources, allocations } = data

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [highlight, setHighlight] = useState(null)
  const cardRefs = useRef({})

  // Focus a specific resource when arriving from the Dashboard bar chart.
  useEffect(() => {
    if (pendingFilter?.type === 'resource') {
      const id = pendingFilter.value
      setHighlight(id)
      setPendingFilter(null)
      const t = setTimeout(() => {
        cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      const clear = setTimeout(() => setHighlight(null), 2400)
      return () => {
        clearTimeout(t)
        clearTimeout(clear)
      }
    }
  }, [pendingFilter, setPendingFilter])

  const filtered = useMemo(() => {
    const isInactive = (r) => r.status === 'InActive' || r.status === 'Inactive'
    return resources
      .filter((r) => {
        if (roleFilter !== 'All' && r.role !== roleFilter) return false
        if (search) {
          const q = search.toLowerCase()
          const hay = `${r.name} ${r.email} ${r.currentProject || ''} ${r.accountName || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => Number(isInactive(a)) - Number(isInactive(b)))
  }, [resources, roleFilter, search])

  const projectCount = (resId) =>
    new Set(allocations.filter((a) => a.resource_id === resId).map((a) => a.opty_id)).size

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                className="input pl-10"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input sm:w-56" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option>All</option>
              {(meta.roles || []).map((r) => (
                <option key={r} value={r}>
                  {r} — {bandLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> Add Resource
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No resources found"
          message={search || roleFilter !== 'All' ? 'Try adjusting your filters.' : 'Add your first team member.'}
          action={
            !(search || roleFilter !== 'All') && (
              <button className="btn-primary" onClick={() => setEditing('new')}>
                <Plus size={18} /> Add Resource
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const u = utilization(r)
            const isHi = highlight === r.id
            const isInactive = r.status === 'InActive' || r.status === 'Inactive'
            return (
              <div
                key={r.id}
                ref={(el) => (cardRefs.current[r.id] = el)}
                className={`card p-5 transition-all ${isHi ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-accent-400 dark:ring-offset-night-900' : ''} ${
                  isInactive ? 'opacity-50 grayscale' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold ${avatarColor(r.id)}`}>
                        {initials(r.name)}
                      </div>
                      <StatusDot status={r.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-night-850" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{r.name}</p>
                      <RoleBadge role={r.role} label={`${r.band} · ${bandLabel(r.band)}`} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-accent-600/20 dark:hover:text-accent-300"
                      onClick={() => setEditing(r)}
                      aria-label="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                      onClick={() => setDeleting(r)}
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <AllocationFlag allocationStatus={r.allocationStatus} status={r.status} />
                  <PctAllocatedFlag pctAllocated={r.pctAllocated} status={r.status} />
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Mail size={13} />
                    <span className="truncate">{r.email}</span>
                  </div>
                  {r.supervisor && (
                    <div className="flex items-center gap-2">
                      <UserCog size={13} />
                      <span className="truncate">Supervisor: {r.supervisor}</span>
                    </div>
                  )}
                  {(r.currentProject || r.projectName) && (
                    <div className="flex items-center gap-2">
                      <Briefcase size={13} />
                      <span className="truncate">
                        {r.currentProject && r.currentProject !== r.projectName
                          ? `${r.currentProject} · ${r.projectName || ''}`.replace(/ · $/, '')
                          : r.projectName || r.currentProject}
                      </span>
                    </div>
                  )}
                  {r.parentCustomer && (
                    <div className="flex items-center gap-2">
                      <Building2 size={13} />
                      <span className="truncate">Account: {r.parentCustomer}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <UtilizationBar used={u.used} max={u.max} pct={u.pct} level={u.level} muted={isInactive} />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-night-800 dark:text-slate-400">
                  <span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{projectCount(r.id)}</span> project(s)
                  </span>
                  <span>
                    <span className={`font-semibold ${u.remaining < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'}`}>
                      {u.remaining}
                    </span>{' '}
                    hrs free
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add Resource' : 'Edit Resource'}
        subtitle={editing === 'new' ? 'Add a team member to the directory' : editing?.name}
      >
        {editing && (
          <ResourceForm
            initial={editing === 'new' ? null : editing}
            isEmailTaken={isEmailTaken}
            roles={meta.roles}
            bandLabel={bandLabel}
            onCancel={() => setEditing(null)}
            onSubmit={(form) => {
              if (editing === 'new') createResource(form)
              else updateResource(editing.id, form)
              setEditing(null)
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteResource(deleting.id)}
        title="Delete resource?"
        confirmLabel="Delete resource"
        message={
          deleting
            ? `"${deleting.name}" will be permanently removed, along with all ${allocations.filter(
                (a) => a.resource_id === deleting.id,
              ).length} of their project allocation(s).`
            : ''
        }
      />
    </div>
  )
}
