import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { GraduationCap, Key, Wifi, WifiOff, CheckCircle2, Loader } from 'lucide-react'
import { Field } from '../../components/ui'

export default function ActivationScreen({ onActivated }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)

  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const result = await window.api.activateLicense({
        license_key: data.license_key.trim().toUpperCase(),
        school_name: data.school_name.trim(),
      })
      if (result.ok) {
        setSuccess(result)
        toast.success('Activation successful!')
        setTimeout(() => onActivated(), 2000)
      } else {
        toast.error(result.error || 'Activation failed')
      }
    } catch (e) {
      toast.error('Unexpected error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SchoolFees Manager</h1>
          <p className="text-slate-400 text-sm mt-1">Enter your activation key to get started</p>
        </div>

        {success ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-2xl">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">Activated!</h2>
            <p className="text-gray-500 text-sm mt-2">
              {success.tier === 'demo'
                ? `Demo mode — up to ${success.max_students} students`
                : success.tier === 'master'
                ? 'Master license — unlimited students'
                : `${success.tier} plan · ${success.max_students} students`}
            </p>
            {success.message && <p className="text-xs text-emerald-600 mt-1">{success.message}</p>}
            <p className="text-xs text-gray-400 mt-3">Setting up your account…</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Key size={18} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">License Activation</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field label="School Name" required error={errors.school_name?.message}>
                <input className="form-input" placeholder="e.g. Bright Future Academy"
                  {...register('school_name', { required: 'School name is required' })} />
              </Field>

              <Field label="Activation Key" required error={errors.license_key?.message}
                hint="Format: XXXX-XXXX-XXXX-XXXX — provided by your sales agent">
                <input
                  className="form-input font-mono tracking-widest text-center text-lg uppercase"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  maxLength={19}
                  {...register('license_key', {
                    required: 'Activation key is required',
                    pattern: { value: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, message: 'Key must be in format XXXX-XXXX-XXXX-XXXX' },
                    setValueAs: v => v.trim().toUpperCase(),
                  })}
                />
              </Field>

              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                <Wifi size={12} className="text-emerald-400 flex-shrink-0" />
                <span>Works <strong className="text-gray-600">offline</strong> — no internet required for activation.</span>
              </div>

              <button type="submit" className="btn-primary btn w-full justify-center py-3 text-base" disabled={loading}>
                {loading
                  ? <><Loader size={16} className="animate-spin" /> Activating…</>
                  : <><Key size={16} /> Activate</>}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-5">
              Need a key? Contact your sales agent or visit{' '}
              <span className="text-blue-600">schoolfeesmanager.com</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
