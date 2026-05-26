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

// ─── Clean Print ──────────────────────────────────────────────────────────────
// Sends pure HTML to Electron's hidden print window (no app chrome, no sidebar)
export async function printCleanHtml(html) {
  if (window.api?.printHtml) {
    return window.api.printHtml({ html })
  }
  // Fallback for browser dev: open a new window
  const w = window.open('', '_blank', 'width=800,height=600')
  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:Arial,sans-serif; font-size:12pt; }</style>
    </head><body>${html}</body></html>`)
  w.document.close()
  w.focus()
  w.print()
  w.close()
}

// ─── Bill Slip HTML builder ───────────────────────────────────────────────────
// Generates clean printable HTML for one student bill slip
export function buildBillSlipHtml({ student, bills, adjustments, bill_total, prev_balance,
  total_expected, total_paid, balance, school, sessionName, termName, className, currency = '₦' }) {

  const f = n => currency + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const logoHtml = school?.logo_path
    ? `<img src="file://${school.logo_path}" style="width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 8px;" />`
    : ''

  const billRows = bills.filter(b => b.status !== 'waived').map((b, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td style="padding:5px 10px;border:1px solid #ddd">${b.fee_item_name}</td>
      <td style="text-align:center;padding:5px 10px;border:1px solid #ddd">${b.is_compulsory ? 'Compulsory' : 'Elective'}</td>
      <td style="text-align:right;padding:5px 10px;border:1px solid #ddd">${f(b.amount)}</td>
    </tr>`).join('')

  const prevRow = prev_balance > 0 ? `
    <tr style="background:#fef3c7">
      <td style="padding:5px 10px;border:1px solid #ddd;font-style:italic">Previous Term Balance</td>
      <td style="border:1px solid #ddd"></td>
      <td style="text-align:right;padding:5px 10px;border:1px solid #ddd">${f(prev_balance)}</td>
    </tr>` : ''

  const adjRows = (adjustments || []).map(a => {
    const effect = a.calc_mode === 'percent' ? (a.amount / 100) * bill_total : a.amount
    const bg = a.type === 'addition' ? '#fef2f2' : '#f0fdf4'
    return `<tr style="background:${bg}">
      <td style="padding:5px 10px;border:1px solid #ddd;font-style:italic">${a.type === 'addition' ? '+ Addition' : '− Discount'}: ${a.reason}</td>
      <td style="border:1px solid #ddd"></td>
      <td style="text-align:right;padding:5px 10px;border:1px solid #ddd">${a.type === 'addition' ? '+' : '−'}${f(effect)}</td>
    </tr>`
  }).join('')

  const bankHtml = school?.account_number ? `
    <div style="margin-top:12px;text-align:center;font-size:10pt;color:#555">
      <p>Pay to: <strong>${school.bank_name || ''}</strong> | Account: <strong>${school.account_number}</strong></p>
      ${school.account_name ? `<p>${school.account_name}</p>` : ''}
    </div>` : ''

  return `
    <div style="font-family:Arial,sans-serif;font-size:12pt;padding:20px;max-width:750px;margin:0 auto">
      <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px">
        ${logoHtml}
        <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">${school?.school_name || 'School Name'}</h1>
        ${school?.address ? `<p style="font-size:10pt;color:#555;margin:2px 0">${school.address}</p>` : ''}
        ${school?.phone ? `<p style="font-size:10pt;color:#555;margin:2px 0">Tel: ${school.phone}</p>` : ''}
        <h2 style="font-size:13pt;font-weight:bold;text-decoration:underline;margin-top:8px">FEE STATEMENT</h2>
        <p style="font-size:11pt;margin-top:4px">${sessionName} — ${termName} — ${className}</p>
      </div>

      <table style="width:100%;margin-bottom:16px;font-size:11pt;border-collapse:collapse">
        <tr>
          <td style="width:50%;padding-bottom:4px"><strong>Name:</strong> ${student.last_name} ${student.first_name}</td>
          <td><strong>Reg No:</strong> ${student.reg_number}</td>
        </tr>
        <tr>
          <td><strong>Class:</strong> ${className}</td>
          <td><strong>Gender:</strong> ${student.gender === 'M' ? 'Male' : 'Female'} | <strong>Type:</strong> ${student.boarding_type || 'day'}</td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:11pt">
        <thead>
          <tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:6px 10px;border:1px solid #333">Fee Item</th>
            <th style="text-align:center;padding:6px 10px;border:1px solid #333">Type</th>
            <th style="text-align:right;padding:6px 10px;border:1px solid #333">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>${billRows}${prevRow}${adjRows}</tbody>
        <tfoot>
          <tr style="background:#1e293b;color:white;font-weight:bold">
            <td colspan="2" style="padding:8px 10px;border:1px solid #333">TOTAL EXPECTED</td>
            <td style="text-align:right;padding:8px 10px;border:1px solid #333;font-size:13pt">${f(total_expected)}</td>
          </tr>
          <tr style="background:#d1fae5;font-weight:bold">
            <td colspan="2" style="padding:6px 10px;border:1px solid #ddd">Total Paid</td>
            <td style="text-align:right;padding:6px 10px;border:1px solid #ddd;color:#065f46">${f(total_paid)}</td>
          </tr>
          <tr style="background:${balance > 0 ? '#fee2e2' : '#d1fae5'};font-weight:bold">
            <td colspan="2" style="padding:6px 10px;border:1px solid #ddd">${balance > 0 ? 'BALANCE DUE' : 'FULLY PAID ✓'}</td>
            <td style="text-align:right;padding:6px 10px;border:1px solid #ddd;color:${balance > 0 ? '#991b1b' : '#065f46'};font-size:13pt">${f(balance)}</td>
          </tr>
        </tfoot>
      </table>
      ${bankHtml}
      <p style="text-align:center;margin-top:12px;font-size:9pt;color:#999">${school?.receipt_footer || 'Please ensure payment is made promptly.'}</p>
    </div>`
}
