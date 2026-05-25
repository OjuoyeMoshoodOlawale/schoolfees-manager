// ─── Default Seed Data ────────────────────────────────────────────────────────
// Edit this file to change what gets pre-loaded into new installations.
// All values here are INSERT OR IGNORE — they won't overwrite existing data.

module.exports = {

  // Default Nigerian secondary school classes
  // level determines promotion order (lower = junior)
  classes: [
    { name: 'JSS 1', level: 1 },
    { name: 'JSS 2', level: 2 },
    { name: 'JSS 3', level: 3 },
    { name: 'SS 1',  level: 4 },
    { name: 'SS 2',  level: 5 },
    { name: 'SS 3',  level: 6 },
  ],

  // Default fee items — schools can add/remove more
  feeItems: [
    { name: 'Tuition Fee',      description: 'Termly tuition fee' },
    { name: 'Sportswear',       description: 'Sports kit and equipment' },
    { name: 'Medical Levy',     description: 'School health/medical fund' },
    { name: 'Examination Fee',  description: 'Internal/external exam charges' },
    { name: 'PTA Levy',         description: "Parent-Teacher Association levy" },
    { name: 'ICT Fee',          description: 'Computer lab and tech resources' },
    { name: 'Library Fee',      description: 'Library resources and books' },
    { name: 'Development Levy', description: 'School development fund' },
    { name: 'Boarding Fee',     description: 'Hostel accommodation (boarding students)' },
    { name: 'Feeding Fee',      description: 'Cafeteria/feeding (boarding students)' },
    { name: 'Uniform Fee',      description: 'School uniform supply' },
    { name: 'Excursion Fee',    description: 'School trips and excursions' },
    { name: 'Caution Fee',      description: 'Refundable caution deposit' },
    { name: 'Acceptance Fee',   description: 'New student acceptance fee' },
  ],

  // Default chart of accounts for the accounting module
  accounts: [
    { code: '1001', name: 'Cash on Hand',        type: 'asset',    group: 'Current Assets' },
    { code: '1002', name: 'Bank Account',         type: 'asset',    group: 'Current Assets' },
    { code: '1003', name: 'Petty Cash',           type: 'asset',    group: 'Current Assets' },
    { code: '4001', name: 'School Fees Income',   type: 'income',   group: 'Revenue' },
    { code: '4002', name: 'Registration Income',  type: 'income',   group: 'Revenue' },
    { code: '4003', name: 'Other Income',         type: 'income',   group: 'Revenue' },
    { code: '5001', name: 'Staff Salaries',       type: 'expense',  group: 'Operating Expenses' },
    { code: '5002', name: 'Utilities',            type: 'expense',  group: 'Operating Expenses' },
    { code: '5003', name: 'Maintenance',          type: 'expense',  group: 'Operating Expenses' },
    { code: '5004', name: 'Stationery',           type: 'expense',  group: 'Operating Expenses' },
    { code: '5005', name: 'Transportation',       type: 'expense',  group: 'Operating Expenses' },
    { code: '5006', name: 'Miscellaneous',        type: 'expense',  group: 'Operating Expenses' },
    { code: '2001', name: 'Accounts Payable',     type: 'liability',group: 'Current Liabilities' },
    { code: '3001', name: 'Retained Earnings',    type: 'equity',   group: 'Equity' },
  ],

  // Default app settings
  settings: {
    currency_symbol:    '₦',
    currency_code:      'NGN',
    currency_name:      'Nigerian Naira',
    date_format:        'DD/MM/YYYY',
    receipt_footer:     'Thank you for your payment. This is a computer-generated receipt.',
    sms_enabled:        false,
    email_enabled:      false,
    auto_backup:        false,
    backup_time:        '23:00',
    thermal_width:      '80mm',    // 80mm or 58mm thermal
    print_copies:       1,
    accounting_enabled: false,     // unlocked by activation server
  },

  // Excel import template column order
  importTemplate: [
    'Last Name', 'First Name', 'Other Names', 'Gender (M/F)',
    'Date of Birth (DD/MM/YYYY)', 'Parent Name', 'Parent Phone',
    'Student Phone', 'Address', 'Boarding Type (day/boarding)',
    'Entry Type (new/returning)',
  ],

  // Nigerian currency presets
  currencies: [
    { symbol: '₦', code: 'NGN', name: 'Nigerian Naira' },
    { symbol: '$', code: 'USD', name: 'US Dollar' },
    { symbol: '£', code: 'GBP', name: 'British Pound' },
    { symbol: 'GH₵', code: 'GHS', name: 'Ghanaian Cedi' },
    { symbol: 'KES', code: 'KES', name: 'Kenyan Shilling' },
    { symbol: 'ZAR', code: 'ZAR', name: 'South African Rand' },
  ],
}
