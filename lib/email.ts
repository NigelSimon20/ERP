import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_EMAIL || 'Ravenshield ERP <onboarding@resend.dev>'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, error: 'Email provider not configured' }
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    })

    if (error) throw new Error(error.message)

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email send failed'
    return { success: false, error: message }
  }
}
