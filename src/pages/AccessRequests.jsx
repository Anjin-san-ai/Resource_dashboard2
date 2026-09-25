import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Check, X, Loader2, RefreshCcw, Trash2, KeyRound, UserPlus } from 'lucide-react'
import * as auth from '../db/auth.js'
import { EmptyState } from '../components/ui.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Modal from '../components/Modal.jsx'

function StatusBadge({ status }) {
  const map = {
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return <span className={`badge ${map[status] || 'bg-slate-100 text-slate-600 dark:bg-night-700 dark:text-slate-300'}`}>{status}</span>
}

// Admin form to force-set another user's password. On submit the user is
// flagged mustChangePassword server-side, so they'll be required to pick
// their own password the next time they log in.
function SetPasswordForm({ targetUser, onSubmit, onCancel }) {
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
      await onSubmit(password)
    } catch (err) {
      setError(err.message || 'Failed to set password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">User</label>
        <input className="input" value={`${targetUser.name} (${targetUser.username})`} disabled />
      </div>
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
      <p className="text-xs text-slate-500 dark:text-slate-400">
        This user will be required to choose their own password the next time they log in.
      </p>
      {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          Set password
        </button>
      </div>
    </form>
  )
}

// Default password for admin-created logins (kept simple for now, per request).
const DEFAULT_LOGIN_PASSWORD = 'C0gn1z4nt'

// Admin form to create a ready-to-use login in one step (no self-service
// request needed). The account is created already-approved so the user can
// sign in immediately with the password shown here.
function CreateLoginForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    username: '',
    password: DEFAULT_LOGIN_PASSWORD,
    role: 'user',
    mustChangePassword: false,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (ev) => {
    ev.preventDefault()
    setError('')
    if (!form.employeeId.trim() || !form.name.trim() || !form.username.trim()) {
      setError('Employee ID, name and username are all required')
      return
    }
    if (form.password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    setBusy(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err.message || 'Failed to create login')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Employee ID</label>
          <input className="input" autoFocus value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} placeholder="e.g. 123456" />
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Username (login ID)</label>
          <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="jane.doe" />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Password</label>
        <input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Defaults to <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-night-700">C0gn1z4nt</code> — share it with the user; they can change it later.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600 dark:border-night-600 dark:bg-night-900 dark:text-accent-500"
          checked={form.mustChangePassword}
          onChange={(e) => set('mustChangePassword', e.target.checked)}
        />
        Require the user to change this password on first login
      </label>
      {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-subtle" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Create login
        </button>
      </div>
    </form>
  )
}

export default function AccessRequests() {
  const [pending, setPending] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [settingPassword, setSettingPassword] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, u] = await Promise.all([auth.listPending(), auth.listUsers()])
      setPending(p)
      setUsers(u)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load access requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const approve = async (id) => {
    setBusyId(id)
    try {
      await auth.approveRequest(id)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to approve')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id) => {
    setBusyId(id)
    try {
      await auth.rejectRequest(id)
      setRejecting(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to reject')
    } finally {
      setBusyId(null)
    }
  }

  const removeUser = async (id) => {
    setBusyId(id)
    try {
      await auth.deleteUser(id)
      setDeleting(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setBusyId(null)
    }
  }

  const setPassword = async (password) => {
    if (!settingPassword) return
    setBusyId(settingPassword.id)
    try {
      await auth.adminSetPassword(settingPassword.id, password)
      setSettingPassword(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const createLogin = async (form) => {
    await auth.adminCreateUser(form)
    setCreating(false)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <ShieldCheck size={16} className="text-brand-600 dark:text-accent-400" />
            {pending.length} pending request{pending.length === 1 ? '' : 's'}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <UserPlus size={16} /> Create login
            </button>
            <button className="btn-ghost" onClick={load}>
              <RefreshCcw size={16} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-night-700">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Pending requests</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-10 text-slate-400 dark:text-slate-500">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : pending.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No pending requests" message="New access requests will show up here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-2 font-semibold">Employee ID</th>
                  <th className="px-5 py-2 font-semibold">Name</th>
                  <th className="px-5 py-2 font-semibold">Username</th>
                  <th className="px-5 py-2 font-semibold">Requested</th>
                  <th className="px-5 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-night-800">
                {pending.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-night-800/70">
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{r.employeeId}</td>
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{r.name}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.username}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                          onClick={() => approve(r.id)}
                          disabled={busyId === r.id}
                          aria-label="Approve"
                          title="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          onClick={() => setRejecting(r)}
                          disabled={busyId === r.id}
                          aria-label="Reject"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-night-700">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">All users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-night-700 dark:bg-night-800 dark:text-slate-400">
              <tr>
                <th className="px-5 py-2 font-semibold">Employee ID</th>
                <th className="px-5 py-2 font-semibold">Name</th>
                <th className="px-5 py-2 font-semibold">Username</th>
                <th className="px-5 py-2 font-semibold">Role</th>
                <th className="px-5 py-2 font-semibold">Status</th>
                <th className="px-5 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-night-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-night-800/70">
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{u.employeeId}</td>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{u.name}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{u.username}</td>
                  <td className="px-5 py-3 text-slate-600 capitalize dark:text-slate-300">{u.role}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
                        onClick={() => setSettingPassword(u)}
                        disabled={busyId === u.id}
                        aria-label={`Set password for ${u.name}`}
                        title="Set password"
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        onClick={() => setDeleting(u)}
                        disabled={busyId === u.id}
                        aria-label={`Delete ${u.name}`}
                        title="Delete user / revoke access"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={() => rejecting && reject(rejecting.id)}
        title="Reject access request?"
        confirmLabel="Reject request"
        message={rejecting ? `"${rejecting.name}" (${rejecting.username}) will need to submit a new request.` : ''}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeUser(deleting.id)}
        title="Delete user?"
        confirmLabel="Delete user"
        message={
          deleting
            ? `"${deleting.name}" (${deleting.username}) will lose access immediately and must submit a new request to regain it.`
            : ''
        }
      />

      <Modal
        open={!!settingPassword}
        onClose={() => setSettingPassword(null)}
        title="Set password"
        subtitle={settingPassword ? `Force a new password for ${settingPassword.name}` : ''}
      >
        {settingPassword && (
          <SetPasswordForm
            targetUser={settingPassword}
            onCancel={() => setSettingPassword(null)}
            onSubmit={setPassword}
          />
        )}
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create login"
        subtitle="Add a ready-to-use account (approved immediately)"
      >
        {creating && <CreateLoginForm onCancel={() => setCreating(false)} onSubmit={createLogin} />}
      </Modal>
    </div>
  )
}
