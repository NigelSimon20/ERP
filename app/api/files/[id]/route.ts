import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { unlink } from 'fs/promises'
import path from 'path'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session

  const record = await prisma.fileRecord.findFirst({ where: { id: params.id, companyId } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await unlink(path.join(process.cwd(), 'public', record.fileUrl))
  } catch {
    // File may already be missing from disk — continue with DB delete
  }

  await prisma.fileRecord.delete({ where: { id: params.id } })

  await logAudit({
    companyId, userId, userName,
    action: 'DELETE', module: 'Files', recordId: params.id,
    oldValues: { originalName: record.originalName, folder: record.folder },
  })

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const { linkedModule, linkedId } = await req.json()

  const record = await prisma.fileRecord.findFirst({ where: { id: params.id, companyId } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.fileRecord.update({
    where: { id: params.id },
    data: {
      linkedModule: linkedModule ?? null,
      linkedId: linkedId ?? null,
    },
  })

  await logAudit({
    companyId, userId, userName,
    action: 'UPDATE', module: 'Files', recordId: params.id,
    newValues: { linkedModule, linkedId },
  })

  return NextResponse.json({ file: updated })
}
