import { BirdClient } from '@messagebird/sdk'

const bird = new BirdClient({ apiKey: process.env.BIRD_API_KEY! })

const LANGUAGE = process.env.BIRD_WHATSAPP_LOCALE || 'en'

// Business-initiated WhatsApp messages (outside a 24h customer care window)
// require a pre-approved template, one per distinct variable shape. This
// generic template carries invoice/contract/stock alerts and task/request
// reminders via a single body placeholder (e.g. "Ravenshield Security
// ERP\n\n{{1}}"). Meeting reminders use a dedicated appointment template
// instead (see sendMeetingReminder) since its two-variable date/time shape
// was already approved in Bird.
const NOTIFICATION_TEMPLATE = process.env.BIRD_WHATSAPP_TEMPLATE || 'ravenshield_notification'
const APPOINTMENT_TEMPLATE = process.env.BIRD_WHATSAPP_APPOINTMENT_TEMPLATE || 'bird_appointment_reminder'

function normalizeNumber(to: string): string {
  const normalized = to.replace(/\s+/g, '')
  return normalized.startsWith('+') ? normalized : `+${normalized}`
}

async function sendWhatsAppTemplate(params: {
  to: string
  template: string
  parameters: string[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await bird.whatsapp.send({
      to: normalizeNumber(params.to),
      template: {
        name: params.template,
        language: LANGUAGE,
        components: [
          {
            type: 'body',
            parameters: params.parameters.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    }).safe()

    if (error) throw error

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'WhatsApp send failed'
    return { success: false, error: message }
  }
}

export async function sendWhatsAppMessage(params: {
  to: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  return sendWhatsAppTemplate({ to: params.to, template: NOTIFICATION_TEMPLATE, parameters: [params.message] })
}

export async function sendMeetingReminder(params: {
  to: string
  date: string
  time: string
}): Promise<{ success: boolean; error?: string }> {
  return sendWhatsAppTemplate({ to: params.to, template: APPOINTMENT_TEMPLATE, parameters: [params.date, params.time] })
}
