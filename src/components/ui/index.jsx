import { useEffect, useRef, useState } from 'react'
import PrintPreviewModal from './PrintPreviewModal'
import { X, Search, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react'

// ─── Modal ──────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal w-full ${widths[size]}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
export function Confirm({ open, onClose, onConfirm, title, message, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirm'}
      footer={
        <>
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn-danger btn' : 'btn-primary btn'} onClick={() => { onConfirm(); onClose() }}>
            Confirm
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />}
        <p className="text-gray-700 text-sm">{message}</p>
      </div>
    </Modal>
  )
}

// ─── Search Input ────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
      />
    </div>
  )
}

// ─── Sortable DataTable ───────────────────────────────────────────────────────
export function DataTable({ columns, data, emptyMessage = 'No records found', onRowClick }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0
    const av = a[sortCol] ?? ''
    const bv = b[sortCol] ?? ''
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key || col.label} style={col.width ? { width: col.width } : {}}>
                {col.sortable !== false ? (
                  <button className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                    onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sortCol === col.key
                      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      : <span className="w-3" />}
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="py-12 text-center text-gray-400 text-sm">{emptyMessage}</td></tr>
          ) : sorted.map((row, i) => (
            <tr key={row.id ?? i} onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer' : ''}>
              {columns.map(col => (
                <td key={col.key || col.label}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Form Field wrapper ───────────────────────────────────────────────────────
export function Field({ label, error, required, children, hint }) {
  return (
    <div>
      <label className="form-label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    active: 'badge-green',
    inactive: 'badge-yellow',
    graduated: 'badge-blue',
    pending: 'badge-yellow',
    paid: 'badge-green',
    unpaid: 'badge-red',
  }
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>
}

// ─── Page Header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Export to Excel helper ───────────────────────────────────────────────────
export async function exportToExcel(data, filename = 'export') {
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`)
  } catch (e) {
    console.error('[exportToExcel]', e)
    throw e  // re-throw so callers can catch and reset their loading state
  }
}

export { PrintPreviewModal }
