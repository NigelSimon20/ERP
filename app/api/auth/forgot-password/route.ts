import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { getIpAddress } from '@/lib/utils'
import {
  newResetToken, resetLinkBase, RESET_TOKEN_TTL_MS, RESET_WINDOW_MS,
  MAX_RESETS_PER_EMAIL, MAX_RESETS_PER_IP, RESET_TOKEN_PREFIX, RESET_IP_MARKER,
} from '@/lib/password-reset'

const schema = z.object({ email: z.string().email() })

// Identical for every outcome (unknown email, rate-limited, sent) so the
// endpoint can't be used to find out which accounts exist.
const GENERIC = {
  success: true,
  message: 'If an account exists for that email, a reset link has been sent.',
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  const email = parsed.data.email.toLowerCase()
  const ip = getIpAddress(req)
  const windowStart = new Date(Date.now() - RESET_WINDOW_MS)

  try {
    const [byIp, byEmail] = await Promise.all([
      prisma.otpToken.count({ where: { email: `ip:${ip}`, token: RESET_IP_MARKER, createdAt: { gte: windowStart } } }),
      prisma.otpToken.count({ where: { email, token: { startsWith: RESET_TOKEN_PREFIX }, createdAt: { gte: windowStart } } }),
    ])
    if (byIp >= MAX_RESETS_PER_IP) {
      return NextResponse.json({ error: 'Too many requests. Try again in 15 minutes.', code: 'RATE_LIMITED' }, { status: 429 })
    }
    await prisma.otpToken.create({
      data: { id: crypto.randomUUID(), email: `ip:${ip}`, token: RESET_IP_MARKER, expiresAt: new Date(Date.now() + RESET_WINDOW_MS) },
    })
    // Per-email limit is silent: a 429 here would reveal the account exists.
    if (byEmail >= MAX_RESETS_PER_EMAIL) return NextResponse.json(GENERIC)

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, whatsapp: true, phone: true, active: true },
    })
    if (!user || !user.active) return NextResponse.json(GENERIC)

    const base = resetLinkBase()
    if (!base) {
      console.error('[forgot-password] NEXT_PUBLIC_APP_URL is not set; cannot build reset link')
      return NextResponse.json(GENERIC)
    }

    const { token, stored } = newResetToken()
    await prisma.$transaction([
      // One live link at a time.
      prisma.otpToken.updateMany({
        where: { email, token: { startsWith: RESET_TOKEN_PREFIX }, used: false },
        data: { used: true },
      }),
      prisma.otpToken.create({
        data: { id: crypto.randomUUID(), email, token: stored, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      }),
    ])

    const link = `${base}/reset-password?token=${token}`
    const mail = await sendEmail({
      to: user.email,
      subject: 'Reset your RavenShield ERP password',
      text: `Hi ${user.name},\n\nUse this link to set a new password. It expires in 30 minutes and works once:\n${link}\n\nIf you didn't ask for this, ignore this email; your password is unchanged.`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use this link to set a new password. It expires in 30 minutes and works once:</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, ignore this email; your password is unchanged.</p>`,
    })
    if (!mail.success) {
      const to = user.whatsapp || user.phone
      const wa = to
        ? await sendWhatsAppMessage({ to, message: `RavenShield ERP password reset (expires in 30 minutes): ${link}` })
        : { success: false, error: 'no phone on file' }
      if (!wa.success) console.error('[forgot-password] could not deliver reset link', { userId: user.id, email: mail.error, whatsapp: wa.error })
    }

    return NextResponse.json(GENERIC)
  } catch (err) {
    console.error('[forgot-password]', err)
    return NextResponse.json(GENERIC)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
