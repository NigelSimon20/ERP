// One-time backfill: sales/purchase invoices never posted to the GL before
// today's fix (app/api/finance/sales-invoices/route.ts,
// app/api/finance/purchase-invoices/route.ts, lib/gl-posting.ts). This posts
// the missing journal entries for every existing invoice so historical
// financial reports (P&L, Balance Sheet, Trial Balance) reflect reality.
// Idempotent: only processes invoices with no journal_entry_id/journalEntryId
// yet, so it's safe to re-run.
const { Client } = require('pg')
const crypto = require('crypto')
const fs = require('fs')

const envFile = fs.readFileSync(__dirname + '/../.env.local', 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
  if (m) process.env[m[1]] = process.env[m[1]] || m[2]
}

const NORMAL_DEBIT = new Set(['ASSET', 'EXPENSE'])

function r2(n) { return Math.round(n * 100) / 100 }

async function applyBalanceDelta(client, accountId, accountTypeById, debit, credit) {
  const type = accountTypeById.get(accountId) ?? 'ASSET'
  const delta = NORMAL_DEBIT.has(type) ? debit - credit : credit - debit
  await client.query(`UPDATE chart_of_accounts SET current_balance = COALESCE(current_balance, 0) + $1 WHERE id = $2`, [delta, accountId])
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const companies = await client.query(`SELECT id FROM companies`)

  for (const company of companies.rows) {
    const companyId = company.id
    console.log(`\n=== Company ${companyId} ===`)

    const accounts = await client.query(`SELECT id, account_name, account_type, account_code FROM chart_of_accounts WHERE "companyId" = $1`, [companyId])
    const accountTypeById = new Map(accounts.rows.map((a) => [a.id, a.account_type]))
    const findAccount = (predicate) => accounts.rows.find(predicate)

    const arAccount = findAccount((a) => a.account_type === 'ASSET' && (a.account_name || '').includes('Receivable'))
    const apAccount = findAccount((a) => a.account_type === 'LIABILITY' && (a.account_name || '').includes('Payable') && !(a.account_name || '').includes('PAYE'))
    const vatAccount = findAccount((a) => a.account_type === 'LIABILITY' && (a.account_name || '').includes('VAT'))
    const defaultRevenueAccount = accounts.rows.filter((a) => a.account_type === 'REVENUE').sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''))[0]
    const defaultExpenseAccount = accounts.rows.filter((a) => a.account_type === 'EXPENSE').sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''))[0]

    if (!arAccount) { console.log('  No Accounts Receivable account found — skipping sales invoice backfill for this company'); }
    if (!apAccount) { console.log('  No Accounts Payable account found — skipping purchase invoice backfill for this company'); }

    // ---- Sales invoices ----
    if (arAccount) {
      const invoices = await client.query(
        `SELECT id, invoice_number, invoice_date, subtotal, tax_amount, total_amount, status, revenue_account_id
         FROM sales_invoices WHERE "companyId" = $1 AND journal_entry_id IS NULL AND status NOT IN ('Void', 'VOID')`,
        [companyId],
      )
      console.log(`  Sales invoices to post: ${invoices.rows.length}`)

      let posted = 0
      for (const inv of invoices.rows) {
        const totalAmount = r2(Number(inv.total_amount ?? 0))
        if (totalAmount <= 0) continue
        const subtotal = r2(Number(inv.subtotal ?? totalAmount))
        const taxAmount = r2(Number(inv.tax_amount ?? 0))
        const revenueAccountId = inv.revenue_account_id && accountTypeById.get(inv.revenue_account_id) === 'REVENUE'
          ? inv.revenue_account_id
          : defaultRevenueAccount?.id
        if (!revenueAccountId) continue

        const journalId = crypto.randomUUID()
        const entryDate = inv.invoice_date || new Date().toISOString()
        await client.query(
          `INSERT INTO journal_entries (id, "companyId", reference, entry_date, description, total_debit, total_credit, status, created_by_id, created_date, updated_date)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 'POSTED', 'backfill-script', now()::text, now()::text)`,
          [journalId, companyId, `JE-auto-INV-${inv.invoice_number}`, entryDate, `Sales invoice ${inv.invoice_number} (GL backfill)`, totalAmount],
        )

        const lines = [{ accountId: arAccount.id, debit: totalAmount, credit: 0 }]
        if (taxAmount > 0 && vatAccount) {
          lines.push({ accountId: revenueAccountId, debit: 0, credit: subtotal })
          lines.push({ accountId: vatAccount.id, debit: 0, credit: taxAmount })
        } else {
          lines.push({ accountId: revenueAccountId, debit: 0, credit: subtotal + taxAmount })
        }

        for (const l of lines) {
          await client.query(
            `INSERT INTO journal_lines (id, "journalEntryId", "accountId", description, debit, credit) VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), journalId, l.accountId, `Invoice ${inv.invoice_number} (backfill)`, l.debit, l.credit],
          )
          await applyBalanceDelta(client, l.accountId, accountTypeById, l.debit, l.credit)
        }

        await client.query(
          `UPDATE sales_invoices SET journal_entry_id = $1, revenue_account_id = $2, receivables_account_id = $3 WHERE id = $4`,
          [journalId, revenueAccountId, arAccount.id, inv.id],
        )
        posted++
      }
      console.log(`  Posted ${posted} sales invoice journal entries`)
    }

    // ---- Purchase invoices ----
    if (apAccount && defaultExpenseAccount) {
      const bills = await client.query(
        `SELECT id, "invoiceNumber", "issueDate", "totalAmount", status FROM purchase_invoices
         WHERE "companyId" = $1 AND "journalEntryId" IS NULL AND status != 'VOID'`,
        [companyId],
      )
      console.log(`  Purchase invoices to post: ${bills.rows.length}`)

      let posted = 0
      for (const bill of bills.rows) {
        const totalAmount = r2(Number(bill.totalAmount ?? 0))
        if (totalAmount <= 0) continue

        const journalId = crypto.randomUUID()
        const entryDate = bill.issueDate ? new Date(bill.issueDate).toISOString() : new Date().toISOString()
        await client.query(
          `INSERT INTO journal_entries (id, "companyId", reference, entry_date, description, total_debit, total_credit, status, created_by_id, created_date, updated_date)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 'POSTED', 'backfill-script', now()::text, now()::text)`,
          [journalId, companyId, `JE-auto-BILL-${bill.invoiceNumber}`, entryDate, `Purchase invoice ${bill.invoiceNumber} (GL backfill)`, totalAmount],
        )

        const lines = [
          { accountId: defaultExpenseAccount.id, debit: totalAmount, credit: 0 },
          { accountId: apAccount.id, debit: 0, credit: totalAmount },
        ]
        for (const l of lines) {
          await client.query(
            `INSERT INTO journal_lines (id, "journalEntryId", "accountId", description, debit, credit) VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), journalId, l.accountId, `Bill ${bill.invoiceNumber} (backfill)`, l.debit, l.credit],
          )
          await applyBalanceDelta(client, l.accountId, accountTypeById, l.debit, l.credit)
        }

        await client.query(`UPDATE purchase_invoices SET "journalEntryId" = $1 WHERE id = $2`, [journalId, bill.id])
        posted++
      }
      console.log(`  Posted ${posted} purchase invoice journal entries (all defaulted to "${defaultExpenseAccount.account_name}" — reclassify individually in Finance > Journal Entries if a bill belongs elsewhere)`)
    }
  }

  await client.end()
  console.log('\nBackfill complete.')
}

main().catch((e) => { console.error(e); process.exit(1) })
