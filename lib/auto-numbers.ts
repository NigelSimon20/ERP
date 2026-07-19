import { prisma } from './prisma'

function parseNum(ref: string | null): number {
  if (!ref) return 0
  const m = ref.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

async function getPrefix(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { forceNumberPrefix: true }
  })
  return company?.forceNumberPrefix ? `${company.forceNumberPrefix}-` : ''
}

/**
 * Atomically claims the next value of a per-company counter column on Company
 * (e.g. nextInvoiceNumber) via a single `SET col = col + 1` update, avoiding
 * the read-last-record-then-increment race that lets concurrent requests
 * generate duplicate numbers.
 */
async function claimCounter(companyId: string, field: string): Promise<number> {
  const updated: any = await prisma.company.update({
    where: { id: companyId },
    data: { [field]: { increment: 1 } },
    select: { [field]: true },
  })
  return Number(updated[field] ?? 1) - 1
}

export async function nextInvoiceNumber(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { invoicePrefix: true } })
  // The configured prefix IS the document tag (e.g. an admin sets
  // invoicePrefix="INV" meaning "number them INV-000036") — it isn't meant
  // to be prepended to another hardcoded "INV-" tag. Doing both produced
  // "INV-INV-000036" for any company that had customized this field.
  const tag = company?.invoicePrefix || 'INV'
  const n = await claimCounter(companyId, 'nextInvoiceNumber')
  return `${tag}-${String(n).padStart(6, '0')}`
}

export async function nextQuoteNumber(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { quotationPrefix: true } })
  const tag = company?.quotationPrefix || 'QUO'
  const n = await claimCounter(companyId, 'nextQuotationNumber')
  return `${tag}-${String(n).padStart(6, '0')}`
}

export async function nextJournalReference(companyId: string): Promise<string> {
  const prefix = await getPrefix(companyId)
  const n = await claimCounter(companyId, 'nextJournalNumber')
  return `${prefix}JE-${String(n).padStart(6, '0')}`
}

export async function nextEmployeeNumber(companyId: string): Promise<string> {
  const prefix = await getPrefix(companyId)
  const last = await prisma.guard.findFirst({
    where: { companyId },
    orderBy: { employee_code: 'desc' },
    select: { employee_code: true },
  })
  const n = last ? parseNum(last.employee_code) : 0
  return `${prefix}EMP-${String(n + 1).padStart(4, '0')}`
}

export async function nextForceNumber(companyId: string): Promise<string> {
  const prefix = await getPrefix(companyId)
  const n = await claimCounter(companyId, 'nextForceNumber')
  return `${prefix}FN-${String(n).padStart(4, '0')}`
}

export async function nextPaymentReference(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { paymentPrefix: true } })
  const tag = company?.paymentPrefix || 'PAY'
  const n = await claimCounter(companyId, 'nextPaymentNumber')
  return `${tag}-${String(n).padStart(6, '0')}`
}

export async function nextReceiptReference(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { receiptPrefix: true } })
  const tag = company?.receiptPrefix || 'RCP'
  const n = await claimCounter(companyId, 'nextReceiptNumber')
  return `${tag}-${String(n).padStart(6, '0')}`
}

export async function nextPurchaseInvoiceNumber(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { purchaseInvoicePrefix: true } })
  const tag = company?.purchaseInvoicePrefix || 'BILL'
  const n = await claimCounter(companyId, 'nextPurchaseInvoiceNumber')
  return `${tag}-${String(n).padStart(6, '0')}`
}

export async function nextTransferReference(companyId: string): Promise<string> {
  const prefix = await getPrefix(companyId)
  const n = await claimCounter(companyId, 'nextTransferNumber')
  return `${prefix}TRF-${String(n).padStart(6, '0')}`
}
