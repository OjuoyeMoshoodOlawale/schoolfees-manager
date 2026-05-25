// ─── Currency ────────────────────────────────────────────────────────────────
// Always formats as ₦1,234,567.89
export const fmt = (n) => {
  const num = Number(n || 0)
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Short format — no kobo for whole numbers  e.g. ₦1,234,567
export const fmtShort = (n) => {
  const num = Number(n || 0)
  if (num % 1 === 0) return '₦' + num.toLocaleString('en-NG')
  return fmt(num)
}

// Parse a formatted string back to number
export const parseFmt = (s) => Number(String(s).replace(/[₦,]/g, '')) || 0

// ─── Date ─────────────────────────────────────────────────────────────────────
export const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export const fmtDateTime = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

// ─── Excel import column mapping ──────────────────────────────────────────────
export const IMPORT_COLUMNS = [
  { key: 'last_name',     label: 'Last Name',     required: true  },
  { key: 'first_name',    label: 'First Name',    required: true  },
  { key: 'other_names',   label: 'Other Names',   required: false },
  { key: 'gender',        label: 'Gender (M/F)',  required: true  },
  { key: 'date_of_birth', label: 'Date of Birth', required: false },
  { key: 'parent_name',   label: 'Parent Name',   required: false },
  { key: 'parent_phone',  label: 'Parent Phone',  required: true  },
  { key: 'phone',         label: 'Student Phone', required: false },
  { key: 'address',       label: 'Address',       required: false },
  { key: 'boarding_type', label: 'Boarding (day/boarding)', required: false },
  { key: 'entry_type',    label: 'Entry Type (new/returning)', required: false },
]

// Normalise a raw Excel row to a student object
export const normaliseImportRow = (row, index) => {
  const errors = []

  const get = (key) => {
    // Try exact key, then case-insensitive match
    if (row[key] !== undefined) return String(row[key] || '').trim()
    const found = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_]/g,'') === key.toLowerCase().replace(/[\s_]/g,''))
    return found ? String(row[found] || '').trim() : ''
  }

  const last_name   = get('last_name')   || get('lastname')   || get('surname')
  const first_name  = get('first_name')  || get('firstname')  || get('name')
  const gender_raw  = (get('gender') || 'M').toUpperCase().charAt(0)
  const gender      = ['M','F'].includes(gender_raw) ? gender_raw : null
  const boarding    = (['boarding','day'].includes(get('boarding_type').toLowerCase()))
    ? get('boarding_type').toLowerCase() : 'day'
  const entry_type  = (['new','returning'].includes(get('entry_type').toLowerCase()))
    ? get('entry_type').toLowerCase() : 'new'

  if (!last_name)  errors.push('Last name is required')
  if (!first_name) errors.push('First name is required')
  if (!gender)     errors.push('Gender must be M or F')

  return {
    _row: index + 1,
    _errors: errors,
    _valid: errors.length === 0,
    last_name,
    first_name,
    other_names:   get('other_names'),
    gender:        gender || 'M',
    date_of_birth: get('date_of_birth'),
    parent_name:   get('parent_name'),
    parent_phone:  get('parent_phone'),
    phone:         get('phone'),
    address:       get('address'),
    boarding_type: boarding,
    entry_type,
  }
}
