export interface HRDocument {
  id: string
  companyId: string
  guardId?: string
  documentType: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number
  mimeType: string
  expiryDate?: Date
  notes?: string
  uploadedBy: string
  createdAt: Date
  guard?: {
    id: string
    first_name?: string
    last_name?: string
    full_name?: string
    employee_code?: string
  }
}

export interface HRDocumentCreate {
  guardId?: string
  documentType: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number
  mimeType: string
  expiryDate?: string
  notes?: string
}

export interface HRDocumentUpdate {
  guardId?: string
  documentType?: string
  title?: string
  expiryDate?: string
  notes?: string
}

export const DOCUMENT_TYPES = [
  'ID Document',
  'Passport',
  'Drivers License',
  'Certificate',
  'Diploma',
  'Contract',
  'Medical Report',
  'Police Clearance',
  'Reference Letter',
  'Qualification',
  'Training Certificate',
  'Insurance Document',
  'Other',
] as const
