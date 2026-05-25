import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)      // logged-in user
  const [currency, setCurrency]       = useState({ symbol: '₦', code: 'NGN' })
  const [activation, setActivation]   = useState(null)
  const [setupDone, setSetupDone]     = useState(false)
  const [loading, setLoading]         = useState(true)      // checking initial state
  const [accounting, setAccounting]   = useState(false)

  const loadCurrency = useCallback(async () => {
    try {
      const c = await window.api.getCurrency()
      if (c) setCurrency(c)
    } catch {}
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await window.api.getActivationStatus()
      setActivation(status.activation)
      setSetupDone(status.setup_complete)
      // Load currency
      await loadCurrency()
      // Load accounting enabled flag
      const settings = await window.api.getSettings()
      setAccounting(!!settings?.accounting_enabled)
    } catch (e) {
      console.error('Status check failed:', e)
    } finally {
      setLoading(false)
    }
  }, [loadCurrency])

  useEffect(() => { checkStatus() }, [checkStatus])

  const login = (userData) => {
    setUser(userData)
    sessionStorage.setItem('sf_user', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem('sf_user')
  }

  const refreshCurrency = loadCurrency

  const refreshSettings = async () => {
    await loadCurrency()
    const settings = await window.api.getSettings()
    setAccounting(!!settings?.accounting_enabled)
  }

  // Restore session on hot reload (dev only)
  useEffect(() => {
    const saved = sessionStorage.getItem('sf_user')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
  }, [])

  // Currency format function that uses current settings
  const fmt = (n) => {
    const num = Number(n || 0)
    return currency.symbol + num.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const fmtShort = (n) => {
    const num = Number(n || 0)
    if (num % 1 === 0) return currency.symbol + num.toLocaleString('en-NG')
    return fmt(num)
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout,
      currency, fmt, fmtShort, refreshCurrency,
      activation, setupDone, loading,
      accounting, setAccounting,
      checkStatus, refreshSettings,
      isDeveloper: user?.role === 'developer',
      isAdmin:     user?.role === 'developer' || user?.role === 'admin',
      isBursar:    user?.role === 'bursar',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
