import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { Building2, Upload, Save, X, Bell, MessageSquare, Mail, DollarSign, Printer, Key } from 'lucide-react'
import { PageHeader, Field, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

const TABS = [
  { id: 'school',   label: 'School Info',  icon: Building2 },
  { id: 'currency', label: 'Currency',     icon: DollarSign },
  { id: 'receipt',  label: 'Receipt',      icon: Printer },
  { id: 'sms',      label: 'SMS',          icon: MessageSquare },
  { id: 'email',    label: 'Email',        icon: Mail },
  { id: 'accounting', label: 'Accounting',   icon: Key },
  { id: 'backup',     label: 'Backup',       icon: Bell },
]

export default function SettingsPage() {
  const { refreshSettings, refreshCurrency } = useAuth()
  const [tab, setTab]               = useState('school')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [logoPath, setLogoPath]     = useState('')
  const [currencies, setCurrencies] = useState([])
  const [smsProviders, setSmsProviders] = useState([])
  const [testPhone, setTestPhone]   = useState('')
  const [testEmail, setTestEmail]   = useState('')
  const [testingSms, setTestingSms] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [unlockKey, setUnlockKey] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm()

  useEffect(() => {
    async function init() {
      const [settings, curr, providers] = await Promise.all([
        window.api.getSettings(),
        window.api.getCurrencies(),
        window.api.listSmsProviders(),
      ])
      if (settings) {
        reset(settings)
        setLogoPath(settings.logo_path || '')
      }
      setCurrencies(curr || [])
      setSmsProviders(providers || [])
      setLoading(false)
    }
    init()
  }, [reset])

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      await window.api.saveSettings({ ...data, logo_path: logoPath })
      await refreshSettings()
      toast.success('Settings saved')
      reset(data)
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const pickLogo = async () => {
    const p = await window.api.pickLogo()
    if (p) setLogoPath(p)
  }

  const handleTestSms = async () => {
    if (!testPhone.trim()) { toast.error('Enter a phone number to test'); return }
    setTestingSms(true)
    try {
      const r = await window.api.testSms({ phone: testPhone })
      if (r.ok) toast.success(`SMS sent! Ref: ${r.ref || 'ok'}`)
      else toast.error(r.error || 'SMS failed')
    } catch(e) { toast.error(e.message) }
    finally { setTestingSms(false) }
  }

  const handleTestEmail = async () => {
    if (!testEmail.trim()) { toast.error('Enter an email address to test'); return }
    setTestingEmail(true)
    try {
      const r = await window.api.testEmail({ to: testEmail })
      if (r.ok) toast.success('Test email sent! Check your inbox.')
      else toast.error(r.error || 'Email failed')
    } catch(e) { toast.error(e.message) }
    finally { setTestingEmail(false) }
  }

  const handleTestPrint = () => {
    const w = window.open('', '_blank', 'width=800,height=600')
    const settings = watch()
    w.document.write(`
      <html><head><title>Test Print</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .center { text-align: center; }
        .box { border: 2px solid #000; padding: 12px; margin: 16px 0; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 13px; }
        @media print { button { display: none; } }
      </style></head>
      <body>
      <div class="center">
        <h2 style="text-transform:uppercase">${settings.school_name || 'Your School Name'}</h2>
        <p style="font-size:12px">${settings.address || 'School Address'}</p>
        <div class="box" style="display:inline-block;padding:4px 16px"><b>OFFICIAL FEE RECEIPT — TEST PRINT</b></div>
      </div>
      <div class="box">
        <div class="row"><span>Receipt No.</span><span>RCP-TEST-0001</span></div>
        <div class="row"><span>Student</span><span>Ade Johnson</span></div>
        <div class="row"><span>Class</span><span>JSS 1</span></div>
        <div class="row"><span>Term</span><span>First Term · 2024/2025</span></div>
        <div class="row"><span>Payment Method</span><span>Cash</span></div>
        <div class="row"><span>Date</span><span>${new Date().toLocaleDateString('en-NG')}</span></div>
        <div class="row" style="font-weight:bold;font-size:16px"><span>Amount Paid</span><span>₦50,000.00</span></div>
      </div>
      <p style="text-align:center;font-size:11px;margin-top:8px">${settings.receipt_footer || 'Thank you for your payment.'}</p>
      <div style="text-align:center;margin-top:16px">
        <button onclick="window.print()" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print</button>
      </div>
      </body></html>
    `)
    w.document.close()
  }

  if (loading) return <Spinner />

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Configure your school, currency, receipt layout, SMS and email."
        actions={
          <button className="btn-primary btn" onClick={handleSubmit(onSubmit)} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save Settings'}
          </button>
        }
      />

      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ── School Info ── */}
        {tab === 'school' && (
          <>
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">School Logo</h3>
              <div className="flex items-center gap-5">
                <div onClick={pickLogo}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition overflow-hidden bg-gray-50 flex-shrink-0">
                  {logoPath ? (
                    <img src={`file://${logoPath}`} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center"><Building2 size={24} className="text-gray-300 mx-auto" /><p className="text-xs text-gray-400 mt-1">No logo</p></div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Used on all receipts, bills and reports.</p>
                  <p className="text-xs text-gray-400">PNG, JPG, GIF · Recommended 200×200px</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary btn btn-sm" onClick={pickLogo}><Upload size={12} /> Choose</button>
                    {logoPath && <button type="button" className="btn btn-sm text-red-500 border border-red-200 hover:bg-red-50" onClick={() => setLogoPath('')}><X size={12} /></button>}
                  </div>
                </div>
              </div>
            </div>

            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">School Details</h3>
              <Field label="School Name" required error={errors.school_name?.message}>
                <input className="form-input" {...register('school_name', { required: 'Required' })} />
              </Field>
              <Field label="Address">
                <textarea className="form-input resize-none" rows={2} {...register('address')} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone" required error={errors.phone?.message}>
                  <input className="form-input" {...register('phone', { required: 'Required' })} />
                </Field>
                <Field label="Email">
                  <input type="email" className="form-input" {...register('email')} />
                </Field>
              </div>
            </div>

            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Bank / Payment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bank Name">
                  <input className="form-input" placeholder="e.g. First Bank" {...register('bank_name')} />
                </Field>
                <Field label="Account Number">
                  <input className="form-input" placeholder="0123456789" {...register('account_number')} />
                </Field>
              </div>
              <Field label="Account Name">
                <input className="form-input" {...register('account_name')} />
              </Field>
            </div>
          </>
        )}

        {/* ── Currency ── */}
        {tab === 'currency' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Currency Settings</h3>
            <p className="text-xs text-gray-400">All amounts in the application will use this currency.</p>
            <Field label="Currency Preset">
              <select className="form-select" value={watch('currency_code') || ''} onChange={e => {
                const c = currencies.find(x => x.code === e.target.value)
                if (c) { reset({ ...watch(), currency_symbol: c.symbol, currency_code: c.code, currency_name: c.name }) }
              }}>
                <option value="">— Select a preset —</option>
                {currencies.map(c => <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Symbol" required>
                <input className="form-input text-center text-lg font-bold" {...register('currency_symbol', { required: true })} />
              </Field>
              <Field label="Code" required>
                <input className="form-input uppercase" maxLength={3} {...register('currency_code', { required: true })} />
              </Field>
              <Field label="Name">
                <input className="form-input" {...register('currency_name')} />
              </Field>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              Preview: <strong>{watch('currency_symbol')}1,234,567.00</strong>
            </div>
          </div>
        )}

        {/* ── Receipt ── */}
        {tab === 'receipt' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Receipt & Print Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Thermal Width" hint="For receipt printers">
                <select className="form-select" {...register('thermal_width')}>
                  <option value="80mm">80mm thermal</option>
                  <option value="58mm">58mm thermal</option>
                  <option value="a4">A4 full page</option>
                </select>
              </Field>
              <Field label="Print Copies" hint="How many copies to print">
                <input type="number" min={1} max={5} className="form-input" {...register('print_copies', { min: 1, max: 5 })} />
              </Field>
            </div>
            <Field label="Receipt Footer Text">
              <textarea className="form-input resize-none" rows={3}
                placeholder="e.g. Thank you for your payment. This is a computer-generated receipt."
                {...register('receipt_footer')} />
            </Field>
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Test Print</p>
                <p className="text-xs text-gray-500">Print a sample receipt to verify layout and printer settings</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleTestPrint}>
                <Printer size={13} /> Test Print
              </button>
            </div>
          </div>
        )}

        {/* ── SMS ── */}
        {tab === 'sms' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">SMS Configuration</h3>
            <Field label="Enable SMS Notifications">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('sms_enabled')} />
                <span className="text-sm text-gray-700">Send SMS on payment receipt</span>
              </label>
            </Field>
            <Field label="SMS Provider">
              <select className="form-select" {...register('sms_provider')}>
                <option value="">— Select provider —</option>
                {smsProviders.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="API Key / Token">
              <input className="form-input font-mono" placeholder="Your API key from provider"
                {...register('sms_api_key')} />
            </Field>
            <Field label="Sender ID / Name" hint="Appears as the sender on recipient's phone">
              <input className="form-input" placeholder="e.g. BrightAcad" maxLength={11}
                {...register('sms_sender_id')} />
            </Field>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-gray-700">Send Test SMS</p>
              <div className="flex gap-2">
                <input
                  className="form-input text-sm flex-1"
                  placeholder="+2348012345678"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                />
                <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap"
                  onClick={handleTestSms} disabled={testingSms}>
                  {testingSms ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Save settings first, then send a test SMS to verify your API key.</p>
            </div>
          </div>
        )}

        {/* ── Email ── */}
        {tab === 'email' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Email Configuration (SMTP)</h3>
            <Field label="Enable Email Notifications">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('email_enabled')} />
                <span className="text-sm text-gray-700">Send email receipts and reports</span>
              </label>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="SMTP Host">
                <input className="form-input" placeholder="smtp.gmail.com" {...register('email_smtp_host')} />
              </Field>
              <Field label="SMTP Port">
                <input type="number" className="form-input" placeholder="587" {...register('email_smtp_port')} />
              </Field>
            </div>
            <Field label="SMTP Username">
              <input className="form-input" placeholder="your@email.com" {...register('email_smtp_user')} />
            </Field>
            <Field label="SMTP Password">
              <input type="password" className="form-input" {...register('email_smtp_pass')} />
            </Field>
            <Field label="From Address">
              <input className="form-input" placeholder="fees@yourschool.edu.ng" {...register('email_from')} />
            </Field>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-gray-700">Send Test Email</p>
              <div className="flex gap-2">
                <input
                  className="form-input text-sm flex-1"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
                <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap"
                  onClick={handleTestEmail} disabled={testingEmail}>
                  {testingEmail ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Save settings first. For Gmail, use an App Password (not your main password).</p>
            </div>
          </div>
        )}

        {/* ── Accounting Module ── */}
        {tab === 'accounting' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Accounting Module Unlock</h3>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
              <p className="font-semibold">Premium Feature</p>
              <p>The double-entry accounting module (chart of accounts, journal, ledger, trial balance) requires an unlock key. Contact your SchoolFees Manager agent to obtain one.</p>
            </div>
            <div className="space-y-3">
              <label className="form-label">Accounting Unlock Key</label>
              <div className="flex gap-2">
                <input
                  className="form-input font-mono flex-1 tracking-widest"
                  placeholder="ACCT-XXXX-XXXX"
                  value={unlockKey}
                  onChange={e => setUnlockKey(e.target.value.toUpperCase())}
                  maxLength={14}
                />
                <button
                  type="button"
                  className="btn btn-primary whitespace-nowrap"
                  disabled={unlocking || !unlockKey.trim()}
                  onClick={async () => {
                    setUnlocking(true)
                    try {
                      const r = await window.api.unlockAccounting({ key: unlockKey })
                      if (r.ok) {
                        toast.success('Accounting module unlocked! Reload the app to see the menu.')
                        await refreshSettings()
                      } else {
                        toast.error(r.error || 'Invalid key')
                      }
                    } catch(e) { toast.error(e.message) }
                    finally { setUnlocking(false) }
                  }}
                >
                  <Key size={14} /> {unlocking ? 'Verifying…' : 'Unlock'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Format: ACCT-XXXX-XXXX — unique per school name</p>
            </div>
          </div>
        )}

        {/* ── Backup ── */}
        {tab === 'backup' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Auto Backup Settings</h3>
            <Field label="Enable Auto Backup">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" {...register('auto_backup')} />
                <span className="text-sm text-gray-700">Automatically backup database nightly</span>
              </label>
            </Field>
            <Field label="Backup Time">
              <input type="time" className="form-input w-40" {...register('backup_time')} />
            </Field>
            <p className="text-xs text-gray-400">Go to Backup & Restore in the sidebar to manually back up or restore your database.</p>
          </div>
        )}

        {isDirty && (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">You have unsaved changes</p>
            <button type="submit" className="btn-primary btn btn-sm" disabled={saving}>
              <Save size={13} /> Save now
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
