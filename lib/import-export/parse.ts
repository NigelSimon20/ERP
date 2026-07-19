import * as XLSX from 'xlsx'

export interface ParsedFile {
  headers: string[]
  rows: Record<string, unknown>[]
}

/** SheetJS auto-detects CSV vs XLSX/XLS content, so both formats go through the same read path. */
export function parseImportFile(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [] }
  const sheet = workbook.Sheets[sheetName]

  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })[0] as unknown[]) || []
  const headers = headerRow.map((h) => String(h ?? '').trim()).filter((h) => h.length > 0)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })

  return { headers, rows }
}
