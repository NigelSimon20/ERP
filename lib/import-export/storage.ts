import { writeFile, mkdir, readFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import type { FileRecord } from '@prisma/client'

// Mirrors app/api/files/route.ts's storage convention (outside public/, only
// reachable through code that checks companyId) but under its own
// 'import-staging' folder so staged import files are distinguishable from
// user-facing attachments.
const uploadsRoot = path.join(process.cwd(), 'storage', 'uploads')
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
  const uploadDir = path.join(uploadsRoot, companyId, STAGING_FOLDER)
  const destPath = path.join(uploadDir, fileName)

  if (!uploadDir.startsWith(uploadsRoot + path.sep) || !destPath.startsWith(uploadDir + path.sep)) {
    throw new Error('Invalid file name')
  }

  await mkdir(uploadDir, { recursive: true })
  await writeFile(destPath, file.buffer)

  return prisma.fileRecord.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      uploadedBy,
      fileName,
      originalName: file.name,
      fileUrl: `${companyId}/${STAGING_FOLDER}/${fileName}`,
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

  const resolved = path.join(uploadsRoot, record.fileUrl)
  if (!resolved.startsWith(uploadsRoot + path.sep)) throw new Error('Invalid staged file path')

  return readFile(resolved)
}
