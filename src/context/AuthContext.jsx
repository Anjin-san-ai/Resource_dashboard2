import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as auth from '../db/auth.js'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, validate any previously stored token against the server so a
  // page refresh doesn't force a fresh login unnecessarily.
  useEffect(() => {
    ;(async () => {
      if (!auth.getToken()) {
        setLoading(false)
        return
      }
      try {
        const u = await auth.me()
        setUser(u)
      } catch {
        auth.setToken(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const login = useCallback(async (username, password) => {
    const u = await auth.login(username, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {})
    setUser(null)
  }, [])

  const requestAccess = useCallback((data) => auth.requestAccess(data), [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { user: updated } = await auth.changePassword(currentPassword, newPassword)
    setUser(updated)
    return updated
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      requestAccess,
      changePassword,
      isAdmin: user?.role === 'admin',
    }),
    [user, loading, login, logout, requestAccess, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
