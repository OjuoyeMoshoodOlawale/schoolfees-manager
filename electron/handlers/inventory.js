'use strict'
/**
 * Inventory Module — Phase 8
 * Stock catalogue, stock-in/out, low-stock alerts, valuation report.
 * Hidden behind inventory_enabled activation key.
 */

const { ipcMain } = require('electron')
const { getDb }   = require('../lib/database')

function checkInventory() {
  const enabled = getDb().prepare("SELECT value FROM app_state WHERE key='inventory_enabled'").get()?.value
  if (enabled !== '1') throw new Error('Inventory module is not enabled for this installation.')
}

// ── Auto-generate SKU ─────────────────────────────────────────────────────────
function nextSku(db) {
  const last = db.prepare("SELECT sku FROM inventory_items ORDER BY id DESC LIMIT 1").get()
  if (!last) return 'ITM-0001'
  const n = parseInt(last.sku.replace('ITM-', '')) || 0
  return 'ITM-' + String(n + 1).padStart(4, '0')
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('inventory:categories-list', () =>
  getDb().prepare('SELECT * FROM inventory_categories ORDER BY name').all()
)

ipcMain.handle('inventory:category-save', (_, d) => {
  checkInventory()
  const db = getDb()
  if (d.id) {
    db.prepare('UPDATE inventory_categories SET name=?,description=?,is_active=? WHERE id=?')
      .run([d.name, d.description||'', d.is_active??1, d.id])
    return { id: d.id }
  }
  return { id: db.prepare('INSERT INTO inventory_categories (name,description,is_active) VALUES (?,?,?)')
    .run([d.name, d.description||'', d.is_active??1]).lastInsertRowid }
})

ipcMain.handle('inventory:category-delete', (_, id) => {
  checkInventory()
  const used = getDb().prepare('SELECT COUNT(*) as n FROM inventory_items WHERE category_id=?').get([id])?.n || 0
  if (used) throw new Error(`Category has ${used} item(s) — reassign them first.`)
  getDb().prepare('DELETE FROM inventory_categories WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS (catalogue)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('inventory:items-list', (_, { include_inactive = false, low_stock = false, category_id } = {}) => {
  const db = getDb()
  let sql = `SELECT i.*, c.name as category_name
    FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id WHERE 1=1`
  const params = []
  if (!include_inactive)    { sql += ' AND i.is_active=1' }
  if (low_stock)            { sql += ' AND i.quantity_on_hand <= i.reorder_level' }
  if (category_id)          { sql += ' AND i.category_id=?'; params.push(category_id) }
  sql += ' ORDER BY i.name'
  return db.prepare(sql).all(params)
})

ipcMain.handle('inventory:item-get', (_, id) => {
  return getDb().prepare(`SELECT i.*, c.name as category_name
    FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id WHERE i.id=?`).get([id])
})

ipcMain.handle('inventory:item-save', (_, d) => {
  checkInventory()
  const db = getDb()
  const fields = ['name','description','category_id','unit','cost_price','selling_price',
                  'reorder_level','is_active']
  const vals = fields.map(f => d[f] ?? null)

  if (d.id) {
    db.prepare(`UPDATE inventory_items SET ${fields.map(f=>f+'=?').join(',')} WHERE id=?`).run([...vals, d.id])
    return { id: d.id }
  }
  const sku = d.sku || nextSku(db)
  const id = db.prepare(`INSERT INTO inventory_items (sku,${fields.join(',')}) VALUES (?,${fields.map(()=>'?').join(',')})`)
    .run([sku, ...vals]).lastInsertRowid
  return { id, sku }
})

ipcMain.handle('inventory:item-delete', (_, id) => {
  checkInventory()
  const used = getDb().prepare('SELECT COUNT(*) as n FROM inventory_transactions WHERE item_id=?').get([id])?.n || 0
  if (used) throw new Error(`Item has ${used} transaction(s) — cannot delete.`)
  getDb().prepare('DELETE FROM inventory_items WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS (stock in / out)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('inventory:transactions-list', (_, { item_id, type, from_date, to_date, limit = 500 } = {}) => {
  const db = getDb()
  let sql = `SELECT t.*, i.name as item_name, i.sku, i.unit, s.name as supplier_name
    FROM inventory_transactions t
    JOIN inventory_items i ON i.id=t.item_id
    LEFT JOIN suppliers s ON s.id=t.supplier_id
    WHERE 1=1`
  const params = []
  if (item_id)   { sql += ' AND t.item_id=?';           params.push(item_id) }
  if (type)      { sql += ' AND t.type=?';              params.push(type) }
  if (from_date) { sql += ' AND t.transaction_date>=?'; params.push(from_date) }
  if (to_date)   { sql += ' AND t.transaction_date<=?'; params.push(to_date) }
  sql += ' ORDER BY t.transaction_date DESC, t.id DESC LIMIT ?'
  params.push(limit)
  return db.prepare(sql).all(params)
})

ipcMain.handle('inventory:transact', (_, d) => {
  checkInventory()
  const db   = getDb()
  const item = db.prepare('SELECT * FROM inventory_items WHERE id=?').get([d.item_id])
  if (!item) throw new Error('Item not found')

  const qty   = Number(d.quantity)
  const price = Number(d.unit_price) || 0
  const total = qty * price

  // Calculate new quantity
  const isInbound = ['purchase','return','adjustment'].includes(d.type)
  const isOutbound = ['sale','issue'].includes(d.type)

  let newQty = item.quantity_on_hand
  if (d.type === 'adjustment') {
    // adjustment: quantity field IS the new absolute quantity
    newQty = qty
  } else if (isInbound) {
    newQty = item.quantity_on_hand + qty
  } else if (isOutbound) {
    if (item.quantity_on_hand < qty) throw new Error(`Insufficient stock. On hand: ${item.quantity_on_hand} ${item.unit}`)
    newQty = item.quantity_on_hand - qty
  }

  // Record transaction
  const txId = db.prepare(`INSERT INTO inventory_transactions
    (item_id,type,quantity,unit_price,total_value,reference,notes,supplier_id,transaction_date,recorded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run([
    d.item_id, d.type,
    d.type === 'adjustment' ? qty - item.quantity_on_hand : qty,  // store delta for adjustment
    price, total,
    d.reference||'', d.notes||'', d.supplier_id||null,
    d.transaction_date || new Date().toISOString().slice(0,10),
    d.recorded_by || 'admin',
  ]).lastInsertRowid

  // Update quantity on hand
  db.prepare('UPDATE inventory_items SET quantity_on_hand=? WHERE id=?').run([newQty, d.item_id])

  // Auto-update cost price on purchase (weighted average)
  if (d.type === 'purchase' && price > 0) {
    const oldQty    = item.quantity_on_hand
    const oldCost   = item.cost_price
    const avgCost   = (oldQty * oldCost + qty * price) / (oldQty + qty)
    db.prepare('UPDATE inventory_items SET cost_price=? WHERE id=?').run([Math.round(avgCost * 100) / 100, d.item_id])
  }

  return { ok: true, id: txId, new_quantity: newQty }
})

ipcMain.handle('inventory:transaction-delete', (_, id) => {
  checkInventory()
  const db = getDb()
  const tx = db.prepare('SELECT * FROM inventory_transactions WHERE id=?').get([id])
  if (!tx) throw new Error('Transaction not found')
  const item = db.prepare('SELECT * FROM inventory_items WHERE id=?').get([tx.item_id])
  if (!item) throw new Error('Item not found')

  // Reverse the quantity effect
  let revertedQty
  if (['purchase','return'].includes(tx.type)) {
    revertedQty = item.quantity_on_hand - tx.quantity
  } else if (['sale','issue'].includes(tx.type)) {
    revertedQty = item.quantity_on_hand + Math.abs(tx.quantity)
  } else {
    // adjustment — reverse delta
    revertedQty = item.quantity_on_hand - tx.quantity
  }

  db.prepare('UPDATE inventory_items SET quantity_on_hand=? WHERE id=?').run([Math.max(0, revertedQty), tx.item_id])
  db.prepare('DELETE FROM inventory_transactions WHERE id=?').run([id])
  return { ok: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// LOW STOCK ALERTS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('inventory:low-stock', () => {
  return getDb().prepare(`
    SELECT i.*, c.name as category_name,
           (i.reorder_level - i.quantity_on_hand) as shortage
    FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id
    WHERE i.is_active=1 AND i.quantity_on_hand <= i.reorder_level
    ORDER BY shortage DESC
  `).all()
})

// ─────────────────────────────────────────────────────────────────────────────
// VALUATION REPORT
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('inventory:valuation', (_, { category_id } = {}) => {
  const db = getDb()
  let sql = `SELECT i.*, c.name as category_name,
    ROUND(i.quantity_on_hand * i.cost_price, 2) as stock_value,
    ROUND(i.quantity_on_hand * i.selling_price, 2) as retail_value
    FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id
    WHERE i.is_active=1`
  const params = []
  if (category_id) { sql += ' AND i.category_id=?'; params.push(category_id) }
  sql += ' ORDER BY c.name, i.name'
  const items = db.prepare(sql).all(params)

  const totalCostValue   = items.reduce((s, i) => s + Number(i.stock_value),   0)
  const totalRetailValue = items.reduce((s, i) => s + Number(i.retail_value),  0)
  const totalItems       = items.length
  const lowStockCount    = items.filter(i => i.quantity_on_hand <= i.reorder_level).length

  // Activity summary: in/out last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0,10)
  const activity = db.prepare(`
    SELECT type, COUNT(*) as n, COALESCE(SUM(total_value),0) as total
    FROM inventory_transactions
    WHERE transaction_date >= ?
    GROUP BY type ORDER BY total DESC
  `).all([thirtyDaysAgo])

  return { items, totalCostValue, totalRetailValue, totalItems, lowStockCount, activity }
})
