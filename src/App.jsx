import { useCallback, useState, useEffect } from 'react'
import { Menu, Loader2, AlertTriangle, Sun, Moon, LogOut } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import Toast from './components/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Opportunities from './pages/Opportunities.jsx'
import Resources from './pages/Resources.jsx'
import Allocations from './pages/Allocations.jsx'
import CwrStatus from './pages/CWRStatus.jsx'
import Login from './pages/Login.jsx'
import ForcePasswordChange from './pages/ForcePasswordChange.jsx'
import AccessRequests from './pages/AccessRequests.jsx'
import { useApp } from './context/AppContext.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useTheme } from './context/ThemeContext.jsx'

const PAGES = {
  dashboard: { title: 'Dashboard', subtitle: 'High-level summary & utilization', Component: Dashboard },
  opportunities: { title: 'Opportunities', subtitle: 'Track the project pipeline and budgets', Component: Opportunities },
  resources: { title: 'Resources', subtitle: 'Team directory and utilization', Component: Resources },
  allocations: { title: 'Allocations', subtitle: 'Assign staff to projects', Component: Allocations },
  'cwr-status': {
    title: 'Contractor (CWR) Status',
    subtitle: 'Live candidate pipeline from CWR_List',
    Component: CwrStatus,
  },
  'access-requests': {
    title: 'Access Requests',
    subtitle: 'Approve or reject new login requests',
    Component: AccessRequests,
  },
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const { setPendingFilter, loading, error, refresh } = useApp()
  const { user, loading: authLoading, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const navigate = useCallback(
    (id, filter = null) => {
      setPendingFilter(filter)
      setPage(id)
      setMenuOpen(false)
    },
    [setPendingFilter],
  )

  // The data endpoints require a signed-in user, and the initial fetch in
  // AppContext runs before login — so refetch once the user is authenticated
  // (login, or a restored session) to clear any pre-auth error and load data.
  useEffect(() => {
    if (user) refresh().catch(() => {})
  }, [user, refresh])

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-slate-400">
        <Loader2 size={32} className="animate-spin" />
        <p className="mt-3 text-sm font-medium">Checking your session…</p>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  // Force a password change before allowing access to the rest of the app
  // when an admin has just reset this user's password (see
  // server/users.js adminSetPassword / mustChangePassword).
  if (user.mustChangePassword) {
    return <ForcePasswordChange />
  }

  // Non-admins can never land on the admin-only Access Requests page, even
  // via a stale navigate() call (e.g. from a previous admin session).
  const activePage = page === 'access-requests' && user.role !== 'admin' ? 'dashboard' : page
  const { title, subtitle, Component } = PAGES[activePage]

  return (
    <div className="min-h-screen">
      <Sidebar current={activePage} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-night-700 dark:bg-night-900/80">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-night-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h1>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>

            {/* Top-right controls: light/dark toggle + user menu */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-night-800"
                aria-label="Toggle light/dark theme"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              {user && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-night-700 dark:bg-night-850">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white dark:bg-accent-600">
                    {(user.name || user.username || '?')
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="hidden leading-tight sm:block">
                    <p className="max-w-[10rem] truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
                    <p className="text-[11px] capitalize text-slate-400 dark:text-slate-500">{user.role}</p>
                  </div>
                  <button
                    onClick={logout}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-night-700 dark:hover:text-slate-200"
                    aria-label="Log out"
                    title="Log out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="mt-3 text-sm font-medium">Loading data from Community Sheet.xlsx…</p>
            </div>
          ) : error ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-800 dark:bg-rose-950/40">
              <AlertTriangle size={28} className="mx-auto text-rose-500" />
              <h2 className="mt-3 text-base font-bold text-rose-800 dark:text-rose-300">Couldn’t reach the data server</h2>
              <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">{error}</p>
              <p className="mt-2 text-xs text-rose-600/80 dark:text-rose-400/80">
                Make sure the API is running (it serves Community Sheet.xlsx). Start everything with{' '}
                <code className="rounded bg-white/60 px-1 py-0.5 dark:bg-black/20">pnpm dev</code>.
              </p>
              <button className="btn-danger mt-4" onClick={refresh}>
                Retry
              </button>
            </div>
          ) : (
            <Component onNavigate={navigate} />
          )}
        </main>
      </div>

      <Toast />
    </div>
  )
}
