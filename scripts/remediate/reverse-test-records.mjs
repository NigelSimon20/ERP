// P1-8: find and reverse the QA audit's test data.
//
//   node scripts/remediate/reverse-test-records.mjs --dry-run
//   node scripts/remediate/reverse-test-records.mjs --apply    # OWNER APPROVAL REQUIRED
//
// Matches "TEST - QA" / "TEST-QA" / "ZZTEST" names plus the document numbers
// listed in the audit. --apply never deletes: posted journals get a
// reversing journal (REV-<reference>, originals stay for the audit trail),
// documents are voided, master records deactivated. Run
// recompute-balances.mjs afterwards. Uses DIRECT_URL.
import pg from 'pg'
import crypto from 'crypto'

const apply = process.argv.includes('--apply')
if (!apply && !process.argv.includes('--dry-run')) {
  console.error('Pass --dry-run to report, or --apply (with owner approval) to write.')
  process.exit(2)
}
const TEST = `~* '(TEST[ -]*-?[ -]*QA|ZZTEST)'`
const range = (prefix, from, to, pad) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(pad, '0')}`)
const NUMBERS = {
  invoices: range('INV-', 46, 50, 6),
  receipts: range('REC-', 86, 89, 6),
  payments: ['PAY-000055'],
  journals: range('RS-JE-', 508, 514, 6),
  transfers: ['RS-TRF-000005'],
  employees: range('EMP-', 332, 337, 4),
}

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
const q = async (sql, args = []) => (await db.query(sql, args)).rows

const found = {
  customers: await q(`SELECT id, "companyId", company_name AS label FROM customers WHERE company_name ${TEST}`),
  suppliers: await q(`SELECT id, "companyId", company_name AS label FROM suppliers WHERE company_name ${TEST}`),
  guards: await q(`SELECT id, "companyId", coalesce(employee_code, '') || ' ' || coalesce(full_name, '') AS label FROM guards WHERE full_name ${TEST} OR employee_code = ANY($1)`, [NUMBERS.employees]),
  sites: await q(`SELECT id, "companyId", site_name AS label FROM sites WHERE site_name ${TEST}`),
  bank_accounts: await q(`SELECT id, "companyId", coalesce(account_name, bank_name) AS label FROM bank_accounts WHERE coalesce(account_name, '') || coalesce(bank_name, '') ${TEST}`),
  contracts: await q(`SELECT id, "companyId", "contractNumber" || ' ' || title AS label FROM contracts WHERE title ${TEST}`),
  fixed_assets: await q(`SELECT id, "companyId", name AS label FROM fixed_assets WHERE name ${TEST}`),
  inventory_items: await q(`SELECT id, "companyId", "itemName" AS label FROM inventory_items WHERE "itemName" ${TEST}`),
  sales_invoices: await q(`SELECT id, "companyId", invoice_number AS label, journal_entry_id, status FROM sales_invoices WHERE invoice_number = ANY($1) OR coalesce(customer_name, '') ${TEST}`, [NUMBERS.invoices]),
  payments: await q(`SELECT id, "companyId", payment_number AS label, journal_entry_id, status FROM payments WHERE payment_number = ANY($1) OR coalesce(party_name, '') ${TEST}`, [[...NUMBERS.receipts, ...NUMBERS.payments]]),
  bank_transfers: await q(`SELECT id, reference AS label, "journalEntryId" AS journal_entry_id, status FROM bank_transfers WHERE reference = ANY($1)`, [NUMBERS.transfers]),
  incidents: await q(`SELECT id, "companyId", title AS label FROM incidents WHERE title ${TEST} OR description ${TEST}`),
  deployments: await q(`SELECT id, "companyId", coalesce(notes, id) AS label FROM deployments WHERE coalesce(notes, '') ${TEST}`),
  overtime_requests: await q(`SELECT id, "companyId", coalesce(reason, id) AS label FROM overtime_requests WHERE coalesce(reason, '') ${TEST}`),
}
// Journals to reverse: the listed numbers, plus any posted journal behind a
// test invoice, payment or transfer.
const linkedJe = [...found.sales_invoices, ...found.payments, ...found.bank_transfers].map((r) => r.journal_entry_id).filter(Boolean)
found.journal_entries = await q(`
  SELECT id, "companyId", reference AS label, status FROM journal_entries
  WHERE (reference = ANY($1) OR id = ANY($2)) AND status = 'POSTED'
    AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reference = 'REV-' || journal_entries.reference)`, [NUMBERS.journals, linkedJe])

let total = 0
for (const [table, rows] of Object.entries(found)) {
  console.log(`\n## ${table}: ${rows.length}`)
  for (const r of rows) console.log(`  ${r.id} | ${r.label}${r.status ? ` | ${r.status}` : ''}`)
  total += rows.length
}
console.log(`\n${total} test record(s) found.`)

if (!apply) {
  console.log('Dry run: nothing was written.')
  await db.end()
  process.exit(0)
}

await db.query('BEGIN')
for (const je of found.journal_entries) {
  const lines = await q(`SELECT "accountId", debit, credit, description FROM journal_lines WHERE "journalEntryId" = $1`, [je.id])
  const revId = crypto.randomUUID()
  const total = lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2)
  await db.query(`INSERT INTO journal_entries (id, "companyId", reference, entry_date, description, total_debit, total_credit, is_balanced, status, source_type, source_id, created_date)
                  VALUES ($1, $2, $3, now()::text, $4, $5, $5, true, 'POSTED', 'reversal', $6, now()::text)`,
    [revId, je.companyId, `REV-${je.label}`, `Reversal of QA test entry ${je.label}`, total, je.id])
  for (const l of lines) {
    await db.query(`INSERT INTO journal_lines (id, "journalEntryId", "accountId", description, debit, credit) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), revId, l.accountId, `Reversal: ${l.description ?? ''}`, l.credit, l.debit])
  }
}
await db.query(`UPDATE sales_invoices SET status = 'Void', updated_date = now()::text WHERE id = ANY($1)`, [found.sales_invoices.map((r) => r.id)])
await db.query(`UPDATE payments SET status = 'Void', updated_date = now()::text WHERE id = ANY($1)`, [found.payments.map((r) => r.id)])
await db.query(`UPDATE bank_transfers SET status = 'CANCELLED' WHERE id = ANY($1)`, [found.bank_transfers.map((r) => r.id)])
// Inventory items have no active flag: they are listed for manual review.
for (const t of ['customers', 'suppliers', 'sites', 'bank_accounts']) {
  await db.query(`UPDATE ${t} SET is_active = false WHERE id = ANY($1)`, [found[t].map((r) => r.id)])
}
await db.query(`UPDATE guards SET status = 'Terminated', is_active = false WHERE id = ANY($1)`, [found.guards.map((r) => r.id)])
await db.query(`UPDATE contracts SET status = 'TERMINATED' WHERE id = ANY($1)`, [found.contracts.map((r) => r.id)])
await db.query(`UPDATE fixed_assets SET status = 'DISPOSED' WHERE id = ANY($1)`, [found.fixed_assets.map((r) => r.id)])
await db.query(`UPDATE incidents SET status = 'CLOSED' WHERE id = ANY($1)`, [found.incidents.map((r) => r.id)])
await db.query(`UPDATE deployments SET status = 'CANCELLED' WHERE id = ANY($1)`, [found.deployments.map((r) => r.id)])
await db.query(`UPDATE overtime_requests SET status = 'REJECTED' WHERE id = ANY($1)`, [found.overtime_requests.map((r) => r.id)])
await db.query('COMMIT')
console.log(`Applied: ${found.journal_entries.length} reversing journal(s); documents voided and master records deactivated. Now run recompute-balances.mjs.`)
await db.end()
