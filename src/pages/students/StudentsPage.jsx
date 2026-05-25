import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  UserPlus, Pencil, Trash2, Eye, Download, Users,
  UserCheck, UserX, MoreHorizontal, RefreshCw
} from 'lucide-react'
import { PageHeader, DataTable, SearchInput, Confirm, Spinner, exportToExcel } from '../../components/ui'

const STATUS_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'active',     label: 'Active' },
  { value: 'inactive',   label: 'Inactive' },
  { value: 'graduated',  label: 'Graduated' },
]

function StatusBadge({ status }) {
  if (!status) return <span className="badge-gray badge">Unassigned</span>
  const map = {
    active:    'badge-green',
    inactive:  'badge-yellow',
    graduated: 'badge-blue',
  }
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>
}

// Student detail drawer (slide-in panel)
function StudentDrawer({ student, onClose, onEdit, onStatusChange }) {
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (student) {
      window.api.getStudentStatus(student.id).then(setHistory)
    }
  }, [student?.id])

  if (!student) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl z-50">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Student Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {student.photo_path ? (
                <img src={`file://${student.photo_path}`} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-semibold text-blue-600">
                  {student.first_name?.[0]}{student.last_name?.[0]}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">
                {student.last_name} {student.first_name} {student.other_names}
              </p>
              <p className="text-sm text-gray-500 font-mono">{student.reg_number}</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={student.status} />
                {student.class_name && <span className="badge-blue badge">{student.class_name}</span>}
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['Gender',        student.gender === 'M' ? 'Male' : 'Female'],
              ['Date of Birth', student.date_of_birth || '—'],
              ['Entry Type',    student.entry_type],
              ['Boarding',      student.boarding_type || '—'],
              ['Parent',        student.parent_name || '—'],
              ['Parent Phone',  student.parent_phone || '—'],
              ['Phone',         student.phone || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <span className="text-gray-400 text-xs uppercase tracking-wide">{k}</span>
                <p className="text-gray-800 font-medium mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {student.address && (
            <div className="text-sm">
              <span className="text-gray-400 text-xs uppercase tracking-wide">Address</span>
              <p className="text-gray-800 mt-0.5">{student.address}</p>
            </div>
          )}

          {/* Status history */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status History</h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No status records</p>
            ) : (
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs bg-gray-50 px-3 py-2 rounded-lg">
                    <span className="text-gray-500">{h.session_name}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{h.term_name}</span>
                    <span className="text-gray-400">·</span>
                    <span className="font-medium text-gray-700">{h.class_name}</span>
                    <span className={`ml-auto badge ${h.status === 'active' ? 'badge-green' : h.status === 'graduated' ? 'badge-blue' : 'badge-yellow'}`}>{h.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
            <button className="btn-primary btn w-full justify-center" onClick={() => onEdit(student)}>
              <Pencil size={14} /> Edit Profile
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                className="btn btn-sm border border-emerald-200 text-emerald-700 hover:bg-emerald-50 justify-center"
                onClick={() => onStatusChange(student, 'active')}>
                <UserCheck size={13} /> Active
              </button>
              <button
                className="btn btn-sm border border-amber-200 text-amber-700 hover:bg-amber-50 justify-center"
                onClick={() => onStatusChange(student, 'inactive')}>
                <UserX size={13} /> Inactive
              </button>
              <button
                className="btn btn-sm border border-blue-200 text-blue-700 hover:bg-blue-50 justify-center"
                onClick={() => onStatusChange(student, 'graduated')}>
                <Users size={13} /> Graduate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StudentsPage() {
  const navigate = useNavigate()
  const [students, setStudents]         = useState([])
  const [classes, setClasses]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterClass, setFilterClass]   = useState('')
  const [filterStatus, setFilterStatus] = useState('active')
  const [selected, setSelected]         = useState(null)  // drawer
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    const [studs, cls] = await Promise.all([
      window.api.listStudents({ search, class_id: filterClass || undefined, status: filterStatus || undefined }),
      window.api.listClasses(),
    ])
    setStudents(studs)
    setClasses(cls)
    setLoading(false)
  }, [search, filterClass, filterStatus])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (student, newStatus) => {
    try {
      await window.api.updateStudentStatus({ student_id: student.id, status: newStatus })
      toast.success(`${student.first_name} marked as ${newStatus}`)
      setSelected(null)
      load()
    } catch (e) {
      toast.error(e.message || 'No active term set — cannot update status')
    }
  }

  const handleDelete = async () => {
    try {
      await window.api.deleteStudent(deleteTarget.id)
      toast.success('Student deleted')
      load()
    } catch { toast.error('Cannot delete — student may have payment records') }
  }

  const handleExport = async () => {
    const rows = students.map(s => ({
      'Reg Number':   s.reg_number,
      'Last Name':    s.last_name,
      'First Name':   s.first_name,
      'Gender':       s.gender === 'M' ? 'Male' : 'Female',
      'Class':        s.class_name || '',
      'Status':       s.status || '',
      'Entry Type':   s.entry_type,
      'Boarding':     s.boarding_type || '',
      'Parent':       s.parent_name,
      'Parent Phone': s.parent_phone,
      'Parent Email': s.parent_email || '',
    }))
    await exportToExcel(rows, 'students')
    toast.success('Exported to Excel')
  }

  const columns = [
    {
      key: 'reg_number', label: 'Reg No.', width: '130px',
      render: v => <span className="font-mono text-xs text-gray-500">{v}</span>
    },
    {
      key: 'last_name', label: 'Name',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {row.photo_path ? (
              <img src={`file://${row.photo_path}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-blue-600">
                {row.first_name?.[0]}{row.last_name?.[0]}
              </span>
            )}
          </div>
          <div>
            <p className="font-medium text-gray-900">{row.last_name} {row.first_name}</p>
            {row.other_names && <p className="text-xs text-gray-400">{row.other_names}</p>}
          </div>
        </div>
      )
    },
    {
      key: 'gender', label: 'Gender', width: '70px',
      render: v => <span className="text-gray-500 text-sm">{v === 'M' ? 'Male' : 'Female'}</span>
    },
    {
      key: 'class_name', label: 'Class', width: '90px',
      render: v => v ? <span className="badge-blue badge">{v}</span> : <span className="text-gray-300 text-xs">—</span>
    },
    {
      key: 'boarding_type', label: 'Type', width: '90px',
      render: (v, row) => (
        <div className="text-xs text-gray-500 space-y-0.5">
          <div className="capitalize">{v || 'day'}</div>
          <div className="text-gray-400">{row.entry_type}</div>
        </div>
      )
    },
    {
      key: 'status', label: 'Status', width: '100px',
      render: v => <StatusBadge status={v} />
    },
    {
      key: 'actions', label: '', width: '90px', sortable: false,
      render: (_, row) => (
        <div className="flex gap-1 justify-end">
          <button title="View" className="btn btn-sm text-gray-500 hover:bg-gray-100"
            onClick={e => { e.stopPropagation(); setSelected(row) }}>
            <Eye size={13} />
          </button>
          <button title="Edit" className="btn btn-sm text-blue-600 hover:bg-blue-50 border border-blue-200"
            onClick={e => { e.stopPropagation(); navigate(`/students/${row.id}/edit`) }}>
            <Pencil size={13} />
          </button>
          <button title="Delete" className="btn btn-sm text-red-500 hover:bg-red-50 border border-red-200"
            onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}>
            <Trash2 size={13} />
          </button>
        </div>
      )
    },
  ]

  // Summary counts
  const counts = {
    total:     students.length,
    active:    students.filter(s => s.status === 'active').length,
    inactive:  students.filter(s => s.status === 'inactive').length,
    graduated: students.filter(s => s.status === 'graduated').length,
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`${counts.total} students · ${counts.active} active this term`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={handleExport}>
              <Download size={14} /> Export Excel
            </button>
            <button className="btn-secondary btn btn-sm" onClick={() => navigate('/promote')}>
              <RefreshCw size={14} /> Promote
            </button>
            <button className="btn-primary btn" onClick={() => navigate('/students/new')}>
              <UserPlus size={15} /> Register Student
            </button>
          </div>
        }
      />

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'All', val: '',           count: counts.total },
          { label: 'Active',    val: 'active',    count: counts.active },
          { label: 'Inactive',  val: 'inactive',  count: counts.inactive },
          { label: 'Graduated', val: 'graduated', count: counts.graduated },
        ].map(pill => (
          <button
            key={pill.val}
            onClick={() => setFilterStatus(pill.val)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${filterStatus === pill.val ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}
          >
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs
              ${filterStatus === pill.val ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {pill.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name or reg number…"
          className="w-64"
        />
        <select
          className="form-select w-44"
          value={filterClass}
          onChange={e => setFilterClass(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? <Spinner /> : (
          <DataTable
            columns={columns}
            data={students}
            emptyMessage={`No students found${filterStatus ? ` with status: ${filterStatus}` : ''}`}
            onRowClick={row => setSelected(row)}
          />
        )}
      </div>

      {/* Student detail drawer */}
      {selected && (
        <StudentDrawer
          student={selected}
          onClose={() => setSelected(null)}
          onEdit={s => navigate(`/students/${s.id}/edit`)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Delete confirm */}
      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Delete Student"
        message={`Permanently delete ${deleteTarget?.first_name} ${deleteTarget?.last_name} (${deleteTarget?.reg_number})? All associated records will also be deleted.`}
      />
    </div>
  )
}
