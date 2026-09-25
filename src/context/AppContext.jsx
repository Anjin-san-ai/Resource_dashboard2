import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as db from '../db/db.js'

const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}

const EMPTY_META = { roles: [], statuses: ['Pipeline', 'Active', 'Completed', 'On Hold'], bandLabels: {} }

export function AppProvider({ children }) {
  const [data, setData] = useState({ optys: [], resources: [], allocations: [] })
  const [meta, setMeta] = useState(EMPTY_META)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  // Cross-page filter payload set when a Dashboard chart is clicked.
  const [pendingFilter, setPendingFilter] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const d = await db.fetchData()
      setData({ optys: d.optys || [], resources: d.resources || [], allocations: d.allocations || [] })
      setMeta(d.meta || EMPTY_META)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load data')
      throw err
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await refresh()
      } catch {
        /* error state already set */
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  // Live refresh via Server-Sent Events. The API server pushes a
  // "data-changed" event whenever the workbook changes — an edit made in the
  // app, a local Excel edit picked up by the server-side watcher, or an
  // external upload delivered through the Azure Event Grid webhook. On each
  // event we silently refetch (no loading/busy flash). A slow interval + a
  // refetch-on-focus act as a safety net if the stream drops. This replaces
  // the previous fixed 5s poll, so uploads land in the UI in ~1–2s.
  useEffect(() => {
    let cancelled = false
    const silentRefresh = () => {
      if (!cancelled) refresh().catch(() => {})
    }

    let es
    try {
      es = new EventSource('/api/events')
      es.addEventListener('data-changed', silentRefresh)
    } catch {
      /* EventSource unsupported — the interval below still keeps us fresh */
    }

    const onFocus = () => silentRefresh()
    window.addEventListener('focus', onFocus)
    const id = setInterval(silentRefresh, 60000)

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      es?.close()
    }
  }, [refresh])

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, key: Math.random() })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3400)
    return () => clearTimeout(t)
  }, [toast])

  // Wrap a mutation: run it, refresh, toast; surface errors as a warning toast.
  const run = useCallback(
    async (fn, successMsg, tone = 'success') => {
      setBusy(true)
      try {
        await fn()
        await refresh()
        if (successMsg) notify(successMsg, tone)
        return true
      } catch (err) {
        notify(err.message || 'Something went wrong', 'warning')
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh, notify],
  )

  const actions = useMemo(
    () => ({
      createOpty: (p) => run(() => db.createOpty(p), 'Opportunity created'),
      updateOpty: (id, p) => run(() => db.updateOpty(id, p), 'Opportunity updated'),
      deleteOpty: (id) => run(() => db.deleteOpty(id), 'Opportunity deleted (allocations purged)', 'warning'),
      createResource: (p) => run(() => db.createResource(p), 'Resource added'),
      updateResource: (id, p) => run(() => db.updateResource(id, p), 'Resource updated'),
      deleteResource: (id) => run(() => db.deleteResource(id), 'Resource deleted (allocations purged)', 'warning'),
      createAllocation: (p) => run(() => db.createAllocation(p), 'Allocation created'),
      updateAllocation: (id, p) => run(() => db.updateAllocation(id, p), 'Allocation updated'),
      deleteAllocation: (id) => run(() => db.deleteAllocation(id), 'Allocation removed'),
    }),
    [run],
  )

  const helpers = useMemo(() => {
    const { optys, resources, allocations } = data

    const allocatedHours = (resourceId, exceptAllocId = null) =>
      allocations
        .filter((a) => a.resource_id === resourceId && a.id !== exceptAllocId)
        .reduce((s, a) => s + (Number(a.hours_allocated) || 0), 0)

    const optyById = (id) => optys.find((o) => o.id === id)
    const resourceById = (id) => resources.find((r) => r.id === id)

    const isEmailTaken = (email, exceptId = null) => {
      const t = String(email || '').trim().toLowerCase()
      return resources.some((r) => (r.email || '').toLowerCase() === t && r.id !== exceptId)
    }

    const utilization = (resource) => {
      const used = allocatedHours(resource.id)
      const max = Number(resource.max_hours) || 0
      const pct = max > 0 ? Math.round((used / max) * 100) : 0
      let level = 'balanced'
      if (used > max) level = 'over'
      else if (pct < 60) level = 'under'
      return { used, max, pct, level, remaining: max - used }
    }

    const bandLabel = (band) => meta.bandLabels?.[band] || band || '—'

    return { allocatedHours, optyById, resourceById, isEmailTaken, utilization, bandLabel }
  }, [data, meta])

  const value = useMemo(
    () => ({
      data,
      meta,
      loading,
      error,
      busy,
      ...actions,
      ...helpers,
      refresh,
      notify,
      toast,
      pendingFilter,
      setPendingFilter,
    }),
    [data, meta, loading, error, busy, actions, helpers, refresh, notify, toast, pendingFilter],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
