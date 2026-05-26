import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)      // logged-in user
  const [currency, setCurrency]       = useState({ symbol: '₦', code: 'NGN', name: 'Nigerian Naira' })
  const [activation, setActivation]   = useState(null)
  const [setupDone, setSetupDone]     = useState(false)
  const [loading, setLoading]         = useState(true)      // checking initial state
  const [accounting, setAccounting]   = useState(false)

  const loadCurrency = useCallback(async () => {
    try {
      const c = await window.api.getCurrency()
      if (c) {
        // Handle both { symbol } and { currency_symbol } formats
        setCurrency({
          symbol: c.symbol || c.currency_symbol || '₦',
          code:   c.code   || c.currency_code   || 'NGN',
          name:   c.name   || c.currency_name   || 'Nigerian Naira',
        })
      }
    } catch {}
  }, [])

  const checkStatus = useCallback(async () => {
    // Retry up to 8 times with back-off — DB may be locked briefly on startup
    let status = null
    let lastErr = null
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        status = await window.api.getActivationStatus()
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        // Wait progressively longer: 300ms, 600ms, 900ms...
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
      }
    }

    if (!status) {
      console.error('Status check failed after retries:', lastErr)
      // Keep loading=true and retry once more after 1s — prevents flash to ActivationScreen
      setTimeout(() => checkStatus(), 1000)
      return
    }

    try {
      setActivation(status.activation)
      // setup is truly done only when BOTH the flag is set AND at least one admin user exists
      setSetupDone(status.setup_complete && status.has_users)
      await loadCurrency()
      const settings = await window.api.getSettings()
      setAccounting(!!settings?.accounting_enabled)
      // payroll/inventory enabled flags are loaded directly in Sidebar from settings
    } catch (e) {
      console.error('Settings load failed:', e)
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
    const sym = currency?.symbol || '₦'
    const num = Number(n || 0)
    return sym + num.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const fmtShort = (n) => {
    const sym = currency?.symbol || '₦'
    const num = Number(n || 0)
    if (num % 1 === 0) return sym + num.toLocaleString('en-NG')
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
      isViewer:    user?.role === 'viewer',
      // canEdit: true for admin, bursar, developer — false for viewer
      canEdit:     user?.role !== 'viewer',
      // canAdmin: true only for admin and developer
      canAdmin:    user?.role === 'admin' || user?.role === 'developer',
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
