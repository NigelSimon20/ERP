import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const body = await req.json() as { messages: Array<{ role: 'user' | 'assistant'; content: string }> }
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get IDs for models that lack companyId (schema doesn't include companyId on some models)
  const [companySiteIds, companyGuardIds] = await Promise.all([
    prisma.site.findMany({ select: { id: true } }).then(s => s.map(x => x.id)),
    prisma.guard.findMany({ select: { id: true } }).then(g => g.map(x => x.id)),
  ])

  const [
    activeGuards,
    activeSites,
    openIncidents,
    receivableAgg,
    revenueAgg,
    pendingTasks,
    todayAttendance,
  ] = await Promise.all([
    prisma.guard.count({ where: { status: 'Active' } }),
    prisma.site.count({ where: { status: 'Active' } }),
    prisma.incident.count({ where: { siteId: { in: companySiteIds }, status: { in: ['OPEN', 'INVESTIGATING'] as never } } }),
    prisma.salesInvoice.aggregate({ where: { status: { not: 'Paid' as never } }, _sum: { balance_due: true } }),
    prisma.salesInvoice.aggregate({ where: { status: { not: 'Void' as never } }, _sum: { total_amount: true } }),
    prisma.task.count({ where: { status: 'PENDING' } }),
    prisma.attendance.count({ where: { guardId: { in: companyGuardIds }, date: { gte: today } } }),
  ])

  const totalReceivables = Number(receivableAgg._sum.balance_due ?? 0)
  const totalRevenue = Number(revenueAgg._sum.total_amount ?? 0)

  const systemPrompt = `You are the Ravenshield AI Assistant, an intelligent assistant for Ravenshield Security ERP. You help users understand their company data and answer questions. Here is the current live data for this company:

Active Guards: ${activeGuards}
Active Sites: ${activeSites}
Open Incidents: ${openIncidents}
Total Outstanding Receivables: ${formatCurrency(totalReceivables)}
Total Revenue (fiscal year): ${formatCurrency(totalRevenue)}
Pending Tasks: ${pendingTasks}
Attendance Records Today: ${todayAttendance}

Answer questions based on this data. If asked for details not in this summary, say 'I can see the summary but you can check the detailed [module] page for specifics.' Never make up numbers. Never reference data from outside this company. Be concise and professional.`

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured — set GROQ_API_KEY in env' }, { status: 503 })

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
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  const data = await groqRes.json() as { choices: Array<{ message: { role: string; content: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''

  return NextResponse.json({ response: content })
}
