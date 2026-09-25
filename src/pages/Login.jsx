import { useState } from 'react'
import { LogIn, UserPlus, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

const BLANK_REQUEST = { employeeId: '', name: '', username: '', password: '', confirm: '' }

export default function Login() {
  const { login, requestAccess } = useAuth()
  const [tab, setTab] = useState('login') // 'login' | 'request'

  // Login tab state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // Request-access tab state
  const [form, setForm] = useState(BLANK_REQUEST)
  const [reqError, setReqError] = useState('')
  const [reqBusy, setReqBusy] = useState(false)
  const [reqSuccess, setReqSuccess] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submitLogin = async (ev) => {
    ev.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      await login(username, password)
    } catch (err) {
      setLoginError(err.message || 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  const submitRequest = async (ev) => {
    ev.preventDefault()
    setReqError('')
    if (form.password !== form.confirm) {
      setReqError('Passwords do not match')
      return
    }
    setReqBusy(true)
    try {
      await requestAccess(form)
      setReqSuccess(true)
      setForm(BLANK_REQUEST)
    } catch (err) {
      setReqError(err.message || 'Request failed')
    } finally {
      setReqBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-night-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/Cognizantlogo.png" alt="Cognizant" className="cognizant-logo h-9" />
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            AI Opportunity and Staff Availability
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to access the resource planning dashboard</p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-700">
            <button
              className={`flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                tab === 'login' ? 'bg-brand-50 text-brand-700 dark:bg-accent-600/20 dark:text-accent-300' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-night-700/50'
              }`}
              onClick={() => setTab('login')}
            >
              <LogIn size={16} /> Log in
            </button>
            <button
              className={`flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                tab === 'request' ? 'bg-brand-50 text-brand-700 dark:bg-accent-600/20 dark:text-accent-300' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-night-700/50'
              }`}
              onClick={() => {
                setTab('request')
                setReqSuccess(false)
              }}
            >
              <UserPlus size={16} /> Request access
            </button>
          </div>

          <div className="p-6">
            {tab === 'login' ? (
              <form onSubmit={submitLogin} className="space-y-4">
                <div>
                  <label className="label">Username</label>
                  <input
                    className="input"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {loginError && (
                  <p className="flex items-center gap-1.5 text-sm text-rose-600">
                    <AlertTriangle size={14} /> {loginError}
                  </p>
                )}
                <button type="submit" className="btn-primary w-full" disabled={loggingIn}>
                  {loggingIn ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                  {loggingIn ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            ) : reqSuccess ? (
              <div className="py-4 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">Request submitted</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  An administrator needs to approve your access before you can sign in. Check back soon.
                </p>
                <button className="btn-subtle mt-4" onClick={() => setTab('login')}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={submitRequest} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Employee ID</label>
                    <input
                      className="input"
                      value={form.employeeId}
                      onChange={(e) => set('employeeId', e.target.value)}
                      placeholder="e.g. E10234"
                    />
                  </div>
                  <div>
                    <label className="label">Full name</label>
                    <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
                  </div>
                </div>
                <div>
                  <label className="label">Desired username</label>
                  <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="jane.doe" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Password</label>
                    <input
                      type="password"
                      className="input"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="label">Confirm password</label>
                    <input
                      type="password"
                      className="input"
                      value={form.confirm}
                      onChange={(e) => set('confirm', e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                {reqError && (
                  <p className="flex items-center gap-1.5 text-sm text-rose-600">
                    <AlertTriangle size={14} /> {reqError}
                  </p>
                )}
                <button type="submit" className="btn-primary w-full" disabled={reqBusy}>
                  {reqBusy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {reqBusy ? 'Submitting…' : 'Submit request'}
                </button>
                <p className="text-center text-xs text-slate-400">
                  An administrator must approve your request before you can sign in.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
