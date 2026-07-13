const fs = require('fs')
const path = require('path')

const sqlFile = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'data_import.sql')

function validateSQL() {
  if (!fs.existsSync(sqlFile)) {
    console.error('SQL file not found at', sqlFile)
    process.exit(1)
  }

  const sql = fs.readFileSync(sqlFile, 'utf8')
  const lines = sql.split('\n')

  console.log('🔍 DRY-RUN VALIDATION\n')
  console.log(`📄 File: ${sqlFile}`)
  console.log(`📊 Total lines: ${lines.length}\n`)

  // Parse INSERT statements
  const insertRegex = /INSERT INTO "(\w+)"\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*ON CONFLICT/gis
  const inserts = []
  let match

  while ((match = insertRegex.exec(sql)) !== null) {
    const table = match[1]
    const columns = match[2].split(',').map(c => c.trim().replace(/"/g, '')).filter(c => c)
    const values = match[3]

    inserts.push({
      table,
      columnCount: columns.length,
      columns,
      rowNum: inserts.length + 1
    })
  }

  console.log(`✅ Found ${inserts.length} INSERT statements\n`)

  // Group by table
  const byTable = {}
  for (const insert of inserts) {
    if (!byTable[insert.table]) byTable[insert.table] = []
    byTable[insert.table].push(insert)
  }

  console.log('📋 INSERT count by table:')
  for (const [table, rows] of Object.entries(byTable)) {
    console.log(`  ${table}: ${rows.length} rows`)
  }

  // Check for FK ordering (basic)
  const tableOrder = [
    'companies', 'customers', 'suppliers',
    'chart_of_accounts', 'guards', 'sites', 'bank_accounts',
    'sales_invoices', 'invoice_line_items',
    'journal_entries', 'journal_lines',
    'payments', 'payslips', 'attendance', 'equipment'
  ]

  console.log('\n🔗 Foreign Key Dependency Order Check:')
  let prevIdx = -1
  let orderOk = true
  for (const [table, rows] of Object.entries(byTable)) {
    const idx = tableOrder.indexOf(table)
    if (idx === -1) {
      console.log(`  ⚠️  ${table}: Unknown table (may be OK if not in schema)`)
      continue
    }
    if (idx < prevIdx) {
      console.log(`  ❌ ${table}: Out of order (expected after previous tables)`)
      orderOk = false
    } else {
      console.log(`  ✅ ${table}: OK`)
    }
    prevIdx = Math.max(prevIdx, idx)
  }

  // Check syntax
  console.log('\n🔍 Syntax Validation:')
  const hasBegin = sql.includes('BEGIN;')
  const hasCommit = sql.includes('COMMIT;')
  const hasOnConflict = sql.match(/ON CONFLICT DO NOTHING/g)

  console.log(`  ${hasBegin ? '✅' : '❌'} BEGIN; statement`)
  console.log(`  ${hasCommit ? '✅' : '❌'} COMMIT; statement`)
  console.log(`  ${hasOnConflict ? '✅' : '❌'} ON CONFLICT DO NOTHING (${hasOnConflict ? hasOnConflict.length : 0} times)`)

  // Estimate data size
  const sqlSize = sql.length / 1024 / 1024
  console.log(`\n💾 SQL Size: ${sqlSize.toFixed(2)} MB`)

  // Summary
  console.log('\n' + '='.repeat(50))
  if (orderOk && hasBegin && hasCommit) {
    console.log('✨ DRY-RUN PASSED - SQL appears valid')
    console.log(`📦 Ready to import ${inserts.length} records into Supabase`)
  } else {
    console.log('⚠️  DRY-RUN COMPLETE - Review warnings above')
  }
  console.log('='.repeat(50))

  console.log('\n🚀 Next steps:')
  console.log('1. Copy the SQL file: prisma/migrations/20260624000000_init/data_import.sql')
  console.log('2. Open Supabase dashboard → SQL Editor')
  console.log('3. Paste the entire SQL content and execute')
  console.log('4. Or use: psql $DATABASE_URL < prisma/migrations/20260624000000_init/data_import.sql')
}

validateSQL()
