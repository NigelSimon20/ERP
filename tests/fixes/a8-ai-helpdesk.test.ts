import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { formatCurrency } from '@/lib/utils'
import * as helpdesk from '@/app/api/ai-helpdesk/route'
import * as financeDashboard from '@/app/api/dashboard/finance/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, payment } from '../regression/actions'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A8: POST /api/ai-helpdesk -> 503 "set GROQ_API_KEY", and the assistant
// quoted its own receivables figure instead of the dashboard's.
describe('A8 AI helpdesk', () => {
  let fx: ZZ
  const ask = () => callRoute(helpdesk.POST, { method: 'POST', path: '/api/ai-helpdesk', body: { messages: [{ role: 'user', content: 'How are we doing?' }] } })

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
    const today = new Date().toISOString().slice(0, 10)
    const inv = await invoice(fx, 250, { issueDate: today })
    await receipt(fx, { invoiceId: inv.id, amount: 40, receiptDate: today })
    await payment(fx, { amount: 15, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id, paymentDate: today })
  })
  afterEach(() => {
    delete process.env.GROQ_API_KEY
    vi.unstubAllGlobals()
  })

  it('without GROQ_API_KEY: GET says unavailable; POST -> 503 AI_NOT_CONFIGURED with the user-facing message', async () => {
    delete process.env.GROQ_API_KEY
    expect((await callRoute(helpdesk.GET, { path: '/api/ai-helpdesk' })).json).toEqual({ available: false })
    const r = await ask()
    expect([r.status, r.json.code, r.json.error]).toEqual([503, 'AI_NOT_CONFIGURED', 'Assistant unavailable — contact your administrator'])
  })

  it('the assistant is given the same revenue, receivables and cash as /api/dashboard/finance', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    let prompt = ''
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      prompt = JSON.parse(init.body).messages[0].content
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 })
    }))
    expect((await callRoute(helpdesk.GET, { path: '/api/ai-helpdesk' })).json).toEqual({ available: true })
    const r = await ask()
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const dash = (await callRoute(financeDashboard.GET, { path: '/api/dashboard/finance' })).json
    expect(dash.cashInBank).toBe(1025)
    expect(dash.outstandingReceivables).toBe(210)
    expect(prompt).toContain(`Total Outstanding Receivables: ${formatCurrency(dash.outstandingReceivables, 'USD')}`)
    expect(prompt).toContain(`Total Revenue (fiscal year to date): ${formatCurrency(dash.totalRevenue, 'USD')}`)
    expect(prompt).toContain(`Net Profit (fiscal year to date): ${formatCurrency(dash.netProfit, 'USD')}`)
    expect(prompt).toContain(`Cash in Bank: ${formatCurrency(dash.cashInBank, 'USD')}`)
  })
})
