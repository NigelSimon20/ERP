import * as XLSX from 'xlsx'
import type { ModuleImportConfig } from './types'

/** Builds the downloadable template straight from the module's field list, so it can never drift from what the importer actually accepts. */
export function generateTemplate(config: ModuleImportConfig): Buffer {
  const headers = config.fields.map((f) => (f.required ? `${f.label} *` : f.label))
  const sampleRow = config.fields.map((f) => f.example ?? '')

  const dataSheet = XLSX.utils.aoa_to_sheet([headers, sampleRow])

  const instructionsRows: (string | undefined)[][] = [
    ['Field', 'Required', 'Type', 'Notes'],
    ...config.fields.map((f) => [
      f.label,
      f.required ? 'Yes' : 'No',
      f.type,
      f.description ?? (f.type === 'enum' ? `Allowed values: ${f.enumValues?.join(', ')}` : ''),
    ]),
    [],
    ['Columns marked with * on the Data sheet are required.'],
    ['Leave a cell blank to skip that field for a row.'],
  ]
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data')
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
