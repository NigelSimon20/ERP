import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, generateOTP } from '@/lib/auth'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const requestSchema = z.object({ email: z.string().email() })

const verifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const action = new URL(req.url).searchParams.get('action')

  if (action === 'request') {
    try {
      const body = await req.json()
      const { email } = requestSchema.parse(body)
      const lowerEmail = email.toLowerCase()

      const user = await prisma.user.findUnique({
        where: { email: lowerEmail },
        select: { id: true, whatsapp: true, phone: true },
      })

      // Always return the same response to avoid account enumeration
      if (!user || (!user.whatsapp && !user.phone)) {
        return NextResponse.json({ success: true })
      }

      // Invalidate any prior OTPs for this email
      await prisma.otpToken.updateMany({
        where: { email: lowerEmail, used: false },
        data: { used: true },
      })

      const otp = generateOTP()
      await prisma.otpToken.create({
        data: {
          id: crypto.randomUUID(),
          email: lowerEmail,
          token: otp,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        },
      })

      await sendWhatsAppMessage({
        to: (user.whatsapp || user.phone) as string,
        message: `Your Ravenshield ERP password reset code is ${otp}. It expires in 15 minutes. If you didn't request this, ignore this message.`,
      })

      return NextResponse.json({ success: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate OTP'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  if (action === 'verify') {
    try {
      const body = await req.json()
      const { email, otp, newPassword } = verifySchema.parse(body)
      const lowerEmail = email.toLowerCase()

      const otpToken = await prisma.otpToken.findFirst({
        where: {
          email: lowerEmail,
          token: otp,
          used: false,
          expiresAt: { gt: new Date() },
        },
      })

      if (!otpToken) {
        return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
      }

      const hash = await hashPassword(newPassword)

      await prisma.$transaction([
        prisma.user.updateMany({
          where: { email: lowerEmail },
          data: { password: hash, mustChangePassword: false, updatedAt: new Date() },
        }),
        prisma.otpToken.update({
          where: { id: otpToken.id },
          data: { used: true },
        }),
      ])

      return NextResponse.json({ success: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
