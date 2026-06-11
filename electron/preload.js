const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ── Settings
  getSettings:        ()     => ipcRenderer.invoke('settings:get'),
  saveSettings:       (d)    => ipcRenderer.invoke('settings:save', d),
  pickLogo:           ()     => ipcRenderer.invoke('settings:pick-logo'),
  getCurrencies:      ()     => ipcRenderer.invoke('settings:currencies'),
  getCurrency:        ()     => ipcRenderer.invoke('settings:get-currency'),
  setAccounting:      (e)    => ipcRenderer.invoke('settings:set-accounting', e),

  // ── Sessions & Terms
  listSessions:       ()     => ipcRenderer.invoke('sessions:list'),
  createSession:      (n)    => ipcRenderer.invoke('sessions:create', n),
  deleteSession:      (id)   => ipcRenderer.invoke('sessions:delete', id),
  setCurrentSession:  (s,t)  => ipcRenderer.invoke('sessions:set-current', s, t),
  listTerms:          (sid)  => ipcRenderer.invoke('terms:list', sid),
  updateTerm:         (d)    => ipcRenderer.invoke('terms:update', d),
  getCurrentTerm:     ()     => ipcRenderer.invoke('terms:current'),

  // ── Classes
  listClasses:        ()     => ipcRenderer.invoke('classes:list'),
  createClass:        (d)    => ipcRenderer.invoke('classes:create', d),
  updateClass:        (d)    => ipcRenderer.invoke('classes:update', d),
  deleteClass:        (id)   => ipcRenderer.invoke('classes:delete', id),

  // ── Students
  listStudents:       (f)    => ipcRenderer.invoke('students:list', f),
  getStudent:         (id)   => ipcRenderer.invoke('students:get', id),
  createStudent:      (d)    => ipcRenderer.invoke('students:create', d),
  updateStudent:      (d)    => ipcRenderer.invoke('students:update', d),
  deleteStudent:      (id)   => ipcRenderer.invoke('students:delete', id),
  nextRegNumber:      ()     => ipcRenderer.invoke('students:next-reg'),
  pickPhoto:          ()     => ipcRenderer.invoke('students:pick-photo'),
  getStudentCount:    ()     => ipcRenderer.invoke('students:count'),

  // ── Student Status & Promotion
  getStudentStatus:   (id)   => ipcRenderer.invoke('status:for-student', id),
  updateStudentStatus:(d)    => ipcRenderer.invoke('status:update', d),
  promoteStudents:    (d)    => ipcRenderer.invoke('students:promote', d),
  changeTerm:         (d)    => ipcRenderer.invoke('students:change-term', d),

  // ── Fee Items
  listFeeItems:       ()     => ipcRenderer.invoke('fee-items:list'),
  createFeeItem:      (d)    => ipcRenderer.invoke('fee-items:create', d),
  updateFeeItem:      (d)    => ipcRenderer.invoke('fee-items:update', d),
  deleteFeeItem:      (id)   => ipcRenderer.invoke('fee-items:delete', id),
  seedFeeItems:       ()     => ipcRenderer.invoke('fee-items:seed'),

  // ── Bill Config
  listBillConfig:     (f)    => ipcRenderer.invoke('bill-config:list', f),
  upsertBillConfig:   (d)    => ipcRenderer.invoke('bill-config:upsert', d),
  deleteBillConfig:   (id)   => ipcRenderer.invoke('bill-config:delete', id),
  copyBillConfig:     (d)    => ipcRenderer.invoke('bill-config:copy', d),
  getBillConfigCopyLog: ()   => ipcRenderer.invoke('bill-config:copy-log'),
  previewBillConfig:  (d)    => ipcRenderer.invoke('bill-config:preview', d),

  // ── Billing
  getStudentBillSummary: (d) => ipcRenderer.invoke('bills:student-summary', d),
  generateClassBills: (d)    => ipcRenderer.invoke('bills:generate-class', d),
  listClassBills:     (d)    => ipcRenderer.invoke('bills:list-class', d),
  waiveBill:          (d)    => ipcRenderer.invoke('bills:waive', d),
  listAdjustments:    (d)    => ipcRenderer.invoke('adjustments:list', d),
  createAdjustment:   (d)    => ipcRenderer.invoke('adjustments:create', d),
  deleteAdjustment:   (id)   => ipcRenderer.invoke('adjustments:delete', id),
  listCarryover:      (d)    => ipcRenderer.invoke('carryover:list', d),
  postCarryover:      (d)    => ipcRenderer.invoke('carryover:post', d),
  deleteCarryover:    (id)   => ipcRenderer.invoke('carryover:delete', id),
  autoComputeCarryover:(d)   => ipcRenderer.invoke('carryover:auto-compute', d),
  regenerateStudentBills:(d)  => ipcRenderer.invoke('bills:regenerate-student', d),

  // ── Payments
  nextReceiptNumber:  ()     => ipcRenderer.invoke('payments:next-receipt'),
  postPayment:        (d)    => ipcRenderer.invoke('payments:post', d),
  listPayments:       (f)    => ipcRenderer.invoke('payments:list', f),
  getPayment:         (id)   => ipcRenderer.invoke('payments:get', id),
  deletePayment:      (id)   => ipcRenderer.invoke('payments:delete', id),
  reversePayment:     (d)    => ipcRenderer.invoke('payments:reverse', d),
  getReceiptData:     (id)   => ipcRenderer.invoke('payments:receipt-data', id),
  bulkReceiptData:    (d)    => ipcRenderer.invoke('payments:bulk-receipt-data', d),
  listDebtors:        (f)    => ipcRenderer.invoke('debtors:list', f),

  // ── Reports
  getDashboardData:   ()     => ipcRenderer.invoke('reports:dashboard'),
  getAccountReport:   (f)    => ipcRenderer.invoke('reports:account', f),
  getCollectionSummary: (f)  => ipcRenderer.invoke('reports:collection-summary', f),
  getClassFeeStatus:  (f)    => ipcRenderer.invoke('reports:class-fee-status', f),
  getStudentLedger:   (f)    => ipcRenderer.invoke('reports:student-ledger', f),
  getTermEndReport:   (f)    => ipcRenderer.invoke('reports:term-end', f),
  getPaymentAudit:    (f)    => ipcRenderer.invoke('reports:payment-audit', f),

  // ── Auth
  login:              (d)    => ipcRenderer.invoke('auth:login', d),
  listUsers:          ()     => ipcRenderer.invoke('auth:list-users'),
  createUser:         (d)    => ipcRenderer.invoke('auth:create-user', d),
  updateUser:         (d)    => ipcRenderer.invoke('auth:update-user', d),
  deleteUser:         (id)   => ipcRenderer.invoke('auth:delete-user', id),
  changePassword:     (d)    => ipcRenderer.invoke('auth:change-password', d),
  resetRequest:       (d)    => ipcRenderer.invoke('auth:reset-request', d),
  resetApply:         (d)    => ipcRenderer.invoke('auth:reset-apply', d),

  // ── Activation & App State
  getActivationStatus:()     => ipcRenderer.invoke('activation:status'),
  activateLicense:    (d)    => ipcRenderer.invoke('activation:activate', d),
  getMachineId:       ()     => ipcRenderer.invoke('activation:get-machine-id'),
  unlockAccounting:   (d)    => ipcRenderer.invoke('activation:unlock-accounting', d),
  unlockPayroll:      (d)    => ipcRenderer.invoke('activation:unlock-payroll', d),
  generatePayrollKey: (d)    => ipcRenderer.invoke('activation:generate-payroll-key', d),
  generateAccountingKey:(d)  => ipcRenderer.invoke('activation:generate-accounting-key', d),
  getAppState:        (k)    => ipcRenderer.invoke('app-state:get', k),
  setAppState:        (k,v)  => ipcRenderer.invoke('app-state:set', k, v),

  // ── Import
  importStudents:     (d)    => ipcRenderer.invoke('import:students', d),
  importOpeningBalances: (d) => ipcRenderer.invoke('import:opening-balances', d),

  // ── Communications
  listSmsProviders:   ()     => ipcRenderer.invoke('sms:list-providers'),
  sendSms:            (d)    => ipcRenderer.invoke('sms:send', d),
  sendBulkSms:        (d)    => ipcRenderer.invoke('sms:bulk-send', d),
  getSmsLog:          (d)    => ipcRenderer.invoke('sms:log', d),
  getSmsLogFull:      (d)    => ipcRenderer.invoke('sms:log-full', d),
  smsResend:          (d)    => ipcRenderer.invoke('sms:resend', d),
  smsUpdateResend:    (d)    => ipcRenderer.invoke('sms:update-phone-resend', d),
  testSms:            (d)    => ipcRenderer.invoke('sms:test', d),
  sendEmail:          (d)    => ipcRenderer.invoke('email:send', d),
  sendEmailReceipt:   (d)    => ipcRenderer.invoke('email:send-receipt', d),
  sendBillEmail:      (d)    => ipcRenderer.invoke('email:send-bill', d),
  sendBillEmailsBulk: (d)    => ipcRenderer.invoke('email:send-bills-bulk', d),
  backupNow:          ()     => ipcRenderer.invoke('backup:now'),
  listLocalBackups:   ()     => ipcRenderer.invoke('backup:list-local'),
  testEmail:          (d)    => ipcRenderer.invoke('email:test', d),
  getEmailLog:        (d)    => ipcRenderer.invoke('email:log', d),
  getEmailLogFull:    (d)    => ipcRenderer.invoke('email:log-full', d),
  emailResend:        (d)    => ipcRenderer.invoke('email:resend', d),
  emailUpdateResend:  (d)    => ipcRenderer.invoke('email:update-address-resend', d),
  carryCredit:        (d)    => ipcRenderer.invoke('payments:carry-credit', d),

  // ── Accounting
  listAccounts:       ()     => ipcRenderer.invoke('accounts:list'),
  createAccount:      (d)    => ipcRenderer.invoke('accounts:create', d),
  updateAccount:      (d)    => ipcRenderer.invoke('accounts:update', d),
  deleteAccount:      (id)   => ipcRenderer.invoke('accounts:delete', id),
  listJournal:        (f)    => ipcRenderer.invoke('journal:list', f),
  getJournalEntry:    (id)   => ipcRenderer.invoke('journal:get', id),
  postJournalEntry:   (d)    => ipcRenderer.invoke('journal:post', d),
  getAccountStatement:(d)    => ipcRenderer.invoke('accounts:statement', d),
  getTrialBalance:    ()     => ipcRenderer.invoke('accounts:trial-balance'),
  getLedger:          (d)    => ipcRenderer.invoke('accounts:ledger', d),
  listInvoices:       ()     => ipcRenderer.invoke('invoices:list'),
  getInvoice:         (id)   => ipcRenderer.invoke('invoices:get', id),
  createInvoice:      (d)    => ipcRenderer.invoke('invoices:create', d),
  updateInvoiceStatus:(d)    => ipcRenderer.invoke('invoices:update-status', d),
  deleteInvoice:      (id)   => ipcRenderer.invoke('invoices:delete', id),

  // ── Inventory
  inventoryCategoriesList: ()     => ipcRenderer.invoke('inventory:categories-list'),
  inventoryCategorySave:   (d)    => ipcRenderer.invoke('inventory:category-save', d),
  inventoryCategoryDelete: (id)   => ipcRenderer.invoke('inventory:category-delete', id),
  inventoryItemsList:      (d)    => ipcRenderer.invoke('inventory:items-list', d),
  inventoryItemGet:        (id)   => ipcRenderer.invoke('inventory:item-get', id),
  inventoryItemSave:       (d)    => ipcRenderer.invoke('inventory:item-save', d),
  inventoryItemDelete:     (id)   => ipcRenderer.invoke('inventory:item-delete', id),
  inventoryTransactionsList:(d)   => ipcRenderer.invoke('inventory:transactions-list', d),
  inventoryTransact:       (d)    => ipcRenderer.invoke('inventory:transact', d),
  inventoryTransactionDelete:(id) => ipcRenderer.invoke('inventory:transaction-delete', id),
  inventoryLowStock:       ()     => ipcRenderer.invoke('inventory:low-stock'),
  inventoryValuation:      (d)    => ipcRenderer.invoke('inventory:valuation', d),
  unlockInventory:         (d)    => ipcRenderer.invoke('activation:unlock-inventory', d),
  generateInventoryKey:    (d)    => ipcRenderer.invoke('activation:generate-inventory-key', d),

  // ── Expenses
  expenseSuppliersList:   (d)    => ipcRenderer.invoke('expenses:suppliers-list', d),
  expenseSupplierSave:    (d)    => ipcRenderer.invoke('expenses:supplier-save', d),
  expenseSupplierDelete:  (id)   => ipcRenderer.invoke('expenses:supplier-delete', id),
  expenseCategoriesList:  ()     => ipcRenderer.invoke('expenses:categories-list'),
  expenseCategorySave:    (d)    => ipcRenderer.invoke('expenses:category-save', d),
  expenseCategoryDelete:  (id)   => ipcRenderer.invoke('expenses:category-delete', id),
  expensesList:           (d)    => ipcRenderer.invoke('expenses:list', d),
  expenseGet:             (id)   => ipcRenderer.invoke('expenses:get', id),
  expenseSave:            (d)    => ipcRenderer.invoke('expenses:save', d),
  expenseApprove:         (d)    => ipcRenderer.invoke('expenses:approve', d),
  expenseReject:          (d)    => ipcRenderer.invoke('expenses:reject', d),
  expenseMarkPaid:        (d)    => ipcRenderer.invoke('expenses:mark-paid', d),
  expenseDelete:          (id)   => ipcRenderer.invoke('expenses:delete', id),
  expensesReport:         (d)    => ipcRenderer.invoke('expenses:report', d),

  // ── Payroll
  payrollGradesList:      ()     => ipcRenderer.invoke('payroll:grades-list'),
  payrollGradeSave:       (d)    => ipcRenderer.invoke('payroll:grade-save', d),
  payrollGradeDelete:     (id)   => ipcRenderer.invoke('payroll:grade-delete', id),
  payrollStaffList:       (d)    => ipcRenderer.invoke('payroll:staff-list', d),
  payrollStaffGet:        (id)   => ipcRenderer.invoke('payroll:staff-get', id),
  payrollStaffSave:       (d)    => ipcRenderer.invoke('payroll:staff-save', d),
  payrollStaffToggle:     (id)   => ipcRenderer.invoke('payroll:staff-toggle-active', id),
  payrollDeductionsList:  (d)    => ipcRenderer.invoke('payroll:deductions-list', d),
  payrollDeductionSave:   (d)    => ipcRenderer.invoke('payroll:deduction-save', d),
  payrollDeductionDelete: (id)   => ipcRenderer.invoke('payroll:deduction-delete', id),
  payrollRunsList:        ()     => ipcRenderer.invoke('payroll:runs-list'),
  payrollRunGet:          (id)   => ipcRenderer.invoke('payroll:run-get', id),
  payrollRunPreview:      (d)    => ipcRenderer.invoke('payroll:run-preview', d),
  payrollRunCreate:       (d)    => ipcRenderer.invoke('payroll:run-create', d),
  payrollRunApprove:      (d)    => ipcRenderer.invoke('payroll:run-approve', d),
  payrollRunMarkPaid:     (id)   => ipcRenderer.invoke('payroll:run-mark-paid', id),
  payrollRunDelete:       (id)   => ipcRenderer.invoke('payroll:run-delete', id),
  payrollPayslipHtml:     (d)    => ipcRenderer.invoke('payroll:payslip-html', d),
  payrollSummaryHtml:     (id)   => ipcRenderer.invoke('payroll:summary-html', id),

  // ── System Errors
  errorsList:           (d)  => ipcRenderer.invoke('errors:list', d),
  errorsResolve:        (d)  => ipcRenderer.invoke('errors:resolve', d),
  errorsResolveAll:     ()   => ipcRenderer.invoke('errors:resolve-all'),
  errorsDelete:         (id) => ipcRenderer.invoke('errors:delete', id),
  errorsClearResolved:  ()   => ipcRenderer.invoke('errors:clear-resolved'),
  errorsCountUnresolved:()   => ipcRenderer.invoke('errors:count-unresolved'),

  // ── User Guides (bundled PDFs)
  guidesList:           ()   => ipcRenderer.invoke('guides:list'),
  guidesOpen:           (f)  => ipcRenderer.invoke('guides:open', f),

  // ── Bulk Import (from JSON produced by parsing client spreadsheets)
  importPickFile:       ()   => ipcRenderer.invoke('import:pick-file'),
  importPreview:        (p)  => ipcRenderer.invoke('import:preview', p),
  importExecute:        (d)  => ipcRenderer.invoke('import:execute', d),

  // ── Backup
  getDbPath:          ()     => ipcRenderer.invoke('backup:get-db-path'),
  backupLocal:        ()     => ipcRenderer.invoke('backup:local'),
  restoreLocal:       ()     => ipcRenderer.invoke('backup:restore-local'),
  reloadApp:          ()     => ipcRenderer.invoke('backup:reload-app'),
  getSyncFolder:      ()     => ipcRenderer.invoke('backup:get-sync-folder'),
  setSyncFolder:      (d)    => ipcRenderer.invoke('backup:set-sync-folder', d),
  pickSyncFolder:     ()     => ipcRenderer.invoke('backup:pick-sync-folder'),
  syncNow:            ()     => ipcRenderer.invoke('backup:sync-now'),

  // ── Google Drive Backup
  gdriveStatus:       ()     => ipcRenderer.invoke('gdrive:status'),
  gdriveGetClientId:  ()     => ipcRenderer.invoke('gdrive:get-client-id'),
  gdriveSaveCreds:    (d)    => ipcRenderer.invoke('gdrive:save-credentials', d),
  gdriveConnect:      ()     => ipcRenderer.invoke('gdrive:connect'),
  gdriveDisconnect:   ()     => ipcRenderer.invoke('gdrive:disconnect'),
  gdriveBackup:       ()     => ipcRenderer.invoke('gdrive:backup'),
  gdriveListBackups:  ()     => ipcRenderer.invoke('gdrive:list-backups'),
  gdriveRestore:      (d)    => ipcRenderer.invoke('gdrive:restore', d),

  // ── Auto-backup Scheduler
  schedulerGetConfig: ()     => ipcRenderer.invoke('scheduler:get-config'),
  schedulerSaveConfig:(d)    => ipcRenderer.invoke('scheduler:save-config', d),
  schedulerRunNow:    ()     => ipcRenderer.invoke('scheduler:run-now'),

  // ── Utility
  openPath:           (p)    => ipcRenderer.invoke('shell:open-path', p),
  openExternal:       (url)  => ipcRenderer.invoke('shell:open-external', url),
  getAppVersion:      ()     => ipcRenderer.invoke('app:version'),
  checkUpdate:        ()     => ipcRenderer.invoke('app:check-update'),
  getDbDir:           ()     => ipcRenderer.invoke('app:get-db-dir'),
  printHtml:          (d)    => ipcRenderer.invoke('app:print-html', d),
  setContentProtection: (e) => ipcRenderer.invoke('app:set-content-protection', e),

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
