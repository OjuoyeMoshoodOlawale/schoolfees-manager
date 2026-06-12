import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { GraduationCap, LogIn, Eye, EyeOff, Lock, KeyRound, Copy, CheckCircle2, X } from 'lucide-react'
import { WebAutomateMark } from '../../components/WebAutomateMark'
import { Field } from '../../components/ui'
import { playErrorSound } from '../../lib/sounds'

export default function LoginScreen({ schoolName, logoPath, onLogin }) {
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)
  const [forgot, setForgot]     = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async ({ username, password }) => {
    setLoading(true)
    try {
      const result = await window.api.login({ username: username.trim(), password })
      if (result.ok) {
        toast.success(`Welcome, ${result.user.full_name || result.user.username}`)
        onLogin(result.user)
      } else {
        toast.error(result.error || 'Invalid credentials')
      }
    } catch {
      toast.error('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

      <div className="relative w-full max-w-sm">
        {/* School logo + name */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-2xl overflow-hidden">
            {logoPath ? (
              <img src={`localfile://${logoPath}`} alt="Logo" className="w-full h-full object-cover"
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
            ) : null}
            <div className={`w-full h-full flex items-center justify-center ${logoPath ? 'hidden' : 'flex'}`}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">{schoolName || 'SchoolFees Manager'}</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={16} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">Staff Login</h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit, playErrorSound)} className="space-y-4">
            <Field label="Username" required error={errors.username?.message}>
              <input
                className="form-input"
                placeholder="Enter your username"
                autoComplete="username"
                autoFocus
                {...register('username', { required: 'Username is required' })}
              />
            </Field>

            <Field label="Password" required error={errors.password?.message}>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPwd(s => !s)}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              className="btn-primary btn w-full justify-center py-3 text-base mt-2"
              disabled={loading}
            >
              {loading
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in…</span>
                : <><LogIn size={16} /> Sign In</>}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-5">
            Forgot your password?{' '}
            <button type="button" className="text-blue-600 hover:underline font-medium"
              onClick={() => setForgot(true)}>
              Reset it here
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4 flex items-center justify-center gap-1.5">
          <span>Powered by</span>
          <span className="flex items-center gap-1 font-semibold text-slate-400">
            <WebAutomateMark size={11} />
            webAutomate Nigeria
          </span>
        </p>
      </div>

      {forgot && <ForgotPasswordModal onClose={() => setForgot(false)} />}
    </div>
  )
}

// ── Forgot password (offline reset via support code) ─────────────────────────
function ForgotPasswordModal({ onClose }) {
  const [step, setStep]       = useState(1)   // 1 = request, 2 = enter code + new pwd
  const [username, setUsername] = useState('')
  const [machineId, setMachineId] = useState('')
  const [code, setCode]       = useState('')
  const [newPwd, setNewPwd]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [copied, setCopied]   = useState(false)

  const requestReset = async () => {
    if (!username.trim()) return toast.error('Enter your username')
    setBusy(true)
    try {
      const r = await window.api.resetRequest({ username: username.trim() })
      if (!r.ok) { toast.error(r.error); return }
      setMachineId(r.machine_id)
      setStep(2)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const applyReset = async () => {
    if (!code.trim() || !newPwd) return toast.error('Enter the reset code and a new password')
    setBusy(true)
    try {
      const r = await window.api.resetApply({ username: username.trim(), code: code.trim(), new_password: newPwd })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Password reset! You can now sign in with your new password.')
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const copyId = async () => {
    try { await navigator.clipboard.writeText(machineId); setCopied(true); setTimeout(() => setCopied(false), 2500) }
    catch { toast.error('Copy failed — select manually') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button className="absolute right-4 top-4 text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-800">Reset Password</h3>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter your username. We'll show you a code to send to your administrator/support,
              who will give you a one-time reset code.
            </p>
            <Field label="Username" required>
              <input className="form-input" placeholder="Your username" value={username}
                autoFocus onChange={e => setUsername(e.target.value)} />
            </Field>
            <button className="btn-primary btn w-full justify-center py-2.5" onClick={requestReset} disabled={busy}>
              {busy ? 'Please wait…' : 'Continue'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-600 mb-1.5">Send these to your support contact:</div>
              <div className="text-[11px] text-gray-500 mb-1">Username: <b className="text-gray-700">{username}</b></div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] font-mono text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5 break-all select-all">{machineId}</code>
                <button className="btn btn-sm btn-secondary flex-shrink-0" onClick={copyId} title="Copy Machine ID">
                  {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <Field label="Reset Code (from support)" required>
              <input className="form-input font-mono tracking-widest text-center uppercase" placeholder="XXXXXXXXXXXX"
                maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="New Password" required>
              <input type="password" className="form-input" placeholder="Choose a new password"
                value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </Field>
            <button className="btn-primary btn w-full justify-center py-2.5" onClick={applyReset} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
