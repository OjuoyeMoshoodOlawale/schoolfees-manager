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
  listDebtors:        (f)    => ipcRenderer.invoke('debtors:list', f),

  // ── Reports
  getDashboardData:   ()     => ipcRenderer.invoke('reports:dashboard'),
  getAccountReport:   (f)    => ipcRenderer.invoke('reports:account', f),

  // ── Auth
  login:              (d)    => ipcRenderer.invoke('auth:login', d),
  listUsers:          ()     => ipcRenderer.invoke('auth:list-users'),
  createUser:         (d)    => ipcRenderer.invoke('auth:create-user', d),
  updateUser:         (d)    => ipcRenderer.invoke('auth:update-user', d),
  deleteUser:         (id)   => ipcRenderer.invoke('auth:delete-user', id),
  changePassword:     (d)    => ipcRenderer.invoke('auth:change-password', d),

  // ── Activation & App State
  getActivationStatus:()     => ipcRenderer.invoke('activation:status'),
  activateLicense:    (d)    => ipcRenderer.invoke('activation:activate', d),
  getMachineId:       ()     => ipcRenderer.invoke('activation:get-machine-id'),
  getAppState:        (k)    => ipcRenderer.invoke('app-state:get', k),
  setAppState:        (k,v)  => ipcRenderer.invoke('app-state:set', k, v),

  // ── Import
  importStudents:     (d)    => ipcRenderer.invoke('import:students', d),

  // ── Communications
  listSmsProviders:   ()     => ipcRenderer.invoke('sms:list-providers'),
  sendSms:            (d)    => ipcRenderer.invoke('sms:send', d),
  sendBulkSms:        (d)    => ipcRenderer.invoke('sms:bulk-send', d),
  getSmsLog:          (d)    => ipcRenderer.invoke('sms:log', d),
  testSms:            (d)    => ipcRenderer.invoke('sms:test', d),
  sendEmail:          (d)    => ipcRenderer.invoke('email:send', d),
  sendEmailReceipt:   (d)    => ipcRenderer.invoke('email:send-receipt', d),
  testEmail:          (d)    => ipcRenderer.invoke('email:test', d),
  getEmailLog:        (d)    => ipcRenderer.invoke('email:log', d),

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

  // ── Backup
  getDbPath:          ()     => ipcRenderer.invoke('backup:get-db-path'),
  backupLocal:        ()     => ipcRenderer.invoke('backup:local'),
  restoreLocal:       ()     => ipcRenderer.invoke('backup:restore-local'),
  reloadApp:          ()     => ipcRenderer.invoke('backup:reload-app'),

  // ── Google Drive Backup
  gdriveStatus:       ()     => ipcRenderer.invoke('gdrive:status'),
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
  getAppVersion:      ()     => ipcRenderer.invoke('app:version'),
  checkUpdate:        ()     => ipcRenderer.invoke('app:check-update'),
  getDbDir:           ()     => ipcRenderer.invoke('app:get-db-dir'),
})
