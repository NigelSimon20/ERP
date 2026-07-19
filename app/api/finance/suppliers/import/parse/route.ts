import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { parseImportFile } from '@/lib/import-export/parse'
import { suggestMapping } from '@/lib/import-export/mapping'
import { stageImportFile } from '@/lib/import-export/storage'
import { getModuleConfig } from '@/lib/import-export/registry'

export const maxDuration = 300

const MODULE_KEY = 'suppliers'

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { headers, rows } = parseImportFile(buffer)
  if (headers.length === 0) {
    return NextResponse.json({ error: 'Could not read any columns from this file' }, { status: 400 })
  }

  const config = getModuleConfig(MODULE_KEY)
  const suggestions = suggestMapping(headers, config.fields)

  const fileRecord = await stageImportFile(session.companyId, session.userId, MODULE_KEY, {
    name: file.name,
    buffer,
    size: file.size,
    type: file.type,
  })

  return NextResponse.json({
    fileId: fileRecord.id,
    headers,
    suggestions,
    totalRows: rows.length,
    sampleRows: rows.slice(0, 20),
    fields: config.fields,
  })
}
