import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { downloadObject } from '@/lib/storage'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const record = await prisma.fileRecord.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await downloadObject(record.fileUrl)
  } catch {
    return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })
  }

  const inline = record.mimeType.startsWith('image/') || record.mimeType === 'application/pdf'
  const disposition = `${inline ? 'inline' : 'attachment'}; filename="${record.originalName.replace(/"/g, '')}"`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': record.mimeType,
      'Content-Disposition': disposition,
      'Content-Length': String(record.fileSize),
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  })
}
