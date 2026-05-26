import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { Key } from 'lucide-react'

/**
 * Payroll unlock tab — mirrors AccountingTab pattern.
 * Enables OS content protection (blocks screenshots) while visible.
 */
export default function PayrollTab({
  unlockKey, setUnlockKey, unlocking, setUnlocking, refreshSettings
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    window.api?.setContentProtection?.(true)
    setTimeout(() => inputRef.current?.focus(), 100)
    return () => {
      window.api?.setContentProtection?.(false)
      setUnlockKey('')
    }
  }, [])

  const handleUnlock = async () => {
    if (!unlockKey.trim()) return
    setUnlocking(true)
    try {
      const r = await window.api.unlockPayroll({ key: unlockKey })
      if (r.ok) {
        toast.success('Payroll module unlocked! Restart the app to see the Payroll menu.')
        setUnlockKey('')
        await refreshSettings()
      } else {
        toast.error(r.error || 'Invalid key — check the key and try again')
      }
    } catch(e) {
      toast.error(e.message || 'Unlock failed')
    } finally {
      setUnlocking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleUnlock()
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') e.preventDefault()
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x')) e.preventDefault()
  }

  return (
    <div className="card space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Payroll Module Unlock</h3>
        <p className="text-xs text-gray-400 mt-1">
          This screen is protected — screenshots and screen recording are blocked while you are here.
        </p>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Premium Feature</p>
        <p>
          The payroll module (staff, salary grades, PAYE, pension, payslips) requires an unlock key.
          Contact your SchoolFees Manager agent to obtain one for this school.
        </p>
      </div>

      <div className="space-y-2">
        <label className="form-label flex items-center gap-1.5">
          <Key size={13} className="text-gray-400" />
          Payroll Unlock Key
        </label>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="password"
            className="form-input font-mono flex-1 tracking-[0.3em] text-center"
            placeholder="• • • – • • • •"
            value={unlockKey}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="characters"
            onChange={e => setUnlockKey(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onContextMenu={e => e.preventDefault()}
            onPaste={e => e.preventDefault()}
            onCopy={e => e.preventDefault()}
            onCut={e => e.preventDefault()}
          />
          <button
            className="btn btn-primary"
            onClick={handleUnlock}
            disabled={unlocking || !unlockKey.trim()}
          >
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Key format: <span className="font-mono">PAY-XXXX-XXXX</span> — unique per school name.
        </p>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <strong>Note:</strong> Once unlocked, the Payroll menu will appear in the sidebar after restarting the app.
        The unlock is stored locally — you will not need to re-enter the key on this machine.
      </div>
    </div>
  )
}
