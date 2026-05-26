import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { GraduationCap, LogIn, Eye, EyeOff, Lock } from 'lucide-react'
import { Field } from '../../components/ui'

export default function LoginScreen({ schoolName, logoPath, onLogin }) {
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            Forgot your password? Contact your administrator.
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          SchoolFees Manager · All rights reserved
        </p>
      </div>
    </div>
  )
}
