// A9.2: converts legacy Title-Case sales-invoice statuses to the one UPPERCASE
// vocabulary (Sent -> UNPAID, Partial -> PARTIAL, Paid -> PAID, Void -> VOID).
// The app already reads both spellings, so this only tidies the data.
//
// Dry run (default) prints what would change. --apply needs the owner's
// approval. It changes only the status text, never amounts; the status the
// app shows is still derived from the amounts (BUG-009), so an invoice
// stored as Paid with money owing keeps showing as owing.
//
//   node scripts/remediate/invoice-status.mjs --dry-run
//   node scripts/remediate/invoice-status.mjs --apply
import pg from 'pg'

const MAP = { Sent: 'UNPAID', Partial: 'PARTIAL', Paid: 'PAID', Void: 'VOID' }
const CANONICAL = ['UNPAID', 'PARTIAL', 'PAID', 'VOID']
const apply = process.argv.includes('--apply')

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
const { rows } = await db.query(`SELECT coalesce(status, '(null)') AS status, count(*)::int AS n FROM sales_invoices GROUP BY 1 ORDER BY 2 DESC`)
console.log('Current sales invoice statuses:')
for (const r of rows) {
  const to = MAP[r.status]
  console.log(`  ${r.status.padEnd(10)} ${String(r.n).padStart(6)}  ${to ? `-> ${to}` : CANONICAL.includes(r.status) ? '(already canonical)' : '(unknown: left as is, review by hand)'}`)
}
const toChange = rows.filter((r) => MAP[r.status]).reduce((s, r) => s + r.n, 0)
if (!apply) {
  console.log(`\nDry run: ${toChange} invoice(s) would change. Nothing was changed.`)
} else {
  await db.query('BEGIN')
  let changed = 0
  for (const [from, to] of Object.entries(MAP)) {
    const r = await db.query(`UPDATE sales_invoices SET status = $2, updated_date = now()::text WHERE status = $1`, [from, to])
    changed += r.rowCount
  }
  await db.query('COMMIT')
  console.log(`\nApplied: ${changed} invoice(s) changed.`)
}
await db.end()
