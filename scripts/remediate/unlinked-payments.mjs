// A1: lists outgoing payments that say nothing about what they paid for
// (no bill, no supplier, payment_type "Other Payment") and/or have no linked
// journal, for a person to reclassify as a bill payment, an expense or a
// supplier advance. Report only: it never edits or deletes anything.
//
// Before A1, such payments posted Dr Accounts Payable / Cr bank without
// reducing any bill, so AP in the GL fell below what suppliers are owed. The
// "journal" column shows the auto journal found by reference (the old code
// created one but never stored its id on the payment).
//
//   node scripts/remediate/unlinked-payments.mjs --dry-run
import pg from 'pg'

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
const { rows } = await db.query(`
  SELECT p."companyId", c.company_name AS company, p.id, p.payment_number, p.payment_date, p.amount, p.party_name,
         p.payment_type, p.supplier_id, p.journal_entry_id,
         je.reference AS journal_reference, je.status AS journal_status,
         (SELECT string_agg(a.account_code || ' ' || coalesce(a.account_name, '') ||
                 CASE WHEN l.debit > 0 THEN ' Dr ' || l.debit ELSE ' Cr ' || l.credit END, '; ')
            FROM journal_lines l JOIN chart_of_accounts a ON a.id = l."accountId"
           WHERE l."journalEntryId" = je.id) AS journal_lines
  FROM payments p
  LEFT JOIN companies c ON c.id = p."companyId"
  LEFT JOIN journal_entries je ON je.id = p.journal_entry_id
       OR (p.journal_entry_id IS NULL AND je."companyId" = p."companyId" AND je.reference = 'JE-auto-' || p.payment_number)
  WHERE coalesce(p.payment_type, '') <> 'Customer Receipt'
    AND (p.journal_entry_id IS NULL
         OR (coalesce(p.payment_type, '') NOT IN ('Supplier Payment', 'Expense Payment', 'Supplier Advance') AND p.supplier_id IS NULL))
  ORDER BY c.company_name, p.payment_date, p.payment_number`)

let currentCompany = null
for (const r of rows) {
  if (r.companyId !== currentCompany) {
    currentCompany = r.companyId
    console.log(`\n## ${r.company ?? r.companyId}`)
  }
  const linked = r.journal_entry_id ? 'linked' : r.journal_reference ? 'found by reference, not linked' : 'NO JOURNAL'
  console.log(`${r.payment_number ?? r.id}  ${String(r.payment_date ?? '').slice(0, 10)}  ${r.amount}  to "${r.party_name ?? ''}"  type=${r.payment_type ?? '-'}  supplier=${r.supplier_id ?? '-'}`)
  console.log(`    journal: ${linked}${r.journal_reference ? ` ${r.journal_reference} (${r.journal_status})` : ''}${r.journal_lines ? `: ${r.journal_lines}` : ''}`)
}
await db.end()
console.log(`\n${rows.length} payment(s) to review. Nothing was changed.`)
