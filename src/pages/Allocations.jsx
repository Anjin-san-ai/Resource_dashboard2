import { useMemo, useState } from 'react'
import { UserX, Users, UserMinus, UserPlus, Globe2, Pencil } from 'lucide-react'
import { CollapseChevron, ExpandHint } from '../components/ui.jsx'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'

// A resource is "on bench" when parked on the internal "CTS" account while
// still employed/active — i.e. currently billable-ready but not billing.
function isOnBench(r) {
  return (r.parentCustomer || '').trim().toUpperCase() === 'CTS' && r.status === 'Active'
}

// A resource is "resigned" once their status is flagged Inactive — they've
// left and should be surfaced separately from bench/allocated staff.
function isResigned(r) {
  return (r.status || '').trim().toLowerCase() === 'inactive'
}

// A resource represents an in-flight new hire when Status is "InProgress" —
// surfaced separately as "Recruitment in Progress" rather than
// bench/allocated/resigned. Parent Customer for these candidates is
// typically "New Hire" (or the internal "CTS" pool while awaiting
// onboarding), so status is the reliable signal; Active/Inactive are
// already fully covered by the Allocated/Bench/Resigned sections above.
function isRecruiting(r) {
  return (r.status || '').trim().toLowerCase() === 'inprogress'
}

// A resource belongs to the "Romania" classification when their Legal
// Entity (from the employee sheet) is Romania — surfaced as its own bucket
// rather than folded into bench/allocated/resigned/recruiting.
function isRomania(r) {
  return (r.legalEntity || '').trim().toLowerCase() === 'romania'
}

function ResourceStatusBadge({ onBench, resigned }) {
  const label = resigned ? 'Resigned' : onBench ? 'Not Allocated' : 'Allocated'
  const tone = resigned
    ? 'bg-slate-200 text-slate-600 dark:bg-night-600 dark:text-slate-300'
    : onBench
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  return <span className={`badge ${tone}`}>{label}</span>
}

// Edit form: pre-populated from the employee's own record. Lets the user
// change the primary project, account, allocation %, and the derived
// Allocated / Not Allocated (bench) status.
function AllocationEditForm({ resource, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    projectName: resource.projectName || resource.currentProject || '',
    accountName: resource.accountName || (isOnBench(resource) ? '' : resource.parentCustomer || ''),
    pctAllocated: resource.pctAllocated != null ? Math.round(Number(resource.pctAllocated) * 100) : '',
    allocationStatus: isOnBench(resource) ? 'Not Allocated' : 'Allocated',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (ev) => {
    ev.preventDefault()
    const notAllocated = form.allocationStatus === 'Not Allocated'
    onSubmit({
      projectName: form.projectName.trim(),
      currentProject: form.projectName.trim(),
      accountName: notAllocated ? resource.accountName || '' : form.accountName.trim(),
      // Bench rule: Parent Customer "CTS" (+ Active status) == Not Allocated.
      parentCustomer: notAllocated ? 'CTS' : form.accountName.trim(),
      status: 'Active',
      pctAllocated: form.pctAllocated === '' ? null : Number(form.pctAllocated) / 100,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Employee</label>
        <input className="input" value={resource.name} disabled />
      </div>

      <div>
        <label className="label">Allocation status</label>
        <select
          className="input"
          value={form.allocationStatus}
          onChange={(e) => set('allocationStatus', e.target.value)}
        >
          <option>Allocated</option>
          <option>Not Allocated</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Project name</label>
          <input
            className="input"
            value={form.projectName}
            onChange={(e) => set('projectName', e.target.value)}
            placeholder="e.g. Atlas CRM Modernization"
          />
        </div>
        <div>
          <label className="label">Account name</label>
          <input
            className="input"
            value={form.allocationStatus === 'Not Allocated' ? '' : form.accountName}
            onChange={(e) => set('accountName', e.target.value)}
            placeholder="e.g. Acme Corp"
            disabled={form.allocationStatus === 'Not Allocated'}
          />
        </div>
      </div>

      <div>
        <label className="label">Allocation %</label>
        <input
          type="number"
          min="0"
          max="100"
          className="input"
          value={form.pctAllocated}
          onChange={(e) => set('pctAllocated', e.target.value)}
          placeholder="e.g. 100"
        />
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

function ResourceStatusTable({ rows, onBench, resigned, emptyMessage, onEdit }) {
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500">{emptyMessage}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
          <tr>
            <th className="px-5 py-2 font-semibold">Employee Name</th>
            <th className="px-5 py-2 font-semibold">Account Name</th>
            <th className="px-5 py-2 font-semibold">Allocation Status</th>
            <th className="px-5 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-night-800">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-night-800/70">
              <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                {r.accountName || r.parentCustomer || <span className="text-slate-300 dark:text-slate-600">—</span>}
              </td>
              <td className="px-5 py-3">
                <ResourceStatusBadge onBench={onBench} resigned={resigned} />
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-accent-600/20 dark:hover:text-accent-300"
                  onClick={() => onEdit(r)}
                  aria-label={`Edit ${r.name}`}
                >
                  <Pencil size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Read-only table for the "Recruitment in Progress" section: new hires
// (Parent Customer "New Hire", Status "InProgress") don't yet have a real
// allocation to edit, so this simply lists Candidate Name / Account Name /
// Status with no actions column.
function RecruitmentTable({ rows, emptyMessage }) {
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500">{emptyMessage}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
          <tr>
            <th className="px-5 py-2 font-semibold">Candidate Name</th>
            <th className="px-5 py-2 font-semibold">Account Name</th>
            <th className="px-5 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-night-800">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-night-800/70">
              <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
              <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                {r.accountName || r.currentProject || r.projectName || (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </td>
              <td className="px-5 py-3">
                <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{r.status || 'InProgress'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Collapsible card section: header shows the title + count and a
// chevron/toggle button; body (the table) only renders while expanded.
function CollapsibleSection({ icon, iconClass, title, count, badgeClass, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`card overflow-hidden ${open ? 'ring-1 ring-brand-500/30 dark:ring-accent-500/30' : ''}`}>
      <button
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-left transition-colors hover:bg-slate-100/70 dark:border-night-700 dark:bg-night-800 dark:hover:bg-night-700/70"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <CollapseChevron open={open} size={18} />
          {icon}
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <span className={`badge ${badgeClass}`}>{count}</span>
        </div>
        <ExpandHint open={open} />
      </button>
      {open && children}
    </div>
  )
}

export default function Allocations() {
  const { data, updateResource } = useApp()
  const { resources } = data
  const [editing, setEditing] = useState(null)

  // Bench vs. allocated vs. resigned vs. recruiting vs. Romania split,
  // derived from each resource's own record (Parent Customer / Status /
  // Romania keyword match). Resigned, recruiting, and Romania resources are
  // pulled out of both the bench and allocated buckets.
  const benchResources = useMemo(
    () => resources.filter((r) => !isResigned(r) && !isRecruiting(r) && !isRomania(r) && isOnBench(r)),
    [resources]
  )
  const otherResources = useMemo(
    () => resources.filter((r) => !isResigned(r) && !isRecruiting(r) && !isRomania(r) && !isOnBench(r)),
    [resources]
  )
  const resignedResources = useMemo(
    () => resources.filter((r) => isResigned(r) && !isRomania(r)),
    [resources]
  )
  const recruitingResources = useMemo(
    () => resources.filter((r) => isRecruiting(r) && !isRomania(r)),
    [resources]
  )
  const romaniaResources = useMemo(() => resources.filter(isRomania), [resources])

  return (
    <div className="space-y-5">
      <CollapsibleSection
        icon={<UserX size={16} className="text-rose-500" />}
        title="On Bench"
        count={benchResources.length}
        badgeClass="bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      >
        <ResourceStatusTable
          rows={benchResources}
          onBench
          emptyMessage="No resources currently on bench."
          onEdit={setEditing}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Users size={16} className="text-emerald-500" />}
        title="Allocated"
        count={otherResources.length}
        badgeClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      >
        <ResourceStatusTable
          rows={otherResources}
          onBench={false}
          emptyMessage="No allocated resources found."
          onEdit={setEditing}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<UserMinus size={16} className="text-slate-500 dark:text-slate-400" />}
        title="Resigned"
        count={resignedResources.length}
        badgeClass="bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300"
      >
        <ResourceStatusTable
          rows={resignedResources}
          onBench={false}
          resigned
          emptyMessage="No resigned resources found."
          onEdit={setEditing}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<UserPlus size={16} className="text-amber-500" />}
        title="Recruitment in Progress"
        count={recruitingResources.length}
        badgeClass="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      >
        <RecruitmentTable
          rows={recruitingResources}
          emptyMessage="No candidates currently in recruitment."
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Globe2 size={16} className="text-sky-500" />}
        title="Romania"
        count={romaniaResources.length}
        badgeClass="bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
      >
        <RecruitmentTable
          rows={romaniaResources}
          emptyMessage="No Romania-based resources found."
        />
      </CollapsibleSection>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Allocation"
        subtitle={editing ? `Update allocation details for ${editing.name}` : ''}
      >
        {editing && (
          <AllocationEditForm
            resource={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (form) => {
              await updateResource(editing.id, form)
              setEditing(null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}
