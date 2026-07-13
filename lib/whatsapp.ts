import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export async function sendWhatsAppMessage(params: {
  to: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const normalized = params.to.replace(/\s+/g, '')
    const to = normalized.startsWith('+') ? normalized : `+${normalized}`

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${to}`,
      body: params.message,
    })

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'WhatsApp send failed'
    return { success: false, error: message }
  }
}
