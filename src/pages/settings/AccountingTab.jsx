import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { Key } from 'lucide-react'

/**
 * Accounting unlock tab — isolated component so it can:
 * 1. Enable OS-level content protection (blocks screenshots) when mounted
 * 2. Disable it when unmounted (user navigates away)
 * 3. Block paste/copy/right-click on the key input
 */
export default function AccountingTab({
  unlockKey, setUnlockKey, unlocking, setUnlocking, refreshSettings
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    // Enable screenshot protection when this tab is visible
    window.api?.setContentProtection?.(true)
    // Focus the input so user can start typing immediately
    setTimeout(() => inputRef.current?.focus(), 100)

    return () => {
      // Disable when navigating away — don't lock the whole app
      window.api?.setContentProtection?.(false)
      // Clear the key from memory when leaving
      setUnlockKey('')
    }
  }, [])

  const handleUnlock = async () => {
    if (!unlockKey.trim()) return
    setUnlocking(true)
    try {
      const r = await window.api.unlockAccounting({ key: unlockKey })
      if (r.ok) {
        toast.success('Accounting module unlocked! Restart the app to see the Accounting menu.')
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
    // Allow Enter to submit
    if (e.key === 'Enter') handleUnlock()
    // Block Ctrl+V / Cmd+V paste shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') e.preventDefault()
    // Block Ctrl+C / Ctrl+X
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x')) e.preventDefault()
  }

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Accounting Module Unlock</h3>
        <p className="text-xs text-gray-400 mt-1">
          This screen is protected — screenshots and screen recording are blocked while you are here.
        </p>
      </div>

      {/* Info */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Premium Feature</p>
        <p>The double-entry accounting module (chart of accounts, journal, ledger, trial balance) requires an unlock key. Contact your SchoolFees Manager agent to obtain one for this school.</p>
      </div>

      {/* Key input */}
      <div className="space-y-2">
        <label className="form-label flex items-center gap-1.5">
          <Key size={13} className="text-gray-400" />
          Accounting Unlock Key
        </label>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="password"
            className="form-input font-mono flex-1 tracking-[0.3em] text-center"
            placeholder="• • • • – • • • • – • • • •"
            value={unlockKey}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck="false"
            maxLength={14}
            onChange={e => {
              // Force uppercase, auto-insert hyphens
              let v = e.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '')
              setUnlockKey(v)
            }}
            onKeyDown={handleKeyDown}
            onPaste={e => e.preventDefault()}
            onCopy={e => e.preventDefault()}
            onCut={e => e.preventDefault()}
            onContextMenu={e => e.preventDefault()}
            onDrop={e => e.preventDefault()}
          />
          <button
            type="button"
            className="btn-primary btn whitespace-nowrap"
            disabled={unlocking || unlockKey.trim().length < 13}
            onClick={handleUnlock}
          >
            <Key size={14} />
            {unlocking ? 'Verifying…' : 'Unlock'}
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-400">
            Format: <span className="font-mono">ACCT-XXXX-XXXX</span> — type the key manually. Paste is disabled.
          </p>
          <p className="text-xs text-amber-600">
            🔒 Screenshots are blocked on this screen. Navigate away to restore normal behaviour.
          </p>
        </div>
      </div>
    </div>
  )
}
