// P1-6 / P1-8: lists chart-of-accounts codes used more than once per company
// (the audit found 2000, 5101 and 5105). The unique (companyId, account_code)
// index cannot be created until these are merged by an accountant, so this
// only reports. Read-only.
//
//   node scripts/remediate/duplicate-account-codes.mjs --dry-run
import pg from 'pg'

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
const { rows } = await db.query(`
  SELECT a."companyId", a.account_code, a.id, a.account_name, a.account_type, a.is_active,
         (SELECT count(*)::int FROM journal_lines l WHERE l."accountId" = a.id) AS lines
  FROM chart_of_accounts a
  WHERE (a."companyId", a.account_code) IN (
    SELECT "companyId", account_code FROM chart_of_accounts
    WHERE account_code IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1)
  ORDER BY a."companyId", a.account_code, lines DESC`)
await db.end()
if (!rows.length) { console.log('No duplicate account codes.'); process.exit(0) }
console.log('company | code | account id | name | type | active | journal lines')
for (const r of rows) console.log(`${r.companyId} | ${r.account_code} | ${r.id} | ${r.account_name} | ${r.account_type} | ${r.is_active} | ${r.lines}`)
console.log(`\n${rows.length} accounts share a code. Merge each group (move journal lines to the account to keep, deactivate the rest), then apply the unique index migration.`)
