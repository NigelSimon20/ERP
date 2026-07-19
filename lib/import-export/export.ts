import * as XLSX from 'xlsx'
import type { ModuleImportConfig } from './types'

export interface ExportResult {
  buffer: Buffer
  contentType: string
  filename: string
}

/** Single shared export path replacing the hand-rolled per-page CSV Blob builders. */
export async function exportModuleData(
  config: ModuleImportConfig,
  companyId: string,
  format: 'csv' | 'xlsx'
): Promise<ExportResult> {
  const records = await config.listForExport(companyId)
  const headers = config.exportColumns.map((c) => c.label)
  const rows = records.map((record) => config.exportColumns.map((c) => record[c.key] ?? ''))

  const dateStamp = new Date().toISOString().split('T')[0]
  const baseName = `${config.moduleKey}-${dateStamp}`

  if (format === 'csv') {
    const csvLines = [headers, ...rows].map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    )
    return {
      buffer: Buffer.from(csvLines.join('\n'), 'utf-8'),
      contentType: 'text/csv',
      filename: `${baseName}.csv`,
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, config.label)
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${baseName}.xlsx`,
  }
}
