// P1-3 / P1-8: recompute stored balances from the ledger.
//
//   node scripts/remediate/recompute-balances.mjs --dry-run   # report before/after
//   node scripts/remediate/recompute-balances.mjs --apply     # OWNER APPROVAL REQUIRED
//
// GL accounts: current_balance := signed sum of POSTED journal lines.
// Bank accounts: current_balance := balance of the linked GL account.
// Run after the opening-balance journals are posted (opening-balances.mjs),
// otherwise banks would be reset to their transactions only. Uses DIRECT_URL.
import pg from 'pg'

const apply = process.argv.includes('--apply')
if (!apply && !process.argv.includes('--dry-run')) {
  console.error('Pass --dry-run to report, or --apply (with owner approval) to write.')
  process.exit(2)
}
const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()

const LEDGER = `
  SELECT a.id, a."companyId", a.account_code, a.account_name, a.account_type,
         COALESCE(a.current_balance, 0)::numeric AS stored,
         COALESCE(SUM(CASE WHEN a.account_type IN ('ASSET', 'EXPENSE') THEN l.debit - l.credit ELSE l.credit - l.debit END), 0)::numeric AS ledger
  FROM chart_of_accounts a
  LEFT JOIN journal_lines l ON l."accountId" = a.id
    AND EXISTS (SELECT 1 FROM journal_entries e WHERE e.id = l."journalEntryId" AND e.status = 'POSTED' AND e."companyId" = a."companyId")
  GROUP BY a.id`

const gl = (await db.query(`SELECT * FROM (${LEDGER}) x WHERE stored <> ledger ORDER BY "companyId", account_code`)).rows
const banks = (await db.query(`
  SELECT b.id, b."companyId", coalesce(b.account_name, b.bank_name) AS name, b.currency,
         COALESCE(b.current_balance, 0)::numeric AS stored, x.ledger, x.account_code
  FROM bank_accounts b JOIN (${LEDGER}) x ON x.id = b.chart_account_id
  WHERE COALESCE(b.current_balance, 0) <> x.ledger ORDER BY b."companyId", name`)).rows

console.log(`## GL accounts whose stored balance differs from the ledger: ${gl.length}`)
console.log('company | code | name | stored (before) | ledger (after) | difference')
for (const r of gl) console.log(`${r.companyId} | ${r.account_code} | ${r.account_name} | ${r.stored} | ${r.ledger} | ${(r.stored - r.ledger).toFixed(2)}`)
console.log(`\n## Bank accounts whose balance differs from their GL account: ${banks.length}`)
console.log('company | bank | currency | stored (before) | GL (after) | difference')
for (const r of banks) console.log(`${r.companyId} | ${r.name} | ${r.currency} | ${r.stored} | ${r.ledger} | ${(r.stored - r.ledger).toFixed(2)}`)

// Accounts whose name names a currency other than the one recorded
// (e.g. "1011 Bank Control Account ZWG" stored as USD). Fixed by hand.
const mislabelled = (await db.query(`
  SELECT "companyId", account_code, account_name, currency FROM chart_of_accounts
  WHERE (account_name ~* '\\m(ZWG|ZWL|ZAR|GBP|EUR|BWP)\\M') AND upper(coalesce(currency, 'USD')) <> upper(substring(account_name from '(?i)\\m(ZWG|ZWL|ZAR|GBP|EUR|BWP)\\M'))`)).rows
console.log(`\n## Accounts named for one currency but recorded in another: ${mislabelled.length}`)
for (const r of mislabelled) console.log(`${r.companyId} | ${r.account_code} | ${r.account_name} | recorded as ${r.currency}`)

if (apply) {
  await db.query('BEGIN')
  for (const r of gl) await db.query('UPDATE chart_of_accounts SET current_balance = $1 WHERE id = $2', [r.ledger, r.id])
  for (const r of banks) await db.query('UPDATE bank_accounts SET current_balance = $1 WHERE id = $2', [r.ledger, r.id])
  await db.query('COMMIT')
  console.log(`\nApplied: ${gl.length} GL account(s), ${banks.length} bank account(s).`)
} else {
  console.log('\nDry run: nothing was written.')
}
await db.end()
