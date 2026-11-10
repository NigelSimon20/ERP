import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { getIpAddress } from '@/lib/utils'
import { passwordStrengthError, storedResetToken, RESET_TOKEN_PREFIX } from '@/lib/password-reset'

// Replaces the old ?action=request|verify flow (6-digit WhatsApp OTP stored
// in plaintext, no attempt limit). The link from /api/auth/forgot-password
// carries a 256-bit token; only its SHA-256 is in the database.
const schema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().max(200),
})

const INVALID = { error: 'This reset link is invalid or has expired. Request a new one.', code: 'INVALID_TOKEN' }

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(INVALID, { status: 400 })
  const { token, newPassword } = parsed.data

  const weak = passwordStrengthError(newPassword)
  if (weak) return NextResponse.json({ error: weak, code: 'WEAK_PASSWORD' }, { status: 400 })

  try {
    const stored = storedResetToken(token)
    const hash = await hashPassword(newPassword)
    const now = new Date()

    const user = await prisma.$transaction(async (tx) => {
      // Claiming the token with a conditional update makes it single-use
      // even if the link is submitted twice at once.
      const record = await tx.otpToken.findFirst({ where: { token: stored }, select: { id: true, email: true } })
      if (!record) return null
      const claimed = await tx.otpToken.updateMany({
        where: { id: record.id, used: false, expiresAt: { gt: now } },
        data: { used: true },
      })
      if (claimed.count === 0) return null

      const u = await tx.user.findUnique({ where: { email: record.email }, select: { id: true, companyId: true, name: true, active: true } })
      if (!u || !u.active) return null

      // passwordChangedAt revokes every existing session (see middleware).
      await tx.user.update({
        where: { id: u.id },
        data: { password: hash, mustChangePassword: false, passwordChangedAt: now },
      })
      await tx.otpToken.updateMany({
        where: { email: record.email, token: { startsWith: RESET_TOKEN_PREFIX }, used: false },
        data: { used: true },
      })
      await tx.auditTrail.create({
        data: {
          id: crypto.randomUUID(), companyId: u.companyId, userId: u.id, userName: u.name,
          action: 'UPDATE', module: 'Auth', recordId: u.id,
          newValues: JSON.stringify({ event: 'PASSWORD_RESET', sessionsRevoked: true }),
          ipAddress: getIpAddress(req),
        },
      })
      return u
    })

    if (!user) return NextResponse.json(INVALID, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reset-password]', err)
    return NextResponse.json({ error: 'Could not reset the password. Try again.', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
