import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, getMe } from '../api'

const AuthContext = createContext(null)

const SESSION_KEY = 'pos_hw_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
  })
  const [checking, setChecking] = useState(true)

  // On mount, verify session is still valid against the server
  useEffect(() => {
    getMe()
      .then(res => {
        const staff = res.data?.staff
        if (staff) {
          setUser(staff)
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(staff))
        } else {
          setUser(null)
          sessionStorage.removeItem(SESSION_KEY)
        }
      })
      .catch(() => {
        // Backend unreachable — trust sessionStorage (offline mode)
      })
      .finally(() => setChecking(false))
  }, [])

  async function login(pin, staffId, role) {
    const res = await apiLogin(pin, staffId, role)
    const staff = res.data.staff
    setUser(staff)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(staff))
    return staff
  }

  async function logout() {
    try { await apiLogout() } catch {}
    setUser(null)
    sessionStorage.removeItem(SESSION_KEY)
  }

  function hasRole(...roles) {
    return user && roles.includes(user.role)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, hasRole, checking }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
