import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { uploadObject, downloadObject } from '@/lib/storage'
import type { FileRecord } from '@prisma/client'

// Mirrors app/api/files/route.ts's storage convention (same private Supabase
// Storage bucket, only reachable through code that checks companyId) but
// under its own 'import-staging' folder so staged import files are
// distinguishable from user-facing attachments.
const STAGING_FOLDER = 'import-staging'

export async function stageImportFile(
  companyId: string,
  uploadedBy: string,
  moduleKey: string,
  file: { name: string; buffer: Buffer; size: number; type: string }
): Promise<FileRecord> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fileName = `${timestamp}-${safeName}`
  const fileUrl = `${companyId}/${STAGING_FOLDER}/${fileName}`

  await uploadObject(fileUrl, file.buffer, file.type || 'application/octet-stream')

  return prisma.fileRecord.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      uploadedBy,
      fileName,
      originalName: file.name,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      folder: STAGING_FOLDER,
      linkedModule: `import:${moduleKey}`,
    },
  })
}

export async function readStagedFile(companyId: string, fileRecordId: string): Promise<Buffer> {
  const record = await prisma.fileRecord.findFirst({ where: { id: fileRecordId, companyId } })
  if (!record) throw new Error('Staged import file not found')

  return downloadObject(record.fileUrl)
}
