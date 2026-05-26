import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { Key } from 'lucide-react'

export default function InventoryTab({
  unlockKey, setUnlockKey, unlocking, setUnlocking, refreshSettings
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    window.api?.setContentProtection?.(true)
    setTimeout(() => inputRef.current?.focus(), 100)
    return () => { window.api?.setContentProtection?.(false); setUnlockKey('') }
  }, [])

  const handleUnlock = async () => {
    if (!unlockKey.trim()) return
    setUnlocking(true)
    try {
      const r = await window.api.unlockInventory({ key: unlockKey })
      if (r.ok) {
        toast.success('Inventory module unlocked! Restart the app to see the Inventory menu.')
        setUnlockKey('')
        await refreshSettings()
      } else {
        toast.error(r.error || 'Invalid key')
      }
    } catch(e) { toast.error(e.message) }
    finally { setUnlocking(false) }
  }

  return (
    <div className="card space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Inventory Module Unlock</h3>
        <p className="text-xs text-gray-400 mt-1">Screenshots blocked while this tab is open.</p>
      </div>
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Premium Feature</p>
        <p>The inventory module (stock catalogue, purchases, sales, valuation) requires an unlock key. Contact your SchoolFees Manager agent.</p>
      </div>
      <div className="space-y-2">
        <label className="form-label flex items-center gap-1.5">
          <Key size={13} className="text-gray-400"/> Inventory Unlock Key
        </label>
        <div className="flex gap-2">
          <input ref={inputRef} type="password"
            className="form-input font-mono flex-1 tracking-[0.3em] text-center"
            placeholder="• • • – • • • •"
            value={unlockKey} autoComplete="new-password" autoCorrect="off" autoCapitalize="characters"
            onChange={e => setUnlockKey(e.target.value.toUpperCase())}
            onKeyDown={e => {
              if (e.key === 'Enter') handleUnlock()
              if ((e.ctrlKey||e.metaKey) && ['v','c','x'].includes(e.key)) e.preventDefault()
            }}
            onContextMenu={e=>e.preventDefault()} onPaste={e=>e.preventDefault()}
            onCopy={e=>e.preventDefault()} onCut={e=>e.preventDefault()}
          />
          <button className="btn btn-primary" onClick={handleUnlock} disabled={unlocking||!unlockKey.trim()}>
            {unlocking?'Unlocking…':'Unlock'}
          </button>
        </div>
        <p className="text-xs text-gray-400">Key format: <span className="font-mono">INV-XXXX-XXXX</span></p>
      </div>
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <strong>Note:</strong> Inventory menu appears after restarting the app. Unlock is stored locally on this machine.
      </div>
    </div>
  )
}
