import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const guardId = searchParams.get('guardId')
  const documentType = searchParams.get('documentType')
  const page = Number(searchParams.get('page') ?? 1)
  const limit = Number(searchParams.get('limit') ?? 20)

  const where: any = { companyId: session.companyId }
  if (guardId) where.guardId = guardId
  if (documentType) where.documentType = documentType

  const [rows, total] = await Promise.all([
    prisma.hRDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hRDocument.count({ where }),
  ])

  // HRDocument.guardId is a plain scalar (no Prisma relation), so the guard
  // display name is attached with a separate lookup rather than `include`.
  const guardIds = Array.from(new Set(rows.map((d) => d.guardId).filter(Boolean))) as string[]
  const guardRows = guardIds.length
    ? await prisma.guard.findMany({ where: { id: { in: guardIds } }, select: { id: true, full_name: true, employee_code: true } })
    : []
  const guardMap = Object.fromEntries(guardRows.map((g) => [g.id, g]))
  const documents = rows.map((d) => ({ ...d, guard: d.guardId ? guardMap[d.guardId] : undefined }))

  // Check for expiring documents
  const expiringDocs = await prisma.hRDocument.findMany({
    where: {
      companyId: session.companyId,
      expiryDate: {
        gte: new Date(),
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    },
    select: { id: true, title: true, expiryDate: true, guardId: true },
  })

  return NextResponse.json({
    documents,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    expiringDocuments: expiringDocs,
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { guardId, documentType, title, fileUrl, fileName, fileSize, mimeType, expiryDate, notes } = body

  if (!documentType || !title || !fileUrl || !fileName || !fileSize || !mimeType) {
    return NextResponse.json({
      error: 'documentType, title, fileUrl, fileName, fileSize, mimeType are required',
    }, { status: 400 })
  }

  try {
    const doc = await prisma.hRDocument.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        guardId: guardId || null,
        documentType,
        title,
        fileUrl,
        fileName,
        fileSize: Number(fileSize),
        mimeType,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: notes || null,
        uploadedBy: session.userId,
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'HRDocuments',
      recordId: doc.id,
      newValues: doc as any,
    })

    return NextResponse.json(doc, { status: 201 })
  } catch (err: any) {
    console.error('HR Document creation error:', err)
    return apiError(err, 'Failed to create document', 400)
  }
}
