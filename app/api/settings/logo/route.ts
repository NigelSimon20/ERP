import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { uploadBrandingObject } from '@/lib/storage'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

// PNG/JPEG/WEBP only -- jsPDF's doc.addImage() can't decode SVG, which would
// silently drop the logo from every generated PDF (see the fallback comment
// in lib/pdf-engine.ts's startBrandedDoc) while still looking fine on-screen.
const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Logo must be under 5 MB' }, { status: 400 })
  const ext = ALLOWED_MIME[file.type]
  if (!ext) return NextResponse.json({ error: 'Logo must be a PNG, JPEG, or WEBP image' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = `${session.companyId}/logo.${ext}`

  let url: string
  try {
    url = await uploadBrandingObject(key, buffer, file.type)
  } catch (err) {
    console.error('Logo upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const company = await prisma.company.update({ where: { id: session.companyId }, data: { logo: url } })

  await logAudit({
    companyId: session.companyId, userId: session.userId, userName: session.name,
    action: 'UPDATE', module: 'Settings', recordId: session.companyId,
    newValues: { logo: url },
  })

  return NextResponse.json({ logo: company.logo })
}
