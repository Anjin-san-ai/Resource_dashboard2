import { LayoutDashboard, Briefcase, Users, Network, X, ShieldCheck, LogOut, UserCog } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

const NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, hint: 'Summary' },
  { id: 'opportunities', label: 'Opportunities', icon: Briefcase, hint: 'Project pipeline' },
  { id: 'allocations', label: 'Allocations', icon: Network, hint: 'Assignment grid' },
  { id: 'cwr-status', label: 'CWR Status', icon: UserCog, hint: 'Contractor pipeline' },
  { id: 'resources', label: 'Resources', icon: Users, hint: 'Staffing directory' },
]

const ADMIN_NAV = { id: 'access-requests', label: 'Access Requests', icon: ShieldCheck, hint: 'Approve new logins' }

export default function Sidebar({ current, onNavigate, open, onClose }) {
  const { user, isAdmin, logout } = useAuth()
  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-300 dark:border-night-700 dark:bg-night-900 lg:!translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between px-6 py-5">
          <div className="min-w-0">
            {/* Cognizant logo — top-left brand mark */}
            <img src="/Cognizantlogo.png" alt="Cognizant" className="cognizant-logo h-7" />
            <p className="mt-3 truncate text-sm font-extrabold leading-tight text-slate-900 dark:text-slate-100">
              AI Opportunity &amp; Staff Availability
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Resource Planning</p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-night-800 lg:hidden"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-2">
          {items.map((item) => {
            const active = current === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-accent-600/20 dark:text-accent-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-night-800 dark:hover:text-slate-100'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? 'bg-brand-600 text-white dark:bg-accent-600'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-night-800 dark:text-slate-400 dark:group-hover:bg-night-700'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-night-700">
          {user && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-night-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {user.username} · {user.role}
                </p>
              </div>
              <button
                onClick={logout}
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-night-700 dark:hover:text-slate-200"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
