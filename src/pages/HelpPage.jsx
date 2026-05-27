import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { BookOpen, FileText, ExternalLink, Mail, Phone, Info } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'

const MODULE_DESCRIPTIONS = {
  'Students':       'Register, edit, promote, and graduate students. Covers reg numbers, photos, and bulk operations.',
  'Fees & Billing': 'Set up fee items and bill configurations per class. Handle waivers, discounts, and adjustments.',
  'Payments':       'Post payments, print receipts, reverse transactions, and reconcile daily collections.',
  'Reports':        'Generate student statements, debtors lists, daily collections, and termly summaries.',
}

export default function HelpPage() {
  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.guidesList()
        setGuides(Array.isArray(list) ? list : [])
      } catch(e) {
        toast.error('Could not load user guides')
      } finally { setLoading(false) }
    })()
  }, [])

  const open = async (filename) => {
    setOpening(filename)
    try {
      const result = await window.api.guidesOpen(filename)
      if (result && result !== '') {
        // shell.openPath returns '' on success, error string on failure
        toast.error(result)
      }
    } catch(e) {
      toast.error(e.message || 'Could not open guide')
    } finally { setOpening('') }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & User Guides"
        subtitle="Step-by-step PDF guides for each module — open them anytime"
      />

      {/* User Guides */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">User Guides</h2>
        </div>

        {loading ? <Spinner /> : guides.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText size={28} className="mx-auto mb-2 text-gray-300" />
            <p>No guides found in this installation.</p>
            <p className="text-xs mt-1">Guides are bundled with the production .exe — they may be missing in dev.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {guides.map(g => (
              <button
                key={g.filename}
                onClick={() => open(g.filename)}
                disabled={opening === g.filename}
                className="text-left p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition group disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100">
                    <FileText size={18} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800 truncate">{g.title}</h3>
                      <ExternalLink size={12} className="text-gray-400 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {MODULE_DESCRIPTIONS[g.title] || g.filename}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      PDF · {g.sizeKb} KB
                      {opening === g.filename && <span className="text-blue-600 ml-2">Opening…</span>}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Guides open in your default PDF viewer. You can print or save them from there.
        </p>
      </div>

      {/* Support contacts */}
      <div className="card bg-gradient-to-br from-blue-50 to-slate-50 border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <Info size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Need More Help?</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          If you cannot find what you need in the guides, reach out to your administrator or contact support.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <a href="mailto:support@schoolfeesmanager.ng"
             className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:border-blue-400 transition">
            <Mail size={16} className="text-blue-600" />
            <div className="text-sm">
              <p className="font-medium text-gray-800">Email Support</p>
              <p className="text-xs text-gray-500">support@schoolfeesmanager.ng</p>
            </div>
          </a>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200">
            <Phone size={16} className="text-blue-600" />
            <div className="text-sm">
              <p className="font-medium text-gray-800">Phone Support</p>
              <p className="text-xs text-gray-500">Set in Settings &rarr; School Profile</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
