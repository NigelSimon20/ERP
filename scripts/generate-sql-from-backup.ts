import fs from 'fs'
import path from 'path'

const backupPath = path.join(__dirname, '..', 'db-backup', 'ravenshield_backup.json')
const outDir = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init')
const outFile = path.join(outDir, 'data_import.sql')

function sqlEscape(val: any): string {
  if (val === null || typeof val === 'undefined') return 'NULL'
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL'
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  // string
  return `'${String(val).replace(/'/g, "''")}'`
}

function toColumnList(obj: Record<string, any>) {
  return Object.keys(obj).map(k => `"${k}"`).join(', ')
}

function toValuesList(obj: Record<string, any>) {
  return Object.values(obj).map(v => sqlEscape(v)).join(', ')
}

function ensureOutDir() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
}

function writeSql(sql: string) {
  fs.writeFileSync(outFile, sql, 'utf8')
  console.log(`Wrote SQL to ${outFile}`)
}

function generate() {
  if (!fs.existsSync(backupPath)) {
    console.error('Backup file not found at', backupPath)
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'))

  // Order matters to satisfy FK constraints
  const tableOrder = [
    'settings',
    'companies',
    'customers',
    'suppliers',
    'chartOfAccounts',
    'chart_of_accounts',
    'guards',
    'employees',
    'sites',
    'bankAccounts',
    'bank_accounts',
    'sales_invoices',
    'invoices',
    'invoice_line_items',
    'journal_entries',
    'journal_entries',
    'journalLines',
    'journal_lines',
    'payments',
    'payslips',
    'payslip_lines',
    'attendance',
    'equipment'
  ]

  // Map backup keys to target SQL table names
  const tableMap: Record<string, string> = {
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
    payments: 'payments',
    chart_of_accounts: 'chart_of_accounts'
  }

  ensureOutDir()

  let sql = ''
  sql += '-- Data import generated from db-backup/ravenshield_backup.json\n'
  sql += 'BEGIN;\n\n'

  // Helper to write inserts for an array
  function writeTableInserts(backupKey: string, targetTable?: string) {
    const records: any[] = data[backupKey] || data[backupKey.toLowerCase()] || []
    if (!records || !records.length) return
    const table = targetTable || tableMap[backupKey] || backupKey
    for (const rec of records) {
      const columns = toColumnList(rec)
      const values = toValuesList(rec)
      // Use ON CONFLICT DO NOTHING to avoid duplicate constraint errors on re-run
      const insert = `INSERT INTO "${table}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`
      sql += insert
    }
    sql += '\n'
  }

  // Preferential explicit order using known backup keys
  const preferredOrder = [
    'settings',
    'customers',
    'suppliers',
    'chartOfAccounts',
    'employees',
    'sites',
    'bankAccounts',
    'sales_invoices',
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
    // fallback to lowercase key if necessary
    const backupKey = Object.prototype.hasOwnProperty.call(data, key) ? key : Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase())
    if (!backupKey) continue
    const target = tableMap[key] || tableMap[backupKey] || undefined
    writeTableInserts(backupKey!, target)
  }

  // e.g., any remaining keys not handled
  for (const key of Object.keys(data)) {
    if (preferredOrder.some(k => k.toLowerCase() === key.toLowerCase())) continue
    writeTableInserts(key, tableMap[key])
  }

  sql += 'COMMIT;\n'

  writeSql(sql)
}

generate()
