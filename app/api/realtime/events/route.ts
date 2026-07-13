import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { broadcastEvent } from '@/lib/realtime'

/**
 * API route for real-time notification broadcasting
 * Used internally when financial transactions occur
 */
export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { event, data, broadcast = true } = await req.json()

    if (!event || !data) {
      return NextResponse.json(
        { error: 'Missing event or data' },
        { status: 400 }
      )
    }

    // Validate event type
    const validEvents = [
      'invoice.created',
      'invoice.updated',
      'invoice.voided',
      'payment.created',
      'payment.applied',
      'customer.created',
      'customer.updated',
      'supplier.created',
      'supplier.updated',
      'balance.updated',
      'bank.transfer',
      'journal.posted',
    ]

    if (!validEvents.includes(event)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    if (broadcast) {
      // Broadcast to all connected clients in the company
      await broadcastEvent(`company-${session.companyId}`, event, {
        ...data,
        timestamp: new Date().toISOString(),
        userId: session.userId,
        userName: session.name,
      })
    }

    // Log the event for auditing
    await logRealtimeEvent({
      companyId: session.companyId,
      userId: session.userId,
      event,
      data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Realtime broadcast error:', error)
    return NextResponse.json(
      { error: 'Failed to broadcast event' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to fetch recent real-time events
 * Useful for clients that missed updates while offline
 */
export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // 'financial', 'hr', 'operations'

    // Fetch recent changes based on type
    const changes = []

    if (!type || type === 'financial') {
      const invoices = await prisma.salesInvoice.findMany({
        where: { customer_id: { not: null } },
        select: { id: true, invoice_number: true, status: true },
        take: 20,
        orderBy: { created_date: 'desc' },
      })
      changes.push(...invoices.map(inv => ({ type: 'invoice', data: inv, timestamp: new Date() })))

      const payments = await prisma.payment.findMany({
        where: { companyId: session.companyId },
        select: { id: true, reference: true, status: true, updated_date: true },
        take: 20,
      })
      changes.push(...payments.map(pay => ({ type: 'payment', data: pay, timestamp: new Date(pay.updated_date || Date.now()) })))
    }

    if (!type || type === 'hr') {
      // HR events would be added here when HR models are finalized
      // Placeholder for future implementation
    }

    // Sort by timestamp descending
    changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return NextResponse.json({ changes: changes.slice(0, 50) })
  } catch (error) {
    console.error('Error fetching realtime events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }
}

/**
 * Helper function to log real-time events for auditing
 */
async function logRealtimeEvent({
  companyId,
  userId,
  event,
  data,
}: {
  companyId: string
  userId: string
  event: string
  data: any
}) {
  try {
    // Optional: Store in a realtime_events table for auditing
    // This could be useful for compliance and debugging
    console.log(`[REALTIME EVENT] ${event} - Company: ${companyId}, User: ${userId}`, data)
  } catch (error) {
    console.error('Failed to log realtime event:', error)
  }
}
