import { describe, it, expect } from 'vitest'
import fs from 'fs'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { seedZZTest } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, payment, createBill, transfer, postedJournal } from '../regression/actions'

// Seeds a local database for the Step 3 click-through (not part of the
// normal suite): E2E_SEED=<output file> TEST_DATABASE_URL=<local db> npx vitest run tests/e2e
describe.skipIf(!process.env.E2E_SEED)('seed for click-through', () => {
  it('creates ZZTEST Co with a little activity', async () => {
    const fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
    const today = new Date().toISOString().slice(0, 10)
    const inv = await invoice(fx, 115.5, { issueDate: today })
    await receipt(fx, { invoiceId: inv.id, amount: 50, receiptDate: today })
    await createBill(fx, 40, { issueDate: today })
    await payment(fx, { amount: 12, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id, paymentDate: today })
    await transfer(fx, { amount: 100, transferDate: today })
    await postedJournal([{ accountId: fx.accounts.officeExpenses.id, debit: 5 }, { accountId: fx.accounts.prepaid.id, credit: 5 }], today)
    for (const g of fx.guards) await prisma.attendance.create({ data: { id: crypto.randomUUID(), guardId: g.id, date: new Date(today), status: 'PRESENT' } })
    const { POST } = await import('@/app/api/hr/payroll/route')
    await loginAs(fx.sessionFor(fx.users.hr))
    const start = `${today.slice(0, 8)}01`
    expect((await callRoute(POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { periodStart: start, periodEnd: today, bankAccountId: fx.banks.b1.id } })).status).toBe(201)
    fs.writeFileSync(process.env.E2E_SEED!, JSON.stringify({ email: fx.users.admin.email, password: 'Correct-horse-1', companyId: fx.companyId }))
  })
})
