import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Upload, User, ArrowLeft, Save, AlertCircle } from 'lucide-react'
import { Field, Spinner, PageHeader } from '../../components/ui'

export default function StudentForm() {
  const { id } = useParams()
  const isEdit  = !!id
  const navigate = useNavigate()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [photoPath, setPhotoPath]   = useState('')
  const [classes, setClasses]       = useState([])
  const [currentTerm, setCurrentTerm] = useState(null)

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm({
    defaultValues: { gender: 'M', entry_type: 'new', boarding_type: 'day' }
  })

  useEffect(() => {
    async function load() {
      const [cls, term] = await Promise.all([
        window.api.listClasses(),
        window.api.getCurrentTerm(),
      ])
      setClasses(cls.filter(c => c.is_active))
      setCurrentTerm(term)

      if (isEdit) {
        const student = await window.api.getStudent(Number(id))
        if (!student) { toast.error('Student not found'); navigate('/students'); return }
        setPhotoPath(student.photo_path || '')
        reset(student)
      } else {
        const regNo = await window.api.nextRegNumber()
        reset(prev => ({ ...prev, reg_number: regNo }))
      }
      setLoading(false)
    }
    load()
  }, [id])

  const pickPhoto = async () => {
    const path = await window.api.pickPhoto()
    if (path) setPhotoPath(path)
  }

  const onSubmit = async (data) => {
    if (!isEdit && !currentTerm) {
      toast.warning('No active term set. Student will be registered without class assignment.')
    }
    setSaving(true)
    try {
      const payload = {
        ...data,
        photo_path: photoPath,
        // Pass current term info so student_status row is created
        ...(currentTerm && !isEdit ? {
          session_id: currentTerm.session_id,
          term_id: currentTerm.id,
        } : {})
      }

      if (isEdit) {
        await window.api.updateStudent({ id: Number(id), ...payload })
        toast.success('Student record updated')
      } else {
        const result = await window.api.createStudent(payload)
        toast.success(`Student registered — ${data.reg_number}`)
      }
      navigate('/students')
    } catch (e) {
      toast.error(e.message?.includes('UNIQUE') ? 'Registration number already exists' : 'Failed to save student')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  const firstName = watch('first_name') || ''
  const lastName  = watch('last_name')  || ''
  const initials  = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit Student' : 'Register New Student'}
        subtitle={isEdit ? 'Update student profile details' : 'Add a new student to the school records'}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn" onClick={() => navigate('/students')}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="btn-primary btn" onClick={handleSubmit(onSubmit)} disabled={saving}>
              <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Student'}
            </button>
          </div>
        }
      />

      {!currentTerm && !isEdit && (
        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2.5 text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
          No active term is set. The student will be registered but cannot be assigned to a class until you set an active term.
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>

        {/* Photo & reg number row */}
        <div className="card flex items-start gap-6">
          {/* Photo */}
          <div className="flex-shrink-0">
            <div
              onClick={pickPhoto}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition overflow-hidden bg-gray-50"
            >
              {photoPath ? (
                <img src={`file://${photoPath}`} alt="Photo" className="w-full h-full object-cover" />
              ) : initials ? (
                <span className="text-2xl font-semibold text-gray-400">{initials}</span>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <User size={20} />
                  <span className="text-xs">Photo</span>
                </div>
              )}
            </div>
            <button type="button" onClick={pickPhoto}
              className="mt-2 text-xs text-blue-600 hover:underline w-full text-center flex items-center justify-center gap-1">
              <Upload size={11} /> Upload photo
            </button>
          </div>

          {/* Reg number */}
          <div className="flex-1 space-y-4">
            <Field label="Registration Number" required error={errors.reg_number?.message}
              hint="Auto-generated. You can change it if needed.">
              <input className="form-input font-mono"
                {...register('reg_number', { required: 'Reg number is required' })} />
            </Field>
            <Field label="Entry Type" required>
              <select className="form-select" {...register('entry_type')}>
                <option value="new">New Student</option>
                <option value="returning">Returning Student</option>
              </select>
            </Field>
          </div>
        </div>

        {/* Personal details */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Personal Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Last Name" required error={errors.last_name?.message}>
              <input className="form-input"
                placeholder="Okafor"
                {...register('last_name', { required: 'Last name is required' })} />
            </Field>
            <Field label="First Name" required error={errors.first_name?.message}>
              <input className="form-input"
                placeholder="Amaka"
                {...register('first_name', { required: 'First name is required' })} />
            </Field>
            <Field label="Other Names">
              <input className="form-input" placeholder="Chidinma" {...register('other_names')} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Field label="Gender" required error={errors.gender?.message}>
              <select className="form-select"
                {...register('gender', { required: 'Gender is required' })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </Field>
            <Field label="Date of Birth">
              <input type="date" className="form-input" {...register('date_of_birth')} />
            </Field>
            <Field label="Student Phone">
              <input className="form-input" placeholder="08012345678" {...register('phone')} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Home Address">
              <textarea className="form-input resize-none" rows={2}
                placeholder="House No., Street, City"
                {...register('address')} />
            </Field>
          </div>
        </div>

        {/* Parent / Guardian */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Parent / Guardian</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Parent / Guardian Name">
              <input className="form-input" placeholder="Mr. Emeka Okafor"
                {...register('parent_name')} />
            </Field>
            <Field label="Parent Phone" required error={errors.parent_phone?.message}>
              <input className="form-input" placeholder="08098765432"
                {...register('parent_phone', { required: 'Parent phone is required' })} />
            </Field>
          </div>
        </div>

        {/* School assignment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">School Assignment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Class" required error={errors.class_id?.message}
              hint={!currentTerm ? 'Set an active term first' : ''}>
              <select className="form-select"
                disabled={!currentTerm}
                {...register('class_id', { required: !!currentTerm && 'Class is required' })}>
                <option value="">— Select class —</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Boarding Type" required>
              <select className="form-select" {...register('boarding_type')}>
                <option value="day">Day Student</option>
                <option value="boarding">Boarding Student</option>
              </select>
            </Field>

            <Field label="Entry Type">
              <select className="form-select" {...register('entry_type')}>
                <option value="new">New (first time in school)</option>
                <option value="returning">Returning</option>
              </select>
            </Field>
          </div>

          {currentTerm && (
            <div className="mt-3 text-xs text-gray-400">
              Student will be assigned to: <strong className="text-gray-600">{currentTerm.session_name} · {currentTerm.name}</strong>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 pb-4">
          <button type="button" className="btn-secondary btn" onClick={() => navigate('/students')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn" disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Student'}
          </button>
        </div>
      </form>
    </div>
  )
}
