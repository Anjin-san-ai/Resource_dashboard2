import { useState } from 'react'
import { KeyRound, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

// Blocking screen shown when a user's password was just reset by an admin
// (user.mustChangePassword === true). No "current password" field is shown
// here since the temp password was already verified at login — the user
// must simply pick a new one before proceeding into the app.
export default function ForcePasswordChange() {
  const { changePassword, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (ev) => {
    ev.preventDefault()
    setError('')
    if (password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await changePassword(null, password)
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-night-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/Cognizantlogo.png" alt="Cognizant" className="cognizant-logo h-9" />
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            An administrator reset your password. Set a new one to continue.
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600 dark:text-rose-300">
                <AlertTriangle size={14} /> {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Set new password
            </button>
            <button type="button" className="btn-subtle w-full" onClick={logout} disabled={busy}>
              Log out instead
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
