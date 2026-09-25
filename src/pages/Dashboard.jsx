import { useMemo } from 'react'
import { DollarSign, Activity, UsersRound, CalendarClock, FileWarning, MapPinOff, UserX } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

// A resource is "on bench" when parked on the internal "CTS" account while
// still employed/active — i.e. currently billable-ready but not billing.
// Mirrors the same rule used on the Allocations page.
function isOnBench(r) {
  return (r.parentCustomer || '').trim().toUpperCase() === 'CTS' && r.status === 'Active'
}

// KPI summary card. Double-clicking anywhere on the card (when
// onDoubleClick is provided) navigates to the relevant page for a quick
// drill-down from the dashboard.
function KpiCard({ icon: Icon, label, value, sub, accent, onDoubleClick }) {
  return (
    <div
      className="card p-5"
      onDoubleClick={onDoubleClick}
      title={onDoubleClick ? 'Double-click to open details' : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  )
}

// A small list tile: icon/title header, up to 3 named items, and a "+N more"
// footer when the underlying list is longer. Clicking an item (when
// onItemClick/onNavigate are provided) jumps to the relevant page.
// Double-clicking anywhere on the tile itself also opens the Opportunities
// page (via onTileDoubleClick), regardless of whether any items are shown.
function ListTile({ icon: Icon, iconAccent, title, sub, items, emptyLabel, onItemClick, onTileDoubleClick }) {
  const shown = items.slice(0, 3)
  const remaining = items.length - shown.length
  return (
    <div
      className="card p-5"
      onDoubleClick={onTileDoubleClick}
      title={onTileDoubleClick ? 'Double-click to open Opportunities' : undefined}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconAccent}`}>
          <Icon size={18} />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onItemClick && onItemClick(it)}
                className="w-full truncate rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-night-700"
                title={it.label}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <p className="mt-2 px-3 text-xs text-slate-400 dark:text-slate-500">+{remaining} more</p>
      )}
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  const { data } = useApp()
  const { optys, resources } = data

  // Opportunity KPIs are sourced from SO_LIST-derived rows only (kind:'SO'),
  // matching the Opportunities page which shows SO data exclusively.
  const soOptys = useMemo(() => optys.filter((o) => o.kind === 'SO'), [optys])

  // Total Opportunity = sum of Quantity across all SO opportunities
  // (headcount demand from SO_LIST), not the dollar budget.
  const totalQuantity = useMemo(
    () => soOptys.reduce((s, o) => s + (Number(o.quantity) || 0), 0),
    [soOptys],
  )
  // Top 5 accounts by combined quantity (resource demand), used as the KPI
  // sub-label on the Total Opportunity tile.
  const top5AccountsByQuantity = useMemo(() => {
    const byAccount = new Map()
    for (const o of soOptys) {
      const key = o.client || 'Unspecified'
      byAccount.set(key, (byAccount.get(key) || 0) + (Number(o.quantity) || 0))
    }
    return [...byAccount.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
  }, [soOptys])
  // Staff already assigned against SO opportunities (user-editable
  // "Staff Assigned" field on the Opportunities page) vs. the total headcount
  // requested (Quantity). Requests remaining = demand not yet covered.
  const allocatedQuantity = useMemo(
    () => soOptys.reduce((s, o) => s + (Number(o.staffAssigned) || 0), 0),
    [soOptys],
  )
  const requestsRemaining = Math.max(totalQuantity - allocatedQuantity, 0)
  // Over-allocated = SO opportunities where Staff Assigned exceeds the
  // headcount requested (Quantity).
  const overAllocated = useMemo(
    () => soOptys.filter((o) => (Number(o.staffAssigned) || 0) > (Number(o.quantity) || 0)).length,
    [soOptys],
  )

  // Opportunities with no Sales Order raised yet — based on a blank
  // SO_Number in the SO_List sheet tab (kind:'SO' rows only; matches what
  // the Opportunities page actually shows).
  const noSoOptys = useMemo(() => soOptys.filter((o) => !o.soNumber), [soOptys])
  // Distinct Parent Customers (o.client) among those opportunities — the
  // tile shows one entry per customer rather than one per opportunity, so
  // an account with several SO-not-raised opportunities only appears once.
  // Sorted by count of missing-SO opportunities descending (top accounts
  // first), then alphabetically as a tiebreaker.
  const noSoParentCustomers = useMemo(() => {
    const seen = new Map()
    for (const o of noSoOptys) {
      const name = o.client || 'Unspecified'
      if (!seen.has(name)) seen.set(name, { name, opty: o, count: 0 })
      seen.get(name).count += 1
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [noSoOptys])
  // Opportunities missing a Winzone — based on a blank Winzone in the
  // SO_List sheet tab (kind:'SO' rows only).
  const noWinzoneOptys = useMemo(() => soOptys.filter((o) => !o.winzone), [soOptys])
  // Resources currently on the bench (billable-ready, not yet billing).
  const benchResources = useMemo(() => resources.filter(isOnBench), [resources])
  // Allocated Staff = active employees who are NOT on the bench (i.e.
  // currently billing on a project) — mirrors the "Allocated" bucket on the
  // Allocations page (the inverse of isOnBench, restricted to Active status).
  // Inactive (resigned) employees are excluded entirely from both the count
  // and the "of N active employees" denominator below.
  const activeResources = useMemo(() => resources.filter((r) => r.status === 'Active'), [resources])
  const allocatedStaff = useMemo(
    () => activeResources.filter((r) => !isOnBench(r)).length,
    [activeResources],
  )

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Total Opportunity"
          value={totalQuantity}
          sub={
            top5AccountsByQuantity.length > 0 ? (
              <span>
                Top {top5AccountsByQuantity.length}:{' '}
                {top5AccountsByQuantity.map((a, i) => (
                  <span key={a.name}>
                    {i > 0 && ', '}
                    {a.name} ({a.qty})
                  </span>
                ))}
              </span>
            ) : (
              'No opportunities yet'
            )
          }
          accent="bg-brand-100 text-brand-700 dark:bg-accent-500/15 dark:text-accent-300"
          onDoubleClick={() => onNavigate('opportunities')}
        />
        <KpiCard
          icon={Activity}
          label="Request Remaining to Fulfilled"
          value={requestsRemaining}
          sub={`${allocatedQuantity} of ${totalQuantity} filled`}
          accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          onDoubleClick={() => onNavigate('opportunities')}
        />
        <KpiCard
          icon={UsersRound}
          label="Allocated Staff"
          value={allocatedStaff}
          sub={`${allocatedStaff} of ${activeResources.length} active employees allocated`}
          accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          onDoubleClick={() => onNavigate('allocations')}
        />
        <KpiCard
          icon={CalendarClock}
          label="Over-allocated"
          value={overAllocated}
          sub={overAllocated ? 'SOs with staff > requested' : 'All within capacity'}
          accent={overAllocated ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-night-700 dark:text-slate-400'}
          onDoubleClick={() => onNavigate('opportunities')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ListTile
          icon={FileWarning}
          iconAccent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          title="SO Not Raised"
          sub={`Top accounts by missing SO count (${noSoParentCustomers.length} account${noSoParentCustomers.length === 1 ? '' : 's'} affected)`}
          items={noSoParentCustomers.map((c) => ({
            key: c.name,
            label: `${c.name} (${c.count})`,
            opty: c.opty,
          }))}
          emptyLabel="Every opportunity has a Sales Order"
          onItemClick={(it) => onNavigate('opportunities', { type: 'status', value: it.opty.sales_stage })}
          onTileDoubleClick={() => onNavigate('opportunities')}
        />
        <ListTile
          icon={MapPinOff}
          iconAccent="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
          title="Winzone Blank"
          sub={`${noWinzoneOptys.length} opportunit${noWinzoneOptys.length === 1 ? 'y' : 'ies'} missing Winzone`}
          items={noWinzoneOptys.map((o) => ({ key: o.id, label: o.name, opty: o }))}
          emptyLabel="Every opportunity has a Winzone"
          onItemClick={(it) => onNavigate('opportunities', { type: 'status', value: it.opty.sales_stage })}
          onTileDoubleClick={() => onNavigate('opportunities')}
        />
        <ListTile
          icon={UserX}
          iconAccent="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
          title="Employees on Bench"
          sub={`${benchResources.length} employee${benchResources.length === 1 ? '' : 's'} not allocated`}
          items={benchResources.map((r) => ({ key: r.id, label: r.name, resource: r }))}
          emptyLabel="No one is on the bench"
          onItemClick={() => onNavigate('allocations')}
          onTileDoubleClick={() => onNavigate('allocations')}
        />
      </div>
    </div>
  )
}
