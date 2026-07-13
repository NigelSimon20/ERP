import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { to, message } = body

  if (!to || typeof to !== 'string' || !to.trim()) return NextResponse.json({ error: 'to is required' }, { status: 400 })
  if (!message || typeof message !== 'string' || !message.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const result = await sendWhatsAppMessage({ to, message })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'WhatsApp', recordId: userId, newValues: { to, preview: message.slice(0, 50) } })

  if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 502 })
  return NextResponse.json({ success: true })
}
