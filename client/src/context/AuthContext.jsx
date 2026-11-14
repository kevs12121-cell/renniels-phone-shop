import { createContext, useContext, useEffect, useState } from 'react'
import api, { TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState({ business_name: 'Renniels Phone Shop' })
  const [loading, setLoading] = useState(true)

  async function loadSettings() {
    try {
      const { data } = await api.get('/settings')
      setSettings((current) => ({ ...current, ...data.settings }))
    } catch {
      // Settings are cosmetic (receipt header); keep defaults on failure.
    }
  }

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false)
      return
    }
    api.get('/auth/me')
      .then(({ data }) => { setUser(data.user); return loadSettings() })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    loadSettings()
    return data.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // Logging out locally is what matters.
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
    }
  }

  const value = { user, setUser, settings, setSettings, reloadSettings: loadSettings, loading, login, logout, isOwner: user?.role === 'OWNER' }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
