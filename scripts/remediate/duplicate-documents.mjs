// P1-5 / P1-8: reports receipt/payment and invoice numbers used more than
// once per company, for an accountant to review. Never deletes or edits.
//
//   node scripts/remediate/duplicate-documents.mjs --dry-run
import pg from 'pg'

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
const sections = [
  ['Payments / receipts (payments.payment_number)', `
    SELECT "companyId", payment_number AS number, count(*)::int AS n,
           string_agg(id || ' ' || coalesce(payment_type, '') || ' ' || coalesce(amount::text, '') || ' ' || coalesce(payment_date, ''), '; ' ORDER BY created_date) AS rows
    FROM payments WHERE payment_number IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY n DESC, 2`],
  ['Sales invoices (sales_invoices.invoice_number)', `
    SELECT "companyId", invoice_number AS number, count(*)::int AS n,
           string_agg(id || ' ' || coalesce(status, '') || ' total ' || coalesce(total_amount::text, '') || ' paid ' || coalesce(amount_paid::text, ''), '; ' ORDER BY created_date) AS rows
    FROM sales_invoices WHERE invoice_number IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY n DESC, 2`],
]
let total = 0
for (const [title, q] of sections) {
  const { rows } = await db.query(q)
  console.log(`\n## ${title}: ${rows.length} duplicated number(s)`)
  for (const r of rows) console.log(`${r.number} x${r.n} (company ${r.companyId}): ${r.rows}`)
  total += rows.length
}
await db.end()
console.log(`\n${total} duplicated number(s) in total. Nothing was changed.`)
