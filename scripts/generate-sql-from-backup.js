const fs = require('fs')
const path = require('path')

const backupPath = path.join(__dirname, '..', 'db-backup', 'ravenshield_backup.json')
const outDir = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init')
const outFile = path.join(outDir, 'data_import.sql')

function sqlEscape(val) {
  if (val === null || typeof val === 'undefined') return 'NULL'
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL'
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  return `'${String(val).replace(/'/g, "''")}'`
}

function toColumnList(obj) {
  return Object.keys(obj).map(k => `"${k}"`).join(', ')
}

function toValuesList(obj) {
  return Object.values(obj).map(v => sqlEscape(v)).join(', ')
}

function ensureOutDir() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

function writeSql(sql) {
  fs.writeFileSync(outFile, sql, 'utf8')
  console.log(`Wrote SQL to ${outFile}`)
}

function generate() {
  if (!fs.existsSync(backupPath)) {
    console.error('Backup file not found at', backupPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(backupPath, 'utf8')
  const data = JSON.parse(raw)

  const tableMap = {
    settings: 'companies',
    chartOfAccounts: 'chart_of_accounts',
    employees: 'guards',
    bankAccounts: 'bank_accounts',
    invoices: 'sales_invoices',
    journalEntries: 'journal_entries',
    journalLines: 'journal_lines',
    invoiceLineItems: 'invoice_line_items',
    payslips: 'payslips',
    payslipLines: 'payslip_lines',
    customers: 'customers',
    suppliers: 'suppliers',
    attendance: 'attendance',
    equipment: 'equipment',
    sites: 'sites',
    payments: 'payments'
  }

  ensureOutDir()

  let sql = ''
  sql += '-- Data import generated from db-backup/ravenshield_backup.json\n'
  sql += 'BEGIN;\n\n'

  function writeTableInserts(backupKey, targetTable) {
    const records = data[backupKey] || data[backupKey.toLowerCase()] || []
    if (!records || !records.length) return
    const table = targetTable || tableMap[backupKey] || backupKey
    for (const rec of records) {
      const columns = toColumnList(rec)
      const values = toValuesList(rec)
      const insert = `INSERT INTO "${table}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`
      sql += insert
    }
    sql += '\n'
  }

  const preferredOrder = [
    'settings',
    'customers',
    'suppliers',
    'chartOfAccounts',
    'employees',
    'sites',
    'bankAccounts',
    'invoices',
    'invoiceLineItems',
    'journalEntries',
    'journalLines',
    'payments',
    'payslips',
    'attendance',
    'equipment'
  ]

  for (const key of preferredOrder) {
    const backupKey = Object.prototype.hasOwnProperty.call(data, key) ? key : Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase())
    if (!backupKey) continue
    const target = tableMap[key] || tableMap[backupKey] || undefined
    writeTableInserts(backupKey, target)
  }

  for (const key of Object.keys(data)) {
    if (preferredOrder.some(k => k.toLowerCase() === key.toLowerCase())) continue
    writeTableInserts(key, tableMap[key])
  }

  sql += 'COMMIT;\n'

  writeSql(sql)
}

generate()
