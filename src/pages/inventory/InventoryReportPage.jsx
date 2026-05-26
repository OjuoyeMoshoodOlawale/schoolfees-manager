import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Printer, Loader, RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { printCleanHtml } from '../../lib/utils'

export default function InventoryReportPage() {
  const { fmt } = useAuth()
  const [report,   setReport]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [printing, setPrinting] = useState(false)
  const [categories, setCategories] = useState([])
  const [filterCat, setFilterCat]   = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [r, c] = await Promise.all([
        window.api.inventoryValuation({ category_id: filterCat || undefined }),
        window.api.inventoryCategoriesList(),
      ])
      setReport(r); setCategories(c)
    } catch(e) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filterCat])

  const handlePrint = async () => {
    if (!report) return
    setPrinting(true)
    try {
      const school = await window.api.getSettings()
      const sym    = school.currency_symbol || '₦'
      const fmtN   = n => sym + Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2})

      const rows = report.items.map((item,i) => {
        const isLow = item.quantity_on_hand <= item.reorder_level
        return `<tr style="border-bottom:1px solid #e5e7eb;${i%2?'background:#f9fafb':''}">
          <td style="padding:5px 8px;font-size:9pt;font-family:monospace">${item.sku}</td>
          <td style="padding:5px 8px;font-weight:${isLow?'bold':''};color:${isLow?'#dc2626':''}">${item.name}${isLow?' ⚠':''}</td>
          <td style="padding:5px 8px;font-size:9pt;color:#6b7280">${item.category_name||'—'}</td>
          <td style="text-align:center;padding:5px 8px">${item.unit}</td>
          <td style="text-align:right;padding:5px 8px;font-weight:bold;color:${isLow?'#dc2626':'#15803d'}">${item.quantity_on_hand}</td>
          <td style="text-align:right;padding:5px 8px">${fmtN(item.cost_price)}</td>
          <td style="text-align:right;padding:5px 8px">${fmtN(item.selling_price)}</td>
          <td style="text-align:right;padding:5px 8px;font-weight:bold">${fmtN(item.stock_value)}</td>
          <td style="text-align:right;padding:5px 8px">${fmtN(item.retail_value)}</td>
        </tr>`
      }).join('')

      const html = `<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px">
          <h1 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:0">${school.school_name||'School'}</h1>
          <p style="margin:4px 0 0;font-size:12pt;font-weight:bold">Inventory Valuation Report</p>
          <p style="margin:2px 0 0;font-size:10pt;color:#6b7280">Generated ${new Date().toLocaleDateString('en-NG')}</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
          ${[
            ['Total Items',      report.totalItems,         '#374151'],
            ['Low Stock Items',  report.lowStockCount,      '#dc2626'],
            ['Cost Value',       fmtN(report.totalCostValue),  '#1d4ed8'],
            ['Retail Value',     fmtN(report.totalRetailValue),'#15803d'],
          ].map(([l,v,c])=>`<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;text-align:center">
            <p style="font-size:8pt;color:#6b7280;margin:0">${l}</p>
            <p style="font-size:13pt;font-weight:bold;margin:3px 0 0;color:${c}">${v}</p>
          </div>`).join('')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
          <thead><tr style="background:#1e293b;color:white">
            <th style="text-align:left;padding:6px 8px">SKU</th>
            <th style="text-align:left;padding:6px 8px">Item</th>
            <th style="text-align:left;padding:6px 8px">Category</th>
            <th style="text-align:center;padding:6px 8px">Unit</th>
            <th style="text-align:right;padding:6px 8px">On Hand</th>
            <th style="text-align:right;padding:6px 8px">Cost</th>
            <th style="text-align:right;padding:6px 8px">Selling</th>
            <th style="text-align:right;padding:6px 8px">Stock Value</th>
            <th style="text-align:right;padding:6px 8px">Retail Value</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #94a3b8">
            <td colspan="7" style="padding:6px 8px">TOTAL (${report.totalItems} items)</td>
            <td style="text-align:right;padding:6px 8px;color:#1d4ed8">${fmtN(report.totalCostValue)}</td>
            <td style="text-align:right;padding:6px 8px;color:#15803d">${fmtN(report.totalRetailValue)}</td>
          </tr></tfoot>
        </table>
      </div>`
      await printCleanHtml(html)
    } catch(e) { toast.error(e.message) }
    finally { setPrinting(false) }
  }

  const TX_LABELS = { purchase:'Purchases', sale:'Sales', issue:'Issues', return:'Returns', adjustment:'Adjustments' }

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory Report" subtitle="Stock valuation and 30-day activity"
        actions={report && (
          <button className="btn-secondary btn btn-sm" onClick={handlePrint} disabled={printing}>
            {printing ? <Loader size={14} className="animate-spin"/> : <Printer size={14}/>} Print
          </button>
        )}
      />

      <div className="card flex flex-wrap gap-4 items-end py-3">
        <div>
          <label className="form-label">Category</label>
          <select className="form-select w-44" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm self-end" onClick={load} disabled={loading}>
          {loading?<Loader size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Refresh
        </button>
      </div>

      {loading && <div className="py-10"><Spinner/></div>}

      {report && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Total Items',    report.totalItems,                     'text-gray-800'],
              ['Low Stock',      report.lowStockCount,                  report.lowStockCount>0?'text-red-600':'text-gray-400'],
              ['Cost Value',     fmt(report.totalCostValue),            'text-blue-700'],
              ['Retail Value',   fmt(report.totalRetailValue),          'text-emerald-700'],
            ].map(([l,v,c]) => (
              <div key={l} className="card py-4 px-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{l}</p>
                <p className={`text-2xl font-bold mt-1 ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* Low stock banner */}
          {report.lowStockCount > 0 && (
            <div className="flex gap-3 items-start rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-semibold text-red-700 text-sm">{report.lowStockCount} item(s) at or below reorder level</p>
                <p className="text-xs text-red-600 mt-0.5">Items marked ⚠ in the table below need restocking.</p>
              </div>
            </div>
          )}

          {/* 30-day activity */}
          {report.activity?.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-3 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">Last 30 Days Activity</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0">
                {report.activity.map(a => (
                  <div key={a.type} className="px-4 py-3 text-center">
                    <p className="text-xs text-gray-500">{TX_LABELS[a.type]||a.type}</p>
                    <p className="font-bold text-lg">{a.n}</p>
                    <p className="text-xs text-gray-400">{fmt(a.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valuation table */}
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Stock Valuation</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table text-sm">
                <thead><tr>
                  <th>SKU</th><th>Item</th><th>Category</th><th>Unit</th>
                  <th className="text-right">On Hand</th>
                  <th className="text-right">Cost Price</th>
                  <th className="text-right">Selling Price</th>
                  <th className="text-right">Stock Value</th>
                  <th className="text-right">Retail Value</th>
                </tr></thead>
                <tbody>
                  {report.items.map(item => {
                    const isLow = item.quantity_on_hand <= item.reorder_level
                    return (
                      <tr key={item.id} className={isLow ? 'bg-red-50' : ''}>
                        <td className="font-mono text-xs text-gray-400">{item.sku}</td>
                        <td className={`font-medium ${isLow?'text-red-700':''}`}>
                          {item.name} {isLow && <AlertTriangle size={11} className="inline text-red-500"/>}
                        </td>
                        <td className="text-gray-500 text-xs">{item.category_name||'—'}</td>
                        <td className="text-gray-500 text-xs">{item.unit}</td>
                        <td className={`text-right font-bold ${isLow?'text-red-600':'text-emerald-700'}`}>
                          {item.quantity_on_hand}
                        </td>
                        <td className="text-right">{fmt(item.cost_price)}</td>
                        <td className="text-right">{fmt(item.selling_price)}</td>
                        <td className="text-right font-semibold text-blue-700">{fmt(item.stock_value)}</td>
                        <td className="text-right text-emerald-700">{fmt(item.retail_value)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold border-t-2">
                    <td colSpan={7} className="px-4 py-2">TOTAL ({report.totalItems} items)</td>
                    <td className="text-right px-4 py-2 text-blue-700">{fmt(report.totalCostValue)}</td>
                    <td className="text-right px-4 py-2 text-emerald-700">{fmt(report.totalRetailValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
