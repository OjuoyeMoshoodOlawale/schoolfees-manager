import { useEffect, useState, useMemo } from 'react'
import { toast } from 'react-toastify'
import { Plus, Pencil, Trash2, ArrowDown, ArrowUp, RotateCcw,
         SlidersHorizontal, AlertTriangle, Search } from 'lucide-react'
import { PageHeader, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { todayISO } from '../../lib/utils'

const UNITS = ['piece','pack','box','ream','litre','kg','metre','pair','set','carton','bottle','other']
const TX_TYPES = {
  purchase:   { label:'Stock In (Purchase)',  icon: ArrowDown,   color:'text-emerald-600' },
  sale:       { label:'Stock Out (Sale)',      icon: ArrowUp,     color:'text-red-600' },
  issue:      { label:'Issue / Distribute',    icon: ArrowUp,     color:'text-orange-600' },
  return:     { label:'Return to Stock',       icon: RotateCcw,   color:'text-blue-600' },
  adjustment: { label:'Stock Adjustment',      icon: SlidersHorizontal, color:'text-purple-600' },
}

const EMPTY_ITEM = {
  id:null, name:'', description:'', category_id:'', unit:'piece',
  cost_price:'', selling_price:'', reorder_level:'5', is_active:1,
}
const EMPTY_TX = {
  item_id:'', type:'purchase', quantity:'', unit_price:'',
  reference:'', notes:'', supplier_id:'', transaction_date: todayISO(),
}

export default function InventoryPage() {
  const { canEdit, canAdmin, user, fmt } = useAuth()
  const [items,      setItems]      = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [loading,    setLoading]    = useState(true)

  // Filters
  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState('')
  const [showLow,    setShowLow]    = useState(false)
  const [showAll,    setShowAll]    = useState(false)

  // Modals
  const [itemModal, setItemModal]   = useState(false)
  const [txModal,   setTxModal]     = useState(false)
  const [txHistory, setTxHistory]   = useState(null) // {item, txs}
  const [itemForm,  setItemForm]    = useState(EMPTY_ITEM)
  const [txForm,    setTxForm]      = useState(EMPTY_TX)
  const [saving,    setSaving]      = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [it, cat, sup] = await Promise.all([
        window.api.inventoryItemsList({ include_inactive: showAll, low_stock: showLow }),
        window.api.inventoryCategoriesList(),
        window.api.expenseSuppliersList(),
      ])
      setItems(it); setCategories(cat); setSuppliers(sup)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [showLow, showAll])

  const filtered = useMemo(() => {
    let list = items
    if (filterCat) list = list.filter(i => String(i.category_id) === String(filterCat))
    if (search)    list = list.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [items, filterCat, search])

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  const openNewItem  = () => { setItemForm(EMPTY_ITEM); setItemModal(true) }
  const openEditItem = i  => { setItemForm({ ...i, category_id: i.category_id||'', cost_price: String(i.cost_price), selling_price: String(i.selling_price), reorder_level: String(i.reorder_level) }); setItemModal(true) }

  const saveItem = async () => {
    if (!itemForm.name) return toast.error('Item name required')
    setSaving(true)
    try {
      await window.api.inventoryItemSave({
        ...itemForm,
        category_id:    itemForm.category_id ? Number(itemForm.category_id) : null,
        cost_price:     Number(itemForm.cost_price)     || 0,
        selling_price:  Number(itemForm.selling_price)  || 0,
        reorder_level:  Number(itemForm.reorder_level)  || 5,
      })
      toast.success(itemForm.id ? 'Item updated' : 'Item added')
      setItemModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const delItem = async (id) => {
    if (!confirm('Delete this item?')) return
    try { await window.api.inventoryItemDelete(id); toast.success('Deleted'); load() }
    catch(e) { toast.error(e.message) }
  }

  // ── Transaction ────────────────────────────────────────────────────────────
  const openTx = (item) => {
    setTxForm({ ...EMPTY_TX, item_id: item.id, unit_price: String(item.cost_price) })
    setTxModal(true)
  }

  const saveTx = async () => {
    if (!txForm.quantity || isNaN(Number(txForm.quantity)) || Number(txForm.quantity) <= 0)
      return toast.error('Enter a valid quantity')
    setSaving(true)
    try {
      const r = await window.api.inventoryTransact({
        ...txForm,
        quantity:    Number(txForm.quantity),
        unit_price:  Number(txForm.unit_price) || 0,
        supplier_id: txForm.supplier_id ? Number(txForm.supplier_id) : null,
        recorded_by: user?.username || 'admin',
      })
      toast.success(`Transaction recorded. New qty: ${r.new_quantity}`)
      setTxModal(false); load()
    } catch(e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const openHistory = async (item) => {
    const txs = await window.api.inventoryTransactionsList({ item_id: item.id })
    setTxHistory({ item, txs })
  }

  const delTx = async (id) => {
    if (!confirm('Reverse this transaction?')) return
    try { await window.api.inventoryTransactionDelete(id); toast.success('Reversed'); load(); setTxHistory(null) }
    catch(e) { toast.error(e.message) }
  }

  const fi = k => e => setItemForm(p => ({ ...p, [k]: e.target.value }))
  const ft = k => e => setTxForm(p => ({ ...p, [k]: e.target.value }))

  const lowCount = items.filter(i => i.quantity_on_hand <= i.reorder_level).length

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" subtitle="Stock catalogue, movements and levels"
        actions={canEdit && (
          <button className="btn-primary btn btn-sm" onClick={openNewItem}><Plus size={14}/> Add Item</button>
        )}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Total Items',   items.length,   'text-gray-800'],
          ['Low Stock',     lowCount,        lowCount > 0 ? 'text-red-600' : 'text-gray-400'],
          ['Total Cost Value', fmt(items.reduce((s,i)=>s+i.quantity_on_hand*i.cost_price,0)), 'text-blue-700'],
          ['Retail Value',  fmt(items.reduce((s,i)=>s+i.quantity_on_hand*i.selling_price,0)), 'text-emerald-700'],
        ].map(([l,v,c]) => (
          <div key={l} className="card py-3 px-4">
            <p className="text-xs text-gray-500 uppercase">{l}</p>
            <p className={`text-xl font-bold mt-1 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 items-end py-3">
        <div className="flex-1 min-w-44">
          <label className="form-label">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input className="form-input pl-8" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or SKU…"/>
          </div>
        </div>
        <div>
          <label className="form-label">Category</label>
          <select className="form-select w-44" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-4 items-center self-end pb-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showLow} onChange={e=>setShowLow(e.target.checked)}/>
            Low stock only
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>
            Show inactive
          </label>
        </div>
      </div>

      {/* Table */}
      {loading ? <div className="py-10"><Spinner/></div> : (
        <div className="card overflow-hidden p-0">
          <table className="data-table">
            <thead><tr>
              <th>SKU</th><th>Name</th><th>Category</th><th>Unit</th>
              <th className="text-right">On Hand</th><th className="text-right">Reorder At</th>
              <th className="text-right">Cost Price</th><th className="text-right">Selling Price</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center text-gray-400 py-8">No items. Add your first stock item.</td></tr>
              )}
              {filtered.map(item => {
                const isLow = item.quantity_on_hand <= item.reorder_level
                return (
                  <tr key={item.id} className={!item.is_active ? 'opacity-40' : ''}>
                    <td className="font-mono text-xs text-gray-500">{item.sku}</td>
                    <td>
                      <div className="font-semibold flex items-center gap-1">
                        {item.name}
                        {isLow && <AlertTriangle size={12} className="text-red-500 flex-shrink-0"/>}
                      </div>
                      {item.description && <div className="text-xs text-gray-400">{item.description}</div>}
                    </td>
                    <td className="text-gray-500 text-sm">{item.category_name||'—'}</td>
                    <td className="text-gray-500 text-sm">{item.unit}</td>
                    <td className={`text-right font-bold ${isLow ? 'text-red-600' : 'text-emerald-700'}`}>
                      {item.quantity_on_hand}
                    </td>
                    <td className="text-right text-gray-400">{item.reorder_level}</td>
                    <td className="text-right">{fmt(item.cost_price)}</td>
                    <td className="text-right">{fmt(item.selling_price)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-secondary text-xs px-2" onClick={() => openTx(item)}>
                          Transact
                        </button>
                        <button className="btn btn-sm btn-secondary text-xs px-2" onClick={() => openHistory(item)}>
                          History
                        </button>
                        {canEdit && <>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEditItem(item)}><Pencil size={12}/></button>
                          <button className="btn btn-sm btn-secondary text-red-500" onClick={() => delItem(item.id)}><Trash2 size={12}/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title={itemForm.id ? 'Edit Item' : 'New Stock Item'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="form-label">Item Name *</label>
            <input className="form-input" value={itemForm.name} onChange={fi('name')} placeholder="e.g. A4 Exercise Book"/>
          </div>
          <div>
            <label className="form-label">Category</label>
            <select className="form-select" value={itemForm.category_id} onChange={fi('category_id')}>
              <option value="">— Select —</option>
              {categories.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Unit</label>
            <select className="form-select" value={itemForm.unit} onChange={fi('unit')}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {[['cost_price','Cost Price'],['selling_price','Selling Price'],['reorder_level','Reorder Level']].map(([k,l])=>(
            <div key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" type="number" min="0" step="0.01" value={itemForm[k]} onChange={fi(k)}/>
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="form-label">Description</label>
            <input className="form-input" value={itemForm.description} onChange={fi('description')}/>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="inv-active" checked={!!itemForm.is_active} onChange={e=>setItemForm(p=>({...p,is_active:e.target.checked?1:0}))}/>
            <label htmlFor="inv-active" className="text-sm">Active</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={()=>setItemModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveItem} disabled={saving}>{saving?'Saving…':itemForm.id?'Update':'Add Item'}</button>
        </div>
      </Modal>

      {/* Transaction Modal */}
      <Modal open={txModal} onClose={()=>setTxModal(false)} title="Record Transaction">
        {txForm.item_id && (() => {
          const item = items.find(i=>i.id===txForm.item_id)
          return (
            <div className="space-y-4">
              {item && (
                <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm flex justify-between">
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-gray-600">On hand: <strong className={item.quantity_on_hand<=item.reorder_level?'text-red-600':'text-emerald-700'}>{item.quantity_on_hand}</strong> {item.unit}</span>
                </div>
              )}
              <div>
                <label className="form-label">Transaction Type</label>
                <select className="form-select" value={txForm.type} onChange={ft('type')}>
                  {Object.entries(TX_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                {txForm.type === 'adjustment' && (
                  <p className="text-xs text-gray-400 mt-1">Enter the NEW total quantity on hand (not a delta).</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{txForm.type === 'adjustment' ? 'New Quantity' : 'Quantity'} *</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={txForm.quantity} onChange={ft('quantity')}/>
                </div>
                <div>
                  <label className="form-label">Unit Price</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={txForm.unit_price} onChange={ft('unit_price')}/>
                </div>
              </div>
              <div>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={txForm.transaction_date} onChange={ft('transaction_date')}/>
              </div>
              {['purchase','return'].includes(txForm.type) && (
                <div>
                  <label className="form-label">Supplier</label>
                  <select className="form-select" value={txForm.supplier_id} onChange={ft('supplier_id')}>
                    <option value="">— None —</option>
                    {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="form-label">Reference</label>
                <input className="form-input" placeholder="Invoice #, issue slip #…" value={txForm.reference} onChange={ft('reference')}/>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input className="form-input" value={txForm.notes} onChange={ft('notes')}/>
              </div>
              {txForm.quantity && txForm.unit_price && (
                <div className="bg-emerald-50 rounded px-3 py-2 text-sm flex justify-between">
                  <span className="text-gray-600">Total value</span>
                  <span className="font-bold text-emerald-700">{fmt(Number(txForm.quantity)*Number(txForm.unit_price))}</span>
                </div>
              )}
            </div>
          )
        })()}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={()=>setTxModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveTx} disabled={saving}>{saving?'Saving…':'Record'}</button>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal open={!!txHistory} onClose={()=>setTxHistory(null)}
        title={txHistory ? `Transaction History — ${txHistory.item.name}` : ''} size="xl">
        {txHistory && (
          <div className="overflow-x-auto">
            <table className="data-table text-xs">
              <thead><tr>
                <th>Date</th><th>Type</th><th className="text-right">Qty</th>
                <th className="text-right">Unit Price</th><th className="text-right">Value</th>
                <th>Reference</th><th>Notes</th>
                {canAdmin && <th></th>}
              </tr></thead>
              <tbody>
                {txHistory.txs.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-6">No transactions.</td></tr>
                )}
                {txHistory.txs.map(tx => {
                  const cfg = TX_TYPES[tx.type] || {}
                  return (
                    <tr key={tx.id}>
                      <td>{tx.transaction_date}</td>
                      <td><span className={`font-semibold ${cfg.color||''}`}>{cfg.label||tx.type}</span></td>
                      <td className="text-right font-bold">{tx.quantity}</td>
                      <td className="text-right">{fmt(tx.unit_price)}</td>
                      <td className="text-right">{fmt(tx.total_value)}</td>
                      <td className="text-gray-500">{tx.reference||'—'}</td>
                      <td className="text-gray-400">{tx.notes||'—'}</td>
                      {canAdmin && (
                        <td>
                          <button className="btn btn-sm btn-secondary text-red-500" onClick={()=>delTx(tx.id)}
                            title="Reverse transaction"><Trash2 size={11}/></button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
