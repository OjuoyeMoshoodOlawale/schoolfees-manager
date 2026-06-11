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

// ─── Escape user-entered text before HTML interpolation (XSS guard) ──────────
export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}

// ─── Amount in words (Naira) — standard on printed receipts ──────────────────
export function amountInWords(n) {
  n = Math.abs(Math.round(Number(n) || 0))
  if (n === 0) return 'Zero Naira Only'
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve',
    'Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  const below1000 = x => {
    let s = ''
    if (x >= 100) { s += ones[Math.floor(x/100)] + ' Hundred'; x %= 100; if (x) s += ' and ' }
    if (x >= 20)  { s += tens[Math.floor(x/10)]; x %= 10; if (x) s += '-' + ones[x] }
    else if (x)   { s += ones[x] }
    return s
  }
  const scales = [[1e9,'Billion'],[1e6,'Million'],[1e3,'Thousand'],[1,'']]
  const words = []
  for (const [val, name] of scales) {
    if (n >= val) {
      const chunk = Math.floor(n / val); n %= val
      words.push(below1000(chunk) + (name ? ' ' + name : ''))
    }
  }
  return words.join(', ') + ' Naira Only'
}

// ─── Standard Payment Receipt HTML builder ────────────────────────────────────
// One receipt block — used by single receipt print AND bulk receipt printing.
// Matches the email receipt format: school header, receipt no, student info,
// account summary (Total Billed / Total Paid / This Payment / Balance), and
// amount in words. Pure block HTML so multiple receipts can be concatenated
// with page breaks for bulk printing.
export function buildReceiptPrintHtml({ payment, school, totalBilled = null, totalPaid = null }) {
  const currency = school?.currency_symbol || '₦'
  const f = n => currency + Number(n||0).toLocaleString('en-NG', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const e = escapeHtml
  const schoolName = e(school?.school_name || 'School')
  const isReversal = Number(payment.amount_paid) < 0
  const paid = Math.abs(Number(payment.amount_paid))
  const balance = totalBilled !== null && totalPaid !== null
    ? Math.max(0, Number(totalBilled) - Number(totalPaid)) : null

  const logoHtml = school?.logo_path
    ? `<img src="localfile://${school.logo_path}" style="max-height:60px;max-width:150px;display:block;margin:0 auto 8px;object-fit:contain;"/>`
    : ''
  const addressLine = [school?.address, school?.phone, school?.email].filter(Boolean).map(e).join(' &bull; ')

  const infoRows = [
    ['Received From',  e(payment.parent_name || `Parent/Guardian of ${payment.first_name || ''}`)],
    ['Student',        e(`${payment.last_name||''} ${payment.first_name||''}`.trim())],
    ['Reg. Number',    e(payment.reg_number || '—')],
    ['Class',          e(payment.class_name || '—')],
    ['Term / Session', e(`${payment.term_name||''}, ${payment.session_name||''}`)],
    ['Payment Date',   e(payment.payment_date)],
    ['Payment Method', e(String(payment.payment_method||'').toUpperCase())],
    ...(payment.reference ? [['Reference', e(payment.reference)]] : []),
  ]

  const summaryRows = []
  if (totalBilled !== null) summaryRows.push([`Total Fees Billed (this term)`, f(totalBilled), false])
  if (totalPaid   !== null) summaryRows.push([`Total Paid to Date`, f(totalPaid), false])
  summaryRows.push([isReversal ? 'Amount Reversed' : 'Amount Paid (this receipt)', f(paid), true])
  if (!isReversal && balance !== null)
    summaryRows.push(['Outstanding Balance', balance > 0 ? f(balance) : f(0) + ' — FULLY PAID', true])

  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#1e293b;border:2px solid #1e293b;">
    <div style="text-align:center;padding:18px 24px 12px;border-bottom:2px solid #1e293b;">
      ${logoHtml}
      <div style="font-size:16pt;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;">${schoolName}</div>
      ${addressLine ? `<div style="font-size:8.5pt;color:#64748b;margin-top:3px;font-family:Arial,sans-serif;">${addressLine}</div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;">
      <span style="font-size:11pt;font-weight:bold;letter-spacing:.08em;color:${isReversal ? '#b91c1c' : '#1e293b'};">
        ${isReversal ? 'PAYMENT REVERSAL NOTICE' : 'OFFICIAL PAYMENT RECEIPT'}</span>
      <span style="font-size:9.5pt;font-family:'Courier New',monospace;font-weight:bold;">No. ${e(payment.receipt_number)}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
      <tbody>
        ${infoRows.map(([l,v]) => `<tr>
          <td style="padding:5px 18px;font-size:9.5pt;color:#64748b;width:38%;border-bottom:1px dotted #e2e8f0;">${l}</td>
          <td style="padding:5px 18px;font-size:9.5pt;font-weight:600;text-align:right;border-bottom:1px dotted #e2e8f0;">${v}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="padding:7px 18px 3px;font-size:8.5pt;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-family:Arial,sans-serif;">Account Summary</div>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
      <tbody>
        ${summaryRows.map(([l,v,hl]) => `<tr>
          <td style="padding:6px 18px;font-size:${hl?'11pt':'10pt'};${hl?`font-weight:bold;background:${isReversal?'#fef2f2':'#eff6ff'};border-top:2px solid #1e293b;border-bottom:2px solid #1e293b;`:'border-bottom:1px solid #e2e8f0;'}">${l}</td>
          <td style="padding:6px 18px;font-size:${hl?'11pt':'10pt'};text-align:right;font-weight:${hl?'bold':'600'};${hl?`background:${isReversal?'#fef2f2':'#eff6ff'};border-top:2px solid #1e293b;border-bottom:2px solid #1e293b;`:'border-bottom:1px solid #e2e8f0;'}">${v}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="padding:9px 18px;font-size:9pt;font-style:italic;color:#334155;border-bottom:1px solid #e2e8f0;">
      <b style="font-style:normal;">Amount in words:</b> ${amountInWords(paid)}
    </div>
    <div style="display:flex;justify-content:space-between;padding:24px 18px 6px;font-family:Arial,sans-serif;">
      <div style="width:42%;border-top:1px solid #94a3b8;text-align:center;font-size:8.5pt;color:#64748b;padding-top:4px;">Bursar / Cashier</div>
      <div style="width:42%;border-top:1px solid #94a3b8;text-align:center;font-size:8.5pt;color:#64748b;padding-top:4px;">Authorised Signature</div>
    </div>
    <div style="text-align:center;padding:8px 18px 12px;font-size:8.5pt;color:#94a3b8;font-family:Arial,sans-serif;">
      ${e(school?.receipt_footer || 'Thank you for your payment.')}<br/>
      This is a computer-generated receipt issued by ${schoolName}.
    </div>
  </div>`
}

// ─── Bulk receipt printing — one student receipt per page ─────────────────────
// Concatenates receipt blocks with a hard page break after each (except the
// last), so a normal A4 printer outputs exactly one receipt per sheet.
export function buildBulkReceiptsHtml(receipts, school) {
  return receipts.map(({ payment, totalBilled, totalPaid }, idx) => {
    const block = buildReceiptPrintHtml({ payment, school, totalBilled, totalPaid })
    const pageBreak = idx < receipts.length - 1
      ? '<div style="page-break-after:always;break-after:page;height:0;margin:0;padding:0;"></div>'
      : ''
    return block + pageBreak
  }).join('')
}


// ─── Bill Slip HTML builder ───────────────────────────────────────────────────
// Generates clean printable HTML for one student bill slip
export function buildBillSlipHtml({ student, bills, adjustments, bill_total, prev_balance,
  total_expected, total_paid, balance, school, sessionName, termName, className, currency = '₦' }) {

  const f = n => currency + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const logoHtml = school?.logo_path
    ? `<img src="localfile://${school.logo_path}" style="width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 8px;" />`
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
