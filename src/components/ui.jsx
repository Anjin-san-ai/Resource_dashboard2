// Small presentational helpers shared across pages.
import { ChevronRight } from 'lucide-react'

// Expand/collapse affordance shared by every collapsible section (Opportunities
// categories/verticals, Allocations buckets, CWR agencies). An accent-tinted
// rounded tile with a chevron that rotates 90° when open — reads clearly as an
// interactive toggle, unlike a bare faint chevron.
export function CollapseChevron({ open, size = 16 }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-200 dark:bg-accent-500/20 dark:text-accent-200 dark:group-hover:bg-accent-500/30"
      aria-hidden="true"
    >
      <ChevronRight
        size={size}
        className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      />
    </span>
  )
}

// Small right-aligned "Expand"/"Collapse" hint that brightens on row hover, so
// it's obvious the whole header is clickable.
export function ExpandHint({ open }) {
  return (
    <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-colors group-hover:text-brand-600 dark:text-slate-500 dark:group-hover:text-accent-300 sm:inline-flex">
      {open ? 'Collapse' : 'Expand'}
    </span>
  )
}


export const STATUS_STYLES = {
  Pipeline: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Completed: 'bg-slate-200 text-slate-700 dark:bg-night-700 dark:text-slate-300',
  'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

export const STATUS_COLORS = {
  Pipeline: '#0ea5e9',
  Active: '#10b981',
  Completed: '#64748b',
  'On Hold': '#f59e0b',
}

// Coloring for Cognizant bands (the app's "role" values).
export const ROLE_STYLES = {
  A: 'bg-brand-100 text-brand-700 dark:bg-accent-500/15 dark:text-accent-300',
  SA: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  M: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  SM: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  AD: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  D: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  CWR: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  '#N/A': 'bg-slate-100 text-slate-500 dark:bg-night-700 dark:text-slate-400',
}

export const KIND_STYLES = {
  Pipeline: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Delivery: 'bg-slate-200 text-slate-700 dark:bg-night-700 dark:text-slate-300',
}

// --- Employee "Status" (from the UKI Employee List's Status column) --------
// Small colored dot: Active = green, InActive = red, Resigned = amber.
export const EMPLOYEE_STATUS_DOT = {
  Active: 'bg-emerald-500',
  InActive: 'bg-rose-500',
  Inactive: 'bg-rose-500',
  Resigned: 'bg-amber-500',
}

export function StatusDot({ status, className = '' }) {
  const color = EMPLOYEE_STATUS_DOT[status] || 'bg-slate-300'
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color} ${className}`}
      title={status || 'Unknown'}
      aria-label={`Status: ${status || 'Unknown'}`}
    />
  )
}

// --- Allocation flag (Bench vs Allocated) ----------------------------------
// Derived from Parent Customer: blank or "CTS" (the internal bench pool) ->
// Bench (red); anything else -> Allocated (green). If the associate's
// employment status is InActive, that takes priority and shows as "Inactive" (red).
export function AllocationFlag({ allocationStatus, status }) {
  const isInactive = status === 'InActive' || status === 'Inactive'
  const isBench = allocationStatus === 'Bench'
  const label = isInactive ? 'Inactive' : allocationStatus || 'Allocated'
  const tone =
    isInactive || isBench
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  return <span className={`badge ${tone}`}>{label}</span>
}

// --- % Allocated flag -------------------------------------------------------
// `pctAllocated` is stored as a fraction (1 = 100%, 0.1 = 10%). For inactive
// employees, the raw value is stale, so it's shown muted/grey instead of
// its usual green/amber tone.
export function PctAllocatedFlag({ pctAllocated, status }) {
  if (pctAllocated === null || pctAllocated === undefined || pctAllocated === '') return null
  const isInactive = status === 'InActive' || status === 'Inactive'
  const pct = Math.round(Number(pctAllocated) * 100)
  const tone = isInactive
    ? 'bg-slate-100 text-slate-400 dark:bg-night-700 dark:text-slate-500'
    : pct >= 100
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : pct > 0
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
        : 'bg-slate-100 text-slate-500 dark:bg-night-700 dark:text-slate-400'
  return <span className={`badge ${tone}`}>{pct}% Allocated</span>
}

export function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 dark:bg-night-700 dark:text-slate-300'}`}>
      {status}
    </span>
  )
}

// `role` is the band code used for coloring; `label` is the text shown.
export function RoleBadge({ role, label }) {
  return (
    <span className={`badge ${ROLE_STYLES[role] || 'bg-slate-100 text-slate-700 dark:bg-night-700 dark:text-slate-300'}`}>
      {label || role}
    </span>
  )
}

export function KindBadge({ kind }) {
  return (
    <span className={`badge ${KIND_STYLES[kind] || 'bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300'}`}>
      {kind}
    </span>
  )
}

export const currency = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0)

export const UTIL_LEVELS = {
  over: { label: 'Over-allocated', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100 dark:bg-rose-500/15', bar: 'bg-rose-500' },
  balanced: { label: 'Balanced', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-500/15', bar: 'bg-emerald-500' },
  under: { label: 'Under-allocated', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-500/15', bar: 'bg-amber-500' },
}

export function UtilizationBar({ used, max, pct, level, muted = false }) {
  const meta = UTIL_LEVELS[level] || UTIL_LEVELS.balanced
  const width = Math.min(pct, 100)
  const barClass = muted ? 'bg-slate-300 dark:bg-night-600' : meta.bar
  const textClass = muted ? 'text-slate-400 dark:text-slate-500' : meta.text
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`font-semibold ${textClass}`}>{meta.label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {used} / {max} hrs
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-night-700">
        <div
          className={`h-full rounded-full ${barClass} transition-all`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center dark:border-night-600 dark:bg-night-850/60">
      {Icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-night-700 dark:text-slate-500">
          <Icon size={26} />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
