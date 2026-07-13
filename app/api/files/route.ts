import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
])

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder')
  const module = searchParams.get('module')
  const search = searchParams.get('search')

  const [files, folderGroups] = await Promise.all([
    prisma.fileRecord.findMany({
      where: {
        companyId,
        ...(folder ? { folder } : {}),
        ...(module ? { linkedModule: module } : {}),
        ...(search ? { originalName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.fileRecord.groupBy({
      by: ['folder'],
      where: { companyId },
      _count: { id: true },
    }),
  ])

  const folderCounts = Object.fromEntries(folderGroups.map(f => [f.folder, f._count.id]))

  // Attach uploader names
  const uploaderIds = Array.from(new Set(files.map(f => f.uploadedBy)))
  const users = await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } })
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]))

  const result = files.map(f => ({ ...f, uploaderName: userMap[f.uploadedBy] ?? 'Unknown' }))

  return NextResponse.json({ files: result, folderCounts })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const folder = ((formData.get('folder') as string) || 'general').toLowerCase().replace(/\s+/g, '-')

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Allowed: PDF, DOCX, XLSX, JPG, PNG' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fileName = `${timestamp}-${safeName}`

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', companyId, folder)
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, fileName), buffer)

  const fileUrl = `/uploads/${companyId}/${folder}/${fileName}`

  const record = await prisma.fileRecord.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      uploadedBy: userId,
      fileName,
      originalName: file.name,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type,
      folder,
    },
  })

  await logAudit({
    companyId, userId, userName,
    action: 'CREATE', module: 'Files', recordId: record.id,
    newValues: { originalName: file.name, folder, fileSize: file.size },
  })

  return NextResponse.json({ file: { ...record, uploaderName: userName } }, { status: 201 })
}
