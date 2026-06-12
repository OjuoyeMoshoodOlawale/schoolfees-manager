const { contextBridge, ipcRenderer } = require('electron')

// ─── LAN multi-user routing ───────────────────────────────────────────────────
// In CLIENT mode, every api call is sent over the LAN to the server machine so
// all stations share one database. A few channels must stay LOCAL because they
// interact with THIS machine (printing, network setup).
const NET = (() => { try { return ipcRenderer.sendSync('net:get-config-sync') } catch { return { mode: 'standalone' } } })()
const IS_CLIENT = NET.mode === 'client' && NET.serverHost
const LOCAL_CHANNELS = new Set([
  'app:print-html',
  'net:get-config', 'net:save-config', 'net:lan-ips', 'net:test-connection',
])

async function remoteInvoke(channel, data) {
  const url = `http://${NET.serverHost}:${NET.serverPort || 4790}/ipc`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sf-token': NET.serverToken || '' },
      body: JSON.stringify({ channel, data: data === undefined ? null : data }),
    })
  } catch {
    throw new Error(`Cannot reach the server (${NET.serverHost}). Check the network and that the server app is running.`)
  }
  const payload = await res.json()
  if (payload.__error) throw new Error(payload.__error)
  return payload.result
}

const invoke = (channel, data) =>
  (IS_CLIENT && !LOCAL_CHANNELS.has(channel))
    ? remoteInvoke(channel, data)
    : ipcRenderer.invoke(channel, data)

contextBridge.exposeInMainWorld('api', {
  // ── Settings
  getSettings:        ()     => invoke('settings:get'),
  saveSettings:       (d)    => invoke('settings:save', d),
  pickLogo:           ()     => invoke('settings:pick-logo'),
  getCurrencies:      ()     => invoke('settings:currencies'),
  getCurrency:        ()     => invoke('settings:get-currency'),
  setAccounting:      (e)    => invoke('settings:set-accounting', e),

  // ── Sessions & Terms
  listSessions:       ()     => invoke('sessions:list'),
  createSession:      (n)    => invoke('sessions:create', n),
  deleteSession:      (id)   => invoke('sessions:delete', id),
  setCurrentSession:  (s,t)  => invoke('sessions:set-current', s, t),
  listTerms:          (sid)  => invoke('terms:list', sid),
  updateTerm:         (d)    => invoke('terms:update', d),
  getCurrentTerm:     ()     => invoke('terms:current'),

  // ── Classes
  listClasses:        ()     => invoke('classes:list'),
  createClass:        (d)    => invoke('classes:create', d),
  updateClass:        (d)    => invoke('classes:update', d),
  deleteClass:        (id)   => invoke('classes:delete', id),

  // ── Students
  listStudents:       (f)    => invoke('students:list', f),
  getStudent:         (id)   => invoke('students:get', id),
  createStudent:      (d)    => invoke('students:create', d),
  updateStudent:      (d)    => invoke('students:update', d),
  deleteStudent:      (id)   => invoke('students:delete', id),
  nextRegNumber:      ()     => invoke('students:next-reg'),
  pickPhoto:          ()     => invoke('students:pick-photo'),
  getStudentCount:    ()     => invoke('students:count'),

  // ── Student Status & Promotion
  getStudentStatus:   (id)   => invoke('status:for-student', id),
  updateStudentStatus:(d)    => invoke('status:update', d),
  promoteStudents:    (d)    => invoke('students:promote', d),
  changeTerm:         (d)    => invoke('students:change-term', d),

  // ── Fee Items
  listFeeItems:       ()     => invoke('fee-items:list'),
  createFeeItem:      (d)    => invoke('fee-items:create', d),
  updateFeeItem:      (d)    => invoke('fee-items:update', d),
  deleteFeeItem:      (id)   => invoke('fee-items:delete', id),
  seedFeeItems:       ()     => invoke('fee-items:seed'),

  // ── Bill Config
  listBillConfig:     (f)    => invoke('bill-config:list', f),
  upsertBillConfig:   (d)    => invoke('bill-config:upsert', d),
  deleteBillConfig:   (id)   => invoke('bill-config:delete', id),
  copyBillConfig:     (d)    => invoke('bill-config:copy', d),
  getBillConfigCopyLog: ()   => invoke('bill-config:copy-log'),
  previewBillConfig:  (d)    => invoke('bill-config:preview', d),

  // ── Billing
  getStudentBillSummary: (d) => invoke('bills:student-summary', d),
  generateClassBills: (d)    => invoke('bills:generate-class', d),
  listClassBills:     (d)    => invoke('bills:list-class', d),
  waiveBill:          (d)    => invoke('bills:waive', d),
  listAdjustments:    (d)    => invoke('adjustments:list', d),
  createAdjustment:   (d)    => invoke('adjustments:create', d),
  deleteAdjustment:   (id)   => invoke('adjustments:delete', id),
  listCarryover:      (d)    => invoke('carryover:list', d),
  postCarryover:      (d)    => invoke('carryover:post', d),
  deleteCarryover:    (id)   => invoke('carryover:delete', id),
  autoComputeCarryover:(d)   => invoke('carryover:auto-compute', d),
  regenerateStudentBills:(d)  => invoke('bills:regenerate-student', d),

  // ── Payments
  nextReceiptNumber:  ()     => invoke('payments:next-receipt'),
  postPayment:        (d)    => invoke('payments:post', d),
  listPayments:       (f)    => invoke('payments:list', f),
  getPayment:         (id)   => invoke('payments:get', id),
  deletePayment:      (id)   => invoke('payments:delete', id),
  reversePayment:     (d)    => invoke('payments:reverse', d),
  getReceiptData:     (id)   => invoke('payments:receipt-data', id),
  bulkReceiptData:    (d)    => invoke('payments:bulk-receipt-data', d),
  listDebtors:        (f)    => invoke('debtors:list', f),

  // ── Reports
  getDashboardData:   ()     => invoke('reports:dashboard'),
  getInsights:        ()     => invoke('reports:insights'),
  getInsightsDrill:   (d)    => invoke('reports:insights-drill', d),
  getAccountReport:   (f)    => invoke('reports:account', f),
  getCollectionSummary: (f)  => invoke('reports:collection-summary', f),
  getClassFeeStatus:  (f)    => invoke('reports:class-fee-status', f),
  getStudentLedger:   (f)    => invoke('reports:student-ledger', f),
  getTermEndReport:   (f)    => invoke('reports:term-end', f),
  getPaymentAudit:    (f)    => invoke('reports:payment-audit', f),

  // ── Auth
  login:              (d)    => invoke('auth:login', d),
  listUsers:          ()     => invoke('auth:list-users'),
  createUser:         (d)    => invoke('auth:create-user', d),
  updateUser:         (d)    => invoke('auth:update-user', d),
  deleteUser:         (id)   => invoke('auth:delete-user', id),
  changePassword:     (d)    => invoke('auth:change-password', d),
  resetRequest:       (d)    => invoke('auth:reset-request', d),
  resetApply:         (d)    => invoke('auth:reset-apply', d),

  // ── Activation & App State
  getActivationStatus:()     => invoke('activation:status'),
  activateLicense:    (d)    => invoke('activation:activate', d),
  getMachineId:       ()     => invoke('activation:get-machine-id'),
  unlockAccounting:   (d)    => invoke('activation:unlock-accounting', d),
  unlockPayroll:      (d)    => invoke('activation:unlock-payroll', d),
  generatePayrollKey: (d)    => invoke('activation:generate-payroll-key', d),
  generateAccountingKey:(d)  => invoke('activation:generate-accounting-key', d),
  getAppState:        (k)    => invoke('app-state:get', k),
  setAppState:        (k,v)  => invoke('app-state:set', k, v),

  // ── Import
  importStudents:     (d)    => invoke('import:students', d),
  importOpeningBalances: (d) => invoke('import:opening-balances', d),
  openingBalancesStatus:   (d) => invoke('import:opening-balances-status', d),
  openingBalancesUnlock:   (d) => invoke('import:opening-balances-unlock', d),
  openingBalancesTemplate: (d) => invoke('import:opening-balances-template', d),

  // ── Communications
  listSmsProviders:   ()     => invoke('sms:list-providers'),
  sendSms:            (d)    => invoke('sms:send', d),
  sendBulkSms:        (d)    => invoke('sms:bulk-send', d),
  getSmsLog:          (d)    => invoke('sms:log', d),
  getSmsLogFull:      (d)    => invoke('sms:log-full', d),
  smsResend:          (d)    => invoke('sms:resend', d),
  smsUpdateResend:    (d)    => invoke('sms:update-phone-resend', d),
  testSms:            (d)    => invoke('sms:test', d),
  sendEmail:          (d)    => invoke('email:send', d),
  sendEmailReceipt:   (d)    => invoke('email:send-receipt', d),
  sendBillEmail:      (d)    => invoke('email:send-bill', d),
  previewBillEmail:   (d)    => invoke('email:preview-bill', d),
  sendBillEmailsBulk: (d)    => invoke('email:send-bills-bulk', d),
  backupNow:          ()     => invoke('backup:now'),
  listLocalBackups:   ()     => invoke('backup:list-local'),
  testEmail:          (d)    => invoke('email:test', d),
  getEmailLog:        (d)    => invoke('email:log', d),
  getEmailLogFull:    (d)    => invoke('email:log-full', d),
  emailResend:        (d)    => invoke('email:resend', d),
  emailUpdateResend:  (d)    => invoke('email:update-address-resend', d),
  carryCredit:        (d)    => invoke('payments:carry-credit', d),

  // ── Accounting
  listAccounts:       ()     => invoke('accounts:list'),
  createAccount:      (d)    => invoke('accounts:create', d),
  updateAccount:      (d)    => invoke('accounts:update', d),
  deleteAccount:      (id)   => invoke('accounts:delete', id),
  listJournal:        (f)    => invoke('journal:list', f),
  getJournalEntry:    (id)   => invoke('journal:get', id),
  postJournalEntry:   (d)    => invoke('journal:post', d),
  getAccountStatement:(d)    => invoke('accounts:statement', d),
  getTrialBalance:    ()     => invoke('accounts:trial-balance'),
  getLedger:          (d)    => invoke('accounts:ledger', d),
  listInvoices:       ()     => invoke('invoices:list'),
  getInvoice:         (id)   => invoke('invoices:get', id),
  createInvoice:      (d)    => invoke('invoices:create', d),
  updateInvoiceStatus:(d)    => invoke('invoices:update-status', d),
  deleteInvoice:      (id)   => invoke('invoices:delete', id),

  // ── Inventory
  inventoryCategoriesList: ()     => invoke('inventory:categories-list'),
  inventoryCategorySave:   (d)    => invoke('inventory:category-save', d),
  inventoryCategoryDelete: (id)   => invoke('inventory:category-delete', id),
  inventoryItemsList:      (d)    => invoke('inventory:items-list', d),
  inventoryItemGet:        (id)   => invoke('inventory:item-get', id),
  inventoryItemSave:       (d)    => invoke('inventory:item-save', d),
  inventoryItemDelete:     (id)   => invoke('inventory:item-delete', id),
  inventoryTransactionsList:(d)   => invoke('inventory:transactions-list', d),
  inventoryTransact:       (d)    => invoke('inventory:transact', d),
  inventoryTransactionDelete:(id) => invoke('inventory:transaction-delete', id),
  inventoryLowStock:       ()     => invoke('inventory:low-stock'),
  inventoryValuation:      (d)    => invoke('inventory:valuation', d),
  unlockInventory:         (d)    => invoke('activation:unlock-inventory', d),
  generateInventoryKey:    (d)    => invoke('activation:generate-inventory-key', d),

  // ── Expenses
  expenseSuppliersList:   (d)    => invoke('expenses:suppliers-list', d),
  expenseSupplierSave:    (d)    => invoke('expenses:supplier-save', d),
  expenseSupplierDelete:  (id)   => invoke('expenses:supplier-delete', id),
  expenseCategoriesList:  ()     => invoke('expenses:categories-list'),
  expenseCategorySave:    (d)    => invoke('expenses:category-save', d),
  expenseCategoryDelete:  (id)   => invoke('expenses:category-delete', id),
  expensesList:           (d)    => invoke('expenses:list', d),
  expenseGet:             (id)   => invoke('expenses:get', id),
  expenseSave:            (d)    => invoke('expenses:save', d),
  expenseApprove:         (d)    => invoke('expenses:approve', d),
  expenseReject:          (d)    => invoke('expenses:reject', d),
  expenseMarkPaid:        (d)    => invoke('expenses:mark-paid', d),
  expenseDelete:          (id)   => invoke('expenses:delete', id),
  expensesReport:         (d)    => invoke('expenses:report', d),

  // ── Payroll
  payrollGradesList:      ()     => invoke('payroll:grades-list'),
  payrollGradeSave:       (d)    => invoke('payroll:grade-save', d),
  payrollGradeDelete:     (id)   => invoke('payroll:grade-delete', id),
  payrollStaffList:       (d)    => invoke('payroll:staff-list', d),
  payrollStaffGet:        (id)   => invoke('payroll:staff-get', id),
  payrollStaffSave:       (d)    => invoke('payroll:staff-save', d),
  payrollStaffToggle:     (id)   => invoke('payroll:staff-toggle-active', id),
  payrollDeductionsList:  (d)    => invoke('payroll:deductions-list', d),
  payrollDeductionSave:   (d)    => invoke('payroll:deduction-save', d),
  payrollDeductionDelete: (id)   => invoke('payroll:deduction-delete', id),
  payrollRunsList:        ()     => invoke('payroll:runs-list'),
  payrollRunGet:          (id)   => invoke('payroll:run-get', id),
  payrollRunPreview:      (d)    => invoke('payroll:run-preview', d),
  payrollRunCreate:       (d)    => invoke('payroll:run-create', d),
  payrollRunApprove:      (d)    => invoke('payroll:run-approve', d),
  payrollRunMarkPaid:     (id)   => invoke('payroll:run-mark-paid', id),
  payrollRunDelete:       (id)   => invoke('payroll:run-delete', id),
  payrollPayslipHtml:     (d)    => invoke('payroll:payslip-html', d),
  payrollSummaryHtml:     (id)   => invoke('payroll:summary-html', id),

  // ── System Errors
  errorsList:           (d)  => invoke('errors:list', d),
  errorsResolve:        (d)  => invoke('errors:resolve', d),
  errorsResolveAll:     ()   => invoke('errors:resolve-all'),
  errorsDelete:         (id) => invoke('errors:delete', id),
  errorsClearResolved:  ()   => invoke('errors:clear-resolved'),
  errorsCountUnresolved:()   => invoke('errors:count-unresolved'),

  // ── User Guides (bundled PDFs)
  guidesList:           ()   => invoke('guides:list'),
  guidesOpen:           (f)  => invoke('guides:open', f),

  // ── Bulk Import (from JSON produced by parsing client spreadsheets)
  importPickFile:       ()   => invoke('import:pick-file'),
  importPreview:        (p)  => invoke('import:preview', p),
  importExecute:        (d)  => invoke('import:execute', d),

  // ── Backup
  getDbPath:          ()     => invoke('backup:get-db-path'),
  backupLocal:        ()     => invoke('backup:local'),
  restoreLocal:       ()     => invoke('backup:restore-local'),
  reloadApp:          ()     => invoke('backup:reload-app'),
  getSyncFolder:      ()     => invoke('backup:get-sync-folder'),
  listFolderBackups:  ()     => invoke('backup:list-folder'),
  setSyncFolder:      (d)    => invoke('backup:set-sync-folder', d),
  pickSyncFolder:     ()     => invoke('backup:pick-sync-folder'),
  syncNow:            ()     => invoke('backup:sync-now'),

  // ── Google Drive Backup
  gdriveStatus:       ()     => invoke('gdrive:status'),
  gdriveGetClientId:  ()     => invoke('gdrive:get-client-id'),
  gdriveSaveCreds:    (d)    => invoke('gdrive:save-credentials', d),
  gdriveConnect:      ()     => invoke('gdrive:connect'),
  gdriveDisconnect:   ()     => invoke('gdrive:disconnect'),
  gdriveBackup:       ()     => invoke('gdrive:backup'),
  gdriveListBackups:  ()     => invoke('gdrive:list-backups'),
  gdriveRestore:      (d)    => invoke('gdrive:restore', d),

  // ── Auto-backup Scheduler
  schedulerGetConfig: ()     => invoke('scheduler:get-config'),
  schedulerSaveConfig:(d)    => invoke('scheduler:save-config', d),
  schedulerRunNow:    ()     => invoke('scheduler:run-now'),

  // ── Network / LAN multi-user (always local to this machine)
  netGetConfig:       ()     => invoke('net:get-config'),
  netSaveConfig:      (d)    => invoke('net:save-config', d),
  netLanIps:          ()     => invoke('net:lan-ips'),
  netTestConnection:  (d)    => invoke('net:test-connection', d),

  // ── Utility
  openPath:           (p)    => invoke('shell:open-path', p),
  openExternal:       (url)  => invoke('shell:open-external', url),
  getAppVersion:      ()     => invoke('app:version'),
  checkUpdate:        ()     => invoke('app:check-update'),
  getDbDir:           ()     => invoke('app:get-db-dir'),
  printHtml:          (d)    => invoke('app:print-html', d),
  setContentProtection: (e) => invoke('app:set-content-protection', e),

  // ── Event subscriptions (renderer listens) ──
  onAutoBackupDone:   (cb)   => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('backup:auto-done', handler)
    return () => ipcRenderer.removeListener('backup:auto-done', handler)
  },
  onReceiptAutoSent:  (cb)   => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('receipt:auto-sent', handler)
    return () => ipcRenderer.removeListener('receipt:auto-sent', handler)
  },
})
