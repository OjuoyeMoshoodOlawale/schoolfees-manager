import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Receipt, Search, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { PageHeader, Field, Spinner } from '../../components/ui'

const fmt = n => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

export default function PostPaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preloadStudentId = searchParams.get('student')

  const [currentTerm, setCurrentTerm]   = useState(null)
  const [students, setStudents]         = useState([])
  const [search, setSearch]             = useState('')
  const [selectedStudent, setSelected] = useState(null)
  const [billSummary, setBillSummary]   = useState(null)
  const [receiptNo, setReceiptNo]       = useState('')
  const [saving, setSaving]             = useState(false)
  const [success, setSuccess]           = useState(null)
  const [loadingBill, setLoadingBill]   = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { payment_method: 'cash', payment_date: new Date().toISOString().slice(0, 10), amount_paid: '' }
  })

  useEffect(() => {
    async function init() {
      const [term, rno] = await Promise.all([
        window.api.getCurrentTerm(),
        window.api.nextReceiptNumber(),
      ])
      setCurrentTerm(term)
      setReceiptNo(rno)
      const studs = await window.api.listStudents({ status: 'active' })
      setStudents(studs)
      // Preload student if coming from bill page
      if (preloadStudentId) {
        const s = studs.find(x => x.id === Number(preloadStudentId))
        if (s) selectStudent(s)
      }
    }
    init()
  }, [])

  const selectStudent = async (student) => {
    setSelected(student)
    setLoadingBill(true)
    const summary = await window.api.getStudentBillSummary({ student_id: student.id })
    setBillSummary(summary)
    // Pre-fill amount with outstanding balance
    if (summary?.balance > 0) setValue('amount_paid', summary.balance.toFixed(2))
    setLoadingBill(false)
  }

  const filtered = search.length >= 2
    ? students.filter(s =>
        `${s.first_name} ${s.last_name} ${s.reg_number}`.toLowerCase().includes(search.toLowerCase())
      )
    : []

  const onSubmit = async (data) => {
    if (!selectedStudent) { toast.error('Select a student first'); return }
    if (!currentTerm) { toast.error('No current term set'); return }
    setSaving(true)
    try {
      const result = await window.api.postPayment({
        student_id: selectedStudent.id,
        amount_paid: Number(data.amount_paid),
        payment_date: data.payment_date,
        payment_method: data.payment_method,
        reference: data.reference || '',
        receipt_number: receiptNo,
      })
      setSuccess({ ...result, student: selectedStudent, amount: Number(data.amount_paid), method: data.payment_method })
      toast.success(`Payment posted — Receipt ${result.receipt_number}`)
    } catch (e) {
      toast.error(e.message || 'Failed to post payment')
    } finally { setSaving(false) }
  }

  const handleNewPayment = async () => {
    setSuccess(null)
    setSelected(null)
    setBillSummary(null)
    setSearch('')
    reset({ payment_method: 'cash', payment_date: new Date().toISOString().slice(0, 10), amount_paid: '' })
    const rno = await window.api.nextReceiptNumber()
    setReceiptNo(rno)
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-10">
        <div className="card text-center p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Payment Posted</h2>
          <p className="text-gray-500 text-sm mb-6">Receipt has been recorded successfully</p>
          <div className="bg-gray-50 rounded-xl p-5 text-left space-y-2 mb-6">
            {[
              ['Receipt No.',  success.receipt_number],
              ['Student',      `${success.student.last_name} ${success.student.first_name}`],
              ['Reg No.',      success.student.reg_number],
              ['Amount Paid',  fmt(success.amount)],
              ['Method',       success.method.toUpperCase()],
              ['Term',         currentTerm ? `${currentTerm.session_name} · ${currentTerm.name}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-900">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary btn flex-1" onClick={() => navigate(`/payments/receipt/${success.id}`)}>
              <Receipt size={14} /> View Receipt
            </button>
            <button className="btn-primary btn flex-1" onClick={handleNewPayment}>
              Post Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Post Payment"
        subtitle={currentTerm ? `Posting for: ${currentTerm.session_name} · ${currentTerm.name}` : 'No active term set'}
        actions={
          <button className="btn-secondary btn" onClick={() => navigate('/payments')}>
            <ArrowLeft size={14} /> Payment History
          </button>
        }
      />

      {!currentTerm && (
        <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          No active term is set. Payments can only be posted to the current term.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {/* Student search */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">1. Select Student</h2>
          {selectedStudent ? (
            <div className="flex items-center gap-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-blue-800 flex-shrink-0">
                {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{selectedStudent.last_name} {selectedStudent.first_name}</p>
                <p className="text-xs text-gray-500 font-mono">{selectedStudent.reg_number} · {selectedStudent.class_name || '—'}</p>
              </div>
              {loadingBill
                ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                : billSummary && (
                  <div className="text-right text-xs">
                    <p className="text-gray-500">Balance due</p>
                    <p className={`font-bold text-base ${billSummary.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmt(billSummary.balance)}
                    </p>
                  </div>
                )}
              <button className="text-xs text-blue-600 hover:underline" onClick={() => { setSelected(null); setBillSummary(null); setSearch('') }}>
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="form-input pl-9"
                  placeholder="Type student name or reg number (min 2 chars)…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {search.length >= 2 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-64 overflow-y-auto mt-1">
                  {filtered.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-4">No students found</p>
                    : filtered.slice(0, 10).map(s => (
                      <button key={s.id}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-100 last:border-0"
                        onClick={() => { selectStudent(s); setSearch('') }}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
                          {s.first_name?.[0]}{s.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.last_name} {s.first_name}</p>
                          <p className="text-xs text-gray-400">{s.reg_number} · {s.class_name || 'No class'}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bill summary */}
        {billSummary && !loadingBill && (
          <div className="card bg-gray-50 border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Bill Summary (Current Term)</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ['Total Billed', fmt(billSummary.total_expected), 'text-gray-900'],
                ['Already Paid', fmt(billSummary.total_paid), 'text-emerald-600'],
                ['Balance Due',  fmt(billSummary.balance), billSummary.balance > 0 ? 'text-red-600' : 'text-emerald-600'],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{l}</p>
                  <p className={`font-bold text-lg mt-0.5 ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment form */}
        {selectedStudent && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">2. Payment Details</h2>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">Receipt Number</span>
                <span className="font-mono font-semibold text-gray-900 text-sm">{receiptNo}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount Paid (₦)" required error={errors.amount_paid?.message}>
                  <input type="number" min="1" step="0.01" className="form-input text-lg font-bold"
                    {...register('amount_paid', {
                      required: 'Enter amount',
                      min: { value: 1, message: 'Must be at least ₦1' },
                      valueAsNumber: true
                    })} />
                </Field>
                <Field label="Payment Date" required>
                  <input type="date" className="form-input"
                    {...register('payment_date', { required: true })} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Payment Method" required>
                  <select className="form-select" {...register('payment_method')}>
                    <option value="cash">Cash</option>
                    <option value="transfer">Bank Transfer</option>
                    <option value="pos">POS</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </Field>
                <Field label="Reference / Teller No." hint="Bank teller, transfer ref, cheque no.">
                  <input className="form-input" placeholder="Optional"
                    {...register('reference')} />
                </Field>
              </div>

              <button type="submit" className="btn-primary btn w-full justify-center py-3 text-base"
                disabled={saving || !currentTerm}>
                <Receipt size={16} />
                {saving ? 'Posting…' : `Post Payment — ${fmt(watch('amount_paid') || 0)}`}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
