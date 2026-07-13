import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { generateInvoiceHtml } from '@/lib/invoice-pdf'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({ where: { id: params.id, companyId: session.companyId }, include: { lineItems: true } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const company = await prisma.company.findFirst({ where: { id: session.companyId } })
  const html = generateInvoiceHtml(invoice, company)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Placeholder: future implementation will render PDF (A4, embedded fonts) using Puppeteer or a headless renderer
  const invoice = await prisma.salesInvoice.findFirst({ where: { id: params.id, companyId: session.companyId }, include: { lineItems: true } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const company = await prisma.company.findFirst({ where: { id: session.companyId } })
  const html = generateInvoiceHtml(invoice, company)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
