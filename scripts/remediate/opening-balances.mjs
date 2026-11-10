// P1-3 / P1-8: post the missing opening-balance journals.
//
//   node scripts/remediate/opening-balances.mjs --dry-run
//   node scripts/remediate/opening-balances.mjs --apply      # OWNER APPROVAL REQUIRED
//
// For every GL account with a non-zero opening_balance and no opening
// journal yet (reference JE-OB-<code>), posts Dr account / Cr 3050 Opening
// Balance Equity (sides swap for a negative amount or a credit-normal
// account). Creates 3050 if missing. Leaves current_balance alone: run
// recompute-balances.mjs afterwards. Uses DIRECT_URL.
import pg from 'pg'
import crypto from 'crypto'

const apply = process.argv.includes('--apply')
if (!apply && !process.argv.includes('--dry-run')) {
  console.error('Pass --dry-run to report, or --apply (with owner approval) to write.')
  process.exit(2)
}
const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()

const { rows } = await db.query(`
  SELECT a.id, a."companyId", a.account_code, a.account_name, a.account_type, round(a.opening_balance::numeric, 2) AS amount
  FROM chart_of_accounts a
  WHERE COALESCE(a.opening_balance, 0) <> 0 AND a.account_code IS DISTINCT FROM '3050'
    AND NOT EXISTS (SELECT 1 FROM journal_entries e WHERE e."companyId" = a."companyId" AND e.reference = 'JE-OB-' || a.account_code AND e.status = 'POSTED')
  ORDER BY a."companyId", a.account_code`)

console.log('company | code | name | type | opening balance | journal to post')
for (const r of rows) {
  const debitNormal = ['ASSET', 'EXPENSE'].includes(r.account_type)
  const positive = Number(r.amount) > 0
  const accountSide = debitNormal === positive ? 'Dr' : 'Cr'
  console.log(`${r.companyId} | ${r.account_code} | ${r.account_name} | ${r.account_type} | ${r.amount} | ${accountSide} ${r.account_code} / ${accountSide === 'Dr' ? 'Cr' : 'Dr'} 3050  ${Math.abs(r.amount).toFixed(2)}`)
}
console.log(`\n${rows.length} opening balance(s) without a journal.`)

if (apply && rows.length) {
  await db.query('BEGIN')
  const equityByCompany = new Map()
  for (const r of rows) {
    let equityId = equityByCompany.get(r.companyId)
    if (!equityId) {
      const found = await db.query(`SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND account_code = '3050' AND account_type = 'EQUITY' LIMIT 1`, [r.companyId])
      equityId = found.rows[0]?.id
      if (!equityId) {
        equityId = crypto.randomUUID()
        await db.query(`INSERT INTO chart_of_accounts (id, "companyId", account_code, account_name, account_type, account_subtype, is_active, current_balance, created_date, updated_date)
                        VALUES ($1, $2, '3050', 'Opening Balance Equity', 'EQUITY', 'Equity', true, 0, now()::text, now()::text)`, [equityId, r.companyId])
      }
      equityByCompany.set(r.companyId, equityId)
    }
    const amount = Math.abs(Number(r.amount)).toFixed(2)
    const debitNormal = ['ASSET', 'EXPENSE'].includes(r.account_type)
    const accountIsDebit = debitNormal === Number(r.amount) > 0
    const jeId = crypto.randomUUID()
    await db.query(`INSERT INTO journal_entries (id, "companyId", reference, entry_date, description, total_debit, total_credit, is_balanced, status, source_type, source_id, created_date)
                    VALUES ($1, $2, $3, now()::text, $4, $5, $5, true, 'POSTED', 'openingBalance', $6, now()::text)`,
      [jeId, r.companyId, `JE-OB-${r.account_code}`, `Opening balance — ${r.account_code} ${r.account_name}`, amount, r.id])
    await db.query(`INSERT INTO journal_lines (id, "journalEntryId", "accountId", description, debit, credit) VALUES ($1, $2, $3, 'Opening balance', $4, $5), ($6, $2, $7, 'Opening balance', $5, $4)`,
      [crypto.randomUUID(), jeId, r.id, accountIsDebit ? amount : 0, accountIsDebit ? 0 : amount, crypto.randomUUID(), equityId])
  }
  await db.query('COMMIT')
  console.log(`Applied: posted ${rows.length} opening-balance journal(s). Now run recompute-balances.mjs.`)
} else {
  console.log('Dry run: nothing was written.')
}
await db.end()
