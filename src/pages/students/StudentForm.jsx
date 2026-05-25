import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Upload, User, ArrowLeft, Save, AlertCircle } from 'lucide-react'
import { Field, Spinner, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function StudentForm() {
  const { id } = useParams()
  const isEdit  = !!id
  const navigate = useNavigate()
  const { activation } = useAuth()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [photoPath, setPhotoPath]   = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [classes, setClasses]       = useState([])
  const [currentTerm, setCurrentTerm] = useState(null)
  const [studentCount, setStudentCount] = useState(0)

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm({
    defaultValues: { gender: 'M', entry_type: 'new', boarding_type: 'day' }
  })

  useEffect(() => {
    async function load() {
      const [cls, term, count] = await Promise.all([
        window.api.listClasses(),
        window.api.getCurrentTerm(),
        window.api.getStudentCount(),
      ])
      setClasses(cls.filter(c => c.is_active))
      setCurrentTerm(term)
      setStudentCount(count)

      if (isEdit) {
        const student = await window.api.getStudent(Number(id))
        if (!student) { toast.error('Student not found'); navigate('/students'); return }
        setPhotoPath(student.photo_path || '')
        if (student.photo_path) setPhotoPreview(`file://${student.photo_path}`)
        // Load class from student_status for current term
        let classId = ''
        if (term) {
          const statuses = await window.api.getStudentStatus(Number(id))
          const currentStatus = statuses?.find(s => s.term_id === term.id)
          if (currentStatus) classId = String(currentStatus.class_id)
        }
        reset({ ...student, class_id: classId })
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
    if (path) {
      setPhotoPath(path)
      setPhotoPreview(`file://${path}`)
    }
  }

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      const payload = {
        ...data,
        photo_path: photoPath,
        ...(currentTerm && !isEdit ? {
          session_id: currentTerm.session_id,
          term_id: currentTerm.id,
        } : {})
      }
      if (isEdit) {
        await window.api.updateStudent({ id: Number(id), ...payload })
        toast.success('Student record updated')
      } else {
        await window.api.createStudent(payload)
        toast.success(`Student registered — ${data.reg_number}`)
      }
      navigate('/students')
    } catch (e) {
      if (e.message?.includes('limit')) {
        toast.error(e.message, { autoClose: 6000 })
      } else if (e.message?.includes('UNIQUE')) {
        toast.error('Registration number already exists')
      } else {
        toast.error(e.message || 'Failed to save student')
      }
    } finally { setSaving(false) }
  }

  if (loading) return <Spinner />

  const maxStudents = activation?.max_students || 5
  const atLimit = !isEdit && studentCount >= maxStudents
  const firstName = watch('first_name') || ''
  const lastName  = watch('last_name')  || ''
  const initials  = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit Student' : 'Register New Student'}
        subtitle={isEdit ? 'Update student profile' : 'Add a new student to the school records'}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn" onClick={() => navigate('/students')}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="btn-primary btn" onClick={handleSubmit(onSubmit)}
              disabled={saving || atLimit}>
              <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Student'}
            </button>
          </div>
        }
      />

      {/* Demo limit warning */}
      {!isEdit && activation?.tier === 'demo' && (
        <div className={`mb-5 p-3 rounded-lg border flex gap-2.5 text-sm
          ${atLimit
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            {atLimit
              ? <><strong>Student limit reached ({maxStudents}/{maxStudents}).</strong> Activate a full license to add more students.</>
              : <><strong>Demo mode:</strong> {studentCount}/{maxStudents} students used. Activate a full license for unlimited students.</>}
          </div>
        </div>
      )}

      {!currentTerm && !isEdit && (
        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2.5 text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
          No active term set. Student will be registered without class assignment.
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>

        {/* Photo + reg number */}
        <div className="card flex items-start gap-6">
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div
              onClick={pickPhoto}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition overflow-hidden bg-gray-50"
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Student photo"
                  className="w-full h-full object-cover"
                  onError={() => setPhotoPreview('')}
                />
              ) : initials ? (
                <span className="text-2xl font-bold text-gray-400">{initials}</span>
              ) : (
                <div className="text-center">
                  <User size={20} className="text-gray-300 mx-auto" />
                  <span className="text-xs text-gray-400 mt-1 block">Photo</span>
                </div>
              )}
            </div>
            <button type="button" onClick={pickPhoto}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Upload size={11} /> {photoPreview ? 'Change' : 'Upload'}
            </button>
          </div>

          <div className="flex-1 space-y-4">
            <Field label="Registration Number" required error={errors.reg_number?.message}
              hint="Auto-generated. You can change it.">
              <input className="form-input font-mono"
                {...register('reg_number', { required: 'Reg number is required' })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Entry Type" required>
                <select className="form-select" {...register('entry_type')}>
                  <option value="new">New Student</option>
                  <option value="returning">Returning Student</option>
                </select>
              </Field>
              <Field label="Boarding Type" required>
                <select className="form-select" {...register('boarding_type')}>
                  <option value="day">Day Student</option>
                  <option value="boarding">Boarding Student</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        {/* Personal details */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Personal Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Last Name" required error={errors.last_name?.message}>
              <input className="form-input" placeholder="Okafor"
                {...register('last_name', { required: 'Last name is required' })} />
            </Field>
            <Field label="First Name" required error={errors.first_name?.message}>
              <input className="form-input" placeholder="Amaka"
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
                placeholder="House No., Street, City" {...register('address')} />
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
            <Field label="Parent Email" hint="Used for email receipts">
              <input type="email" className="form-input" placeholder="parent@email.com"
                {...register('parent_email')} />
            </Field>
          </div>
        </div>

        {/* Class assignment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Class Assignment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Class" required error={errors.class_id?.message}
              hint={!currentTerm ? 'Set an active term first' : `Assigned to ${currentTerm.session_name} · ${currentTerm.name}`}>
              <select className="form-select" disabled={!currentTerm}
                {...register('class_id', { required: !!currentTerm && 'Class is required' })}>
                <option value="">— Select class —</option>
                {classes.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pb-4">
          <button type="button" className="btn-secondary btn" onClick={() => navigate('/students')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn" disabled={saving || atLimit}>
            <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Student'}
          </button>
        </div>
      </form>
    </div>
  )
}
