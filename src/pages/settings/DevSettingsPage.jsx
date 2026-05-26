import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Shield, Database, ToggleLeft, ToggleRight, AlertTriangle, Terminal, RefreshCw, ExternalLink } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function DevSettingsPage() {
  const { isDeveloper, accounting, setAccounting, refreshSettings } = useAuth()
  const navigate = useNavigate()
  const [activation, setActivation]     = useState(null)
  const [machineId, setMachineId]       = useState('')
  const [loading, setLoading]           = useState(true)
  const [toggling, setToggling]         = useState(false)
  const [dbDir, setDbDir]               = useState('')
  const [appVersion, setAppVersion]     = useState('')
  const [updateInfo, setUpdateInfo]     = useState(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [acctKeyName, setAcctKeyName]   = useState('')
  const [acctKey, setAcctKey]           = useState('')
  const [payKeyName, setPayKeyName]     = useState('')
  const [payKey, setPayKey]             = useState('')

  useEffect(() => {
    // Only developer can access this page
    if (!isDeveloper) { navigate('/'); return }
    async function load() {
      const [status, mid, dir, ver] = await Promise.all([
        window.api.getActivationStatus(),
        window.api.getMachineId(),
        window.api.getDbDir(),
        window.api.getAppVersion(),
      ])
      setActivation(status.activation)
      setMachineId(mid)
      setDbDir(dir)
      setAppVersion(ver)
      setLoading(false)
    }
    load()
  }, [isDeveloper])

  const checkForUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const r = await window.api.checkUpdate()
      if (r.ok) {
        setUpdateInfo(r)
        if (r.hasUpdate) toast.success(`Update available: v${r.latestVersion}`)
        else toast.info('You are on the latest version!')
      } else {
        toast.error(r.error || 'Could not check for updates')
      }
    } catch (e) { toast.error(e.message) }
    finally { setCheckingUpdate(false) }
  }

  const toggleAccounting = async () => {
    setToggling(true)
    try {
      const newVal = !accounting
      await window.api.setAccounting(newVal)
      setAccounting(newVal)
      await refreshSettings()
      toast.success(`Accounting module ${newVal ? 'enabled' : 'disabled'}`)
    } catch (e) { toast.error(e.message) }
    finally { setToggling(false) }
  }

  const openDbDir = () => window.api.openPath(dbDir)

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Developer Settings"
        subtitle="Internal configuration — visible only to developer login."
      />

      {/* Developer badge */}
      <div className="mb-5 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-3">
        <Shield size={18} className="text-purple-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-purple-800">Developer Access</p>
          <p className="text-xs text-purple-600">You are logged in as the developer. These settings are not visible to regular users.</p>
        </div>
      </div>

      <div className="space-y-4">

        {/* Activation info */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Shield size={14} className="text-blue-500" /> License / Activation
          </h2>
          {activation ? (
            <div className="space-y-2 text-sm">
              {[
                ['Status',       activation.is_active ? '✅ Activated' : '❌ Not activated'],
                ['License Key',  activation.license_key],
                ['School Name',  activation.school_name],
                ['Tier',         activation.tier],
                ['Max Students', activation.max_students],
                ['Activated',    activation.activated_at?.slice(0,16) || '—'],
                ['Expires',      activation.expires_at || 'Never'],
                ['Machine ID',   machineId],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-mono text-xs text-gray-800 text-right max-w-xs truncate">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Not activated</p>
          )}
        </div>

        {/* Module toggles */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <ToggleRight size={14} className="text-blue-500" /> Module Access Control
          </h2>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-800">Accounting Module</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Chart of accounts, journal, invoices, ledger, trial balance
              </p>
            </div>
            <button
              onClick={toggleAccounting}
              disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${accounting ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
            >
              {accounting
                ? <><ToggleRight size={16} /> Enabled</>
                : <><ToggleLeft  size={16} /> Disabled</>}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Use this to enable/disable the accounting module per school installation.
            Link this to the school's payment plan on your activation server.
          </p>
        </div>

        {/* Database info */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Database size={14} className="text-blue-500" /> Database
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">DB Directory</span>
              <button onClick={openDbDir} className="font-mono text-xs text-blue-600 hover:underline max-w-xs truncate">
                {dbDir}
              </button>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">App Version</span>
              <span className="font-mono text-xs text-gray-800">{appVersion || '1.0.0'}</span>
            </div>
          </div>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            To replace the database, copy your .db file into the directory shown above and restart the app.
            You can also use the Backup & Restore page to restore from a backup file.
          </div>
        </div>

        {/* Update Checker */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <RefreshCw size={14} className="text-blue-500" /> Software Update
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Current Version</span>
              <span className="font-mono text-xs text-gray-800">v{appVersion || '1.0.0'}</span>
            </div>
            {updateInfo && (
              <div className={`p-3 rounded-lg border text-sm ${updateInfo.hasUpdate ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                {updateInfo.hasUpdate ? (
                  <>
                    <p className="font-semibold">🎉 Update available: v{updateInfo.latestVersion}</p>
                    {updateInfo.notes && (
                      <p className="text-xs mt-1 text-blue-700 line-clamp-3">{updateInfo.notes.slice(0, 200)}</p>
                    )}
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-700 underline"
                      onClick={e => { e.preventDefault(); window.api.openPath(updateInfo.downloadUrl) }}
                    >
                      <ExternalLink size={11} /> Download Update
                    </a>
                  </>
                ) : (
                  <p className="font-medium">✅ You are on the latest version (v{updateInfo.currentVersion})</p>
                )}
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm flex items-center gap-2"
              onClick={checkForUpdate}
              disabled={checkingUpdate}
            >
              <RefreshCw size={13} className={checkingUpdate ? 'animate-spin' : ''} />
              {checkingUpdate ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>
        </div>

        {/* Accounting Key Generator */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Shield size={14} className="text-purple-500" /> Generate Accounting Unlock Key
          </h2>
          <p className="text-xs text-gray-500 mb-3">Generate a school-specific ACCT-XXXX-XXXX key to unlock the accounting module for a client.</p>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="form-input text-sm flex-1"
                placeholder="Enter exact school name (case-insensitive)"
                value={acctKeyName}
                onChange={e => setAcctKeyName(e.target.value)}
              />
              <button
                className="btn btn-secondary btn-sm whitespace-nowrap"
                onClick={async () => {
                  if (!acctKeyName.trim()) return
                  const r = await window.api.generateAccountingKey({ school_name: acctKeyName })
                  if (r.ok) setAcctKey(r.key)
                  else toast.error(r.error)
                }}
              >
                Generate
              </button>
            </div>
            {acctKey && (
              <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="font-mono font-bold text-purple-800 tracking-widest text-lg flex-1">{acctKey}</span>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => { navigator.clipboard.writeText(acctKey); toast.success('Copied!') }}>
                  Copy
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400">⚠️ The school must enter their name <strong>exactly</strong> as registered in Settings → School Info for this key to work.</p>
          </div>
        </div>

        {/* Payroll Key Generator */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Shield size={14} className="text-emerald-500" /> Generate Payroll Unlock Key
          </h2>
          <p className="text-xs text-gray-500 mb-3">Generate a school-specific PAY-XXXX-XXXX key to unlock the payroll module for a client.</p>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="form-input text-sm flex-1"
                placeholder="Enter exact school name (case-insensitive)"
                value={payKeyName}
                onChange={e => setPayKeyName(e.target.value)}
              />
              <button
                className="btn btn-secondary btn-sm whitespace-nowrap"
                onClick={async () => {
                  if (!payKeyName.trim()) return
                  const r = await window.api.generatePayrollKey({ school_name: payKeyName })
                  if (r.ok) setPayKey(r.key)
                  else toast.error(r.error)
                }}
              >
                Generate
              </button>
            </div>
            {payKey && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="font-mono font-bold text-emerald-800 tracking-widest text-lg flex-1">{payKey}</span>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => { navigator.clipboard.writeText(payKey); toast.success('Copied!') }}>
                  Copy
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400">⚠️ School name must match Settings → School Info exactly.</p>
          </div>
        </div>

        {/* Remote connection placeholder */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Terminal size={14} className="text-blue-500" /> Remote / External DB Connection
          </h2>
          <div className="p-4 bg-gray-50 rounded-xl text-center text-sm text-gray-400">
            <Terminal size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="font-medium text-gray-500">Coming Soon</p>
            <p className="text-xs mt-1">Connect this installation to an external database or sync with another SchoolFees instance.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
