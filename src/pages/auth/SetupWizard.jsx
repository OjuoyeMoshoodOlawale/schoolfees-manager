import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import {
  Building2, UserPlus, Upload, CheckCircle2,
  ArrowRight, ArrowLeft, GraduationCap, LogIn
} from 'lucide-react'
import { Field } from '../../components/ui'
import { playErrorSound } from '../../lib/sounds'

const STEPS = [
  { id: 'school',  label: 'School Info',    icon: Building2  },
  { id: 'admin',   label: 'Admin Account',  icon: UserPlus   },
  { id: 'done',    label: 'All Set',        icon: CheckCircle2 },
]

export default function SetupWizard({ activation, onComplete }) {
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [logoPath, setLogoPath] = useState('')
  const [schoolData, setSchoolData] = useState(null)

  const schoolForm = useForm({
    defaultValues: { school_name: activation?.school_name || '', address: '', phone: '', email: '' }
  })
  const adminForm = useForm({
    defaultValues: { full_name: '', username: '', password: '', confirm_password: '' }
  })

  // Step 1 — save school info
  const saveSchool = async (data) => {
    setSaving(true)
    try {
      await window.api.saveSettings({ ...data, logo_path: logoPath })
      setSchoolData(data)
      setStep(1)
    } catch { toast.error('Failed to save school info') }
    finally { setSaving(false) }
  }

  // Step 2 — create admin account
  const saveAdmin = async (data) => {
    if (data.password !== data.confirm_password) {
      adminForm.setError('confirm_password', { message: 'Passwords do not match' })
      return
    }
    setSaving(true)
    try {
      await window.api.createUser({
        username: data.username.trim().toLowerCase(),
        full_name: data.full_name.trim(),
        password: data.password,
        role: 'admin',
      })
      // Mark setup complete
      await window.api.setAppState('setup_complete', '1')
      setStep(2)
    } catch (e) {
      toast.error(e.message || 'Failed to create admin account')
    } finally { setSaving(false) }
  }

  const pickLogo = async () => {
    const p = await window.api.pickLogo()
    if (p) {
      setLogoPath(p)
      schoolForm.setValue('logo_path', p)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to SchoolFees Manager</h1>
          <p className="text-slate-400 text-sm mt-1">Let's set up your school in 2 quick steps</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? 'text-white' : 'text-slate-500'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* ── Step 0: School Info ── */}
          {step === 0 && (
            <form onSubmit={schoolForm.handleSubmit(saveSchool, playErrorSound)}>
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={16} className="text-blue-600" />
                  <h2 className="font-semibold text-gray-900">School Information</h2>
                </div>
                <p className="text-xs text-gray-400">This appears on all receipts and reports</p>
              </div>
              <div className="p-6 space-y-4">
                {/* Logo picker */}
                <div className="flex items-center gap-4">
                  <div
                    onClick={pickLogo}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition overflow-hidden bg-gray-50 flex-shrink-0"
                  >
                    {logoPath ? (
                      <img src={`localfile://${logoPath}`} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Upload size={16} className="text-gray-300 mx-auto" />
                        <p className="text-xs text-gray-400 mt-1">Logo</p>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    <p className="font-medium text-gray-700">School Logo</p>
                    <p className="text-xs mt-0.5">PNG, JPG · Recommended 200×200px</p>
                    <button type="button" className="text-blue-600 text-xs hover:underline mt-1" onClick={pickLogo}>
                      {logoPath ? 'Change logo' : 'Upload logo'}
                    </button>
                  </div>
                </div>

                <Field label="School Name" required error={schoolForm.formState.errors.school_name?.message}>
                  <input className="form-input" placeholder="e.g. Bright Future Academy"
                    {...schoolForm.register('school_name', { required: 'School name is required' })} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone" required error={schoolForm.formState.errors.phone?.message}>
                    <input className="form-input" placeholder="08012345678"
                      {...schoolForm.register('phone', { required: 'Phone is required' })} />
                  </Field>
                  <Field label="Email">
                    <input className="form-input" type="email" placeholder="info@school.edu.ng"
                      {...schoolForm.register('email')} />
                  </Field>
                </div>

                <Field label="Address">
                  <textarea className="form-input resize-none" rows={2}
                    placeholder="School address"
                    {...schoolForm.register('address')} />
                </Field>
              </div>
              <div className="px-6 pb-6">
                <button type="submit" className="btn-primary btn w-full justify-center py-3" disabled={saving}>
                  {saving ? 'Saving…' : <><span>Continue</span> <ArrowRight size={15} /></>}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 1: Admin Account ── */}
          {step === 1 && (
            <form onSubmit={adminForm.handleSubmit(saveAdmin, playErrorSound)}>
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <UserPlus size={16} className="text-blue-600" />
                  <h2 className="font-semibold text-gray-900">Create Admin Account</h2>
                </div>
                <p className="text-xs text-gray-400">This will be the main administrator login</p>
              </div>
              <div className="p-6 space-y-4">
                <Field label="Full Name" required error={adminForm.formState.errors.full_name?.message}>
                  <input className="form-input" placeholder="e.g. Mrs. Adebayo Funke"
                    {...adminForm.register('full_name', { required: 'Full name is required' })} />
                </Field>
                <Field label="Username" required error={adminForm.formState.errors.username?.message}
                  hint="Lowercase, no spaces — used to log in">
                  <input className="form-input" placeholder="e.g. admin or funke.adebayo"
                    {...adminForm.register('username', {
                      required: 'Username is required',
                      minLength: { value: 3, message: 'At least 3 characters' },
                      pattern: { value: /^[a-z0-9._]+$/, message: 'Lowercase letters, numbers, dots and underscores only' }
                    })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Password" required error={adminForm.formState.errors.password?.message}>
                    <input type="password" className="form-input" placeholder="Min 6 characters"
                      {...adminForm.register('password', {
                        required: 'Password is required',
                        minLength: { value: 6, message: 'At least 6 characters' }
                      })} />
                  </Field>
                  <Field label="Confirm Password" required error={adminForm.formState.errors.confirm_password?.message}>
                    <input type="password" className="form-input" placeholder="Repeat password"
                      {...adminForm.register('confirm_password', { required: 'Confirm your password' })} />
                  </Field>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  Keep this password safe. You can create more users after logging in from the Users & Access page.
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button type="button" className="btn-secondary btn" onClick={() => setStep(0)}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button type="submit" className="btn-primary btn flex-1 justify-center py-3" disabled={saving}>
                  {saving ? 'Creating account…' : 'Create Admin & Finish'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Done ── */}
          {step === 2 && (
            <div className="p-8 text-center">
              <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900">You're all set!</h2>
              <p className="text-gray-500 text-sm mt-2 mb-6">
                {schoolData?.school_name} is ready to use. Sign in with your new admin account to get started.
              </p>
              <div className="space-y-2 text-left bg-gray-50 rounded-xl p-4 mb-6 text-sm">
                <p className="text-gray-500">✅ School configured</p>
                <p className="text-gray-500">✅ Admin account created</p>
                <p className="text-gray-500">✅ Default classes pre-loaded (JSS 1 – SS 3)</p>
                <p className="text-gray-500">✅ Default fee items pre-loaded</p>
                {activation?.tier === 'demo' && (
                  <p className="text-amber-600">⚠️ Demo mode — up to {activation.max_students} students. Activate a full license to unlock.</p>
                )}
              </div>
              <button className="btn-primary btn w-full justify-center py-3" onClick={onComplete}>
                <LogIn size={16} /> Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
