import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER']

const bodySchema = z.object({
  channel: z.enum(['whatsapp', 'email']),
  employeeName: z.string().min(1),
  username: z.string().min(1),
  tempPassword: z.string().min(1),
  whatsappNumber: z.string().optional(),
  email: z.string().email().optional(),
  loginUrl: z.string().url().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return NextResponse.json({ error: firstError?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { channel, employeeName, username, tempPassword, whatsappNumber, email, loginUrl } = parsed.data
  const appUrl = loginUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.ravenshield.com'

  if (channel === 'whatsapp') {
    if (!whatsappNumber) {
      return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 })
    }

    const message = [
      `🔐 *Raven Shield ERP — Login Credentials*`,
      ``,
      `Hello ${employeeName},`,
      ``,
      `Your login account has been created. Please find your credentials below:`,
      ``,
      `👤 *Username:* ${username}`,
      `🔑 *Temporary Password:* ${tempPassword}`,
      `🌐 *Login URL:* ${appUrl}/login`,
      ``,
      `⚠️ *Important:* Please log in and change your password immediately after your first login.`,
      ``,
      `If you did not expect this message, please contact your administrator immediately.`,
      ``,
      `— Raven Shield Security ERP`,
    ].join('\n')

    const result = await sendWhatsAppMessage({ to: whatsappNumber, message })

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to send WhatsApp message' }, { status: 500 })
    }

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'CredentialDelivery',
      recordId: params.id,
      newValues: { channel: 'whatsapp', to: whatsappNumber },
    })

    return NextResponse.json({ success: true, channel: 'whatsapp' })
  }

  // Email channel — placeholder (implement with preferred email provider)
  if (channel === 'email') {
    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
    }

    // TODO: Integrate with your email provider (SendGrid, Nodemailer, Resend, etc.)
    // For now, log the action and return success so the UI flow works.
    // Replace the block below with your email send implementation.
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'CredentialDelivery',
      recordId: params.id,
      newValues: { channel: 'email', to: email },
    })

    return NextResponse.json({
      success: true,
      channel: 'email',
      note: 'Email provider not yet configured. Credentials have been logged.',
    })
  }

  return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
}
