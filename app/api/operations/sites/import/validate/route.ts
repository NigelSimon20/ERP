import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { parseImportFile } from '@/lib/import-export/parse'
import { readStagedFile } from '@/lib/import-export/storage'
import { validateRows } from '@/lib/import-export/validate'
import { getModuleConfig } from '@/lib/import-export/registry'
import type { ImportMode } from '@/lib/import-export/types'

export const maxDuration = 300

const MODULE_KEY = 'sites'

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { fileId, mapping, mode } = body as {
    fileId: string
    mapping: Record<string, string | null>
    mode: ImportMode
  }
  if (!fileId || !mapping || !mode) {
    return NextResponse.json({ error: 'fileId, mapping and mode are required' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = await readStagedFile(session.companyId, fileId)
  } catch {
    return NextResponse.json({ error: 'Staged file not found or expired' }, { status: 404 })
  }

  const { rows } = parseImportFile(buffer)
  const config = getModuleConfig(MODULE_KEY)
  const validated = await validateRows({ companyId: session.companyId, config, rows, mapping, mode })

  const totalRows = validated.length
  const validRows = validated.filter((r) => r.classification !== 'INVALID').length
  const invalidRows = totalRows - validRows

  const job = await prisma.importJob.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      module: MODULE_KEY,
      fileRecordId: fileId,
      mode,
      columnMapping: mapping,
      status: 'READY',
      totalRows,
      validRows,
      invalidRows,
    },
  })

  const rowsWithIds = validated.map((r) => ({ ...r, id: crypto.randomUUID() }))

  await prisma.importJobRow.createMany({
    data: rowsWithIds.map((r) => ({
      id: r.id,
      importJobId: job.id,
      rowNumber: r.rowNumber,
      rawData: r.rawData as object,
      mappedData: r.mappedData as object,
      classification: r.classification,
      errors: r.errors,
    })),
  })

  return NextResponse.json({ jobId: job.id, totalRows, validRows, invalidRows, rows: rowsWithIds })
}
