import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { exportModuleData } from '@/lib/import-export/export'
import { getModuleConfig } from '@/lib/import-export/registry'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = (req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv') as 'csv' | 'xlsx'
  const config = getModuleConfig('customers')
  const { buffer, contentType, filename } = await exportModuleData(config, session.companyId, format)

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
