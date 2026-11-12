import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { financeHeadlines } from '@/lib/reports/finance-headlines'

// A8: the page asks first whether the assistant is configured, so it can
// say so instead of showing a chat that can't answer.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ available: !!process.env.GROQ_API_KEY })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Assistant unavailable — contact your administrator', code: 'AI_NOT_CONFIGURED' }, { status: 503 })
  }

  const { companyId } = session
  const body = await req.json() as { messages: Array<{ role: 'user' | 'assistant'; content: string }> }
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const companyGuardIds = await prisma.guard.findMany({ where: { companyId }, select: { id: true } }).then(g => g.map(x => x.id))

  const [
    activeGuards,
    activeSites,
    openIncidents,
    pendingTasks,
    todayAttendance,
  ] = await Promise.all([
    prisma.guard.count({ where: { companyId, status: 'Active' } }),
    prisma.site.count({ where: { companyId, status: 'Active' } }),
    prisma.incident.count({ where: { companyId, status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    prisma.task.count({ where: { companyId, status: 'PENDING' } }),
    prisma.attendance.count({ where: { guardId: { in: companyGuardIds }, date: { gte: today } } }),
  ])

  // A8: the same functions as /api/dashboard/finance, so the assistant
  // quotes the dashboard's revenue, receivables and cash.
  const fin = await financeHeadlines(prisma, companyId)

  const systemPrompt = `You are the Ravenshield AI Assistant, an intelligent assistant for Ravenshield Security ERP. You help users understand their company data and answer questions. Here is the current live data for this company:

Active Guards: ${activeGuards}
Active Sites: ${activeSites}
Open Incidents: ${openIncidents}
Total Outstanding Receivables: ${formatCurrency(fin.outstandingReceivables, fin.reportingCurrency)}
Total Revenue (fiscal year to date): ${formatCurrency(fin.totalRevenue, fin.reportingCurrency)}
Total Expenses (fiscal year to date): ${formatCurrency(fin.totalExpenses, fin.reportingCurrency)}
Net Profit (fiscal year to date): ${formatCurrency(fin.netProfit, fin.reportingCurrency)}
Cash in Bank: ${formatCurrency(fin.cashInBank, fin.reportingCurrency)}
Pending Tasks: ${pendingTasks}
Attendance Records Today: ${todayAttendance}

Answer questions based on this data. If asked for details not in this summary, say 'I can see the summary but you can check the detailed [module] page for specifics.' Never make up numbers. Never reference data from outside this company. Be concise and professional.`

  const last10 = messages.slice(-10)

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 1024,
      reasoning_effort: 'medium',
      messages: [{ role: 'system', content: systemPrompt }, ...last10],
    }),
  })

  if (!groqRes.ok) {
    const errText = await groqRes.text()
    console.error('Groq API error:', errText)
    return NextResponse.json({ error: 'The assistant could not answer right now. Please try again.', code: 'AI_SERVICE_ERROR' }, { status: 502 })
  }

  const data = await groqRes.json() as { choices: Array<{ message: { role: string; content: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''

  return NextResponse.json({ response: content })
}
