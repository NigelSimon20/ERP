import { formatDate } from './utils'

// Shared PDF engine used by every export function in lib/pdf.ts -- replaces
// three independently-written header/footer/pagination implementations (one
// of which, exportDocumentPdf, had none at all) with one consistent engine:
// real per-page pagination, a rendered company logo, page numbers on every
// page, an optional watermark, and a signature/stamp block.

export interface PdfCompany {
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  pdfThemeColor?: string | null
  logo?: string | null
  watermark?: string | null
  digitalSignature?: string | null
  companyStamp?: string | null
  footerMessage?: string | null
  bankName?: string | null
  bankAccountNumber?: string | null
  bankBranch?: string | null
  taxName?: string | null
  qrEnabled?: boolean | null
  barcodeEnabled?: boolean | null
}

export interface BrandedDoc {
  doc: any
  themeRgb: { r: number; g: number; b: number }
  margin: number
  pageWidth: number
  pageHeight: number
}

function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '')
  const num = parseInt(cleanHex, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

// Blends a color toward white -- used for table header/total-row fills so
// they carry a light wash of the company's theme color instead of a fixed
// generic gray, while staying pale enough that dark-slate row text stays
// legible on top of it.
function tintWhite(rgb: { r: number; g: number; b: number }, amount = 0.92) {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * amount),
    g: Math.round(rgb.g + (255 - rgb.g) * amount),
    b: Math.round(rgb.b + (255 - rgb.b) * amount),
  }
}

// Ravenshield's actual brand mark, bundled with the app -- used whenever a
// company hasn't uploaded (or can't reach) a logo of its own, so PDFs never
// go out with a blank header.
const DEFAULT_LOGO_URL = '/assets/raven-logo.jpeg'

// Best-effort image fetch -> data URL. Company.logo/digitalSignature/companyStamp
// are free-text URL fields (not guaranteed to be same-origin or even valid), so
// every failure mode here (network, CORS, 404, malformed image) must degrade to
// "skip this image" rather than break PDF generation.
async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// jsPDF's addImage() needs a format that matches the actual encoding of the
// data -- passing 'PNG' for a JPEG data URL (e.g. raven-logo.jpeg) makes it
// silently fail to decode, dropping the logo from the page with no visible
// error. Read the real mime type off the "data:image/xxx;base64,..." prefix
// instead of assuming one.
function imageFormatFromDataUrl(dataUrl: string): string {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,/.exec(dataUrl)
  const subtype = (match?.[1] || 'png').toLowerCase()
  if (subtype === 'jpg' || subtype === 'jpeg') return 'JPEG'
  if (subtype === 'webp') return 'WEBP'
  return 'PNG'
}

export async function startBrandedDoc(company: PdfCompany, title: string, subtitle?: string): Promise<BrandedDoc> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const margin = 14
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const themeRgb = hexToRgb(company.pdfThemeColor || company.primaryColor || '#0b5fff')
  const ctx: BrandedDoc = { doc, themeRgb, margin, pageWidth, pageHeight }

  doc.setFillColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.rect(0, 0, pageWidth, 8, 'F')

  let textX = margin
  const dataUrl = await fetchImageDataUrl(company.logo || DEFAULT_LOGO_URL)
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), margin, 12, 20, 20)
      textX = margin + 24
    } catch {
      // Not a decodable image (e.g. logo URL points at an SVG, which jsPDF
      // can't embed directly) -- fall back to text-only header.
    }
  }

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(30, 41, 59)
  doc.text(company.name || 'Company', textX, 20)

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text([company.address, company.phone, company.email].filter(Boolean).join('  |  '), textX, 25)

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.text(title, margin, 34)

  if (subtitle) {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(subtitle, margin, 39)
  }

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, 43, pageWidth - margin, 43)

  return ctx
}

// Diagonal, low-opacity stamp across the current page. Called per-page from
// finalizeBrandedDoc (not once globally) so it applies to every page of a
// multi-page document, not just the first.
export function addWatermark(ctx: BrandedDoc, text: string | null | undefined) {
  if (!text) return
  const { doc, pageWidth, pageHeight } = ctx
  let usedGState = false
  try {
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }))
    usedGState = true
  } catch {
    // Older jsPDF build without GState -- draw at full opacity rather than
    // skip the watermark entirely.
  }
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(72)
  doc.setTextColor(150, 20, 20)
  doc.text(text.toUpperCase(), pageWidth / 2, pageHeight / 2, { align: 'center', angle: 35 })
  if (usedGState) {
    try { doc.setGState(new (doc as any).GState({ opacity: 1 })) } catch { /* no-op */ }
  }
}

// Renders digitalSignature/companyStamp images (if configured) plus a plain
// "Authorized Signature" line, and returns the Y position after the block so
// callers can continue laying out content below it.
export async function addSignatureBlock(ctx: BrandedDoc, company: PdfCompany, y: number): Promise<number> {
  const { doc, margin, pageWidth } = ctx

  if (company.digitalSignature) {
    const dataUrl = await fetchImageDataUrl(company.digitalSignature)
    if (dataUrl) {
      try { doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), margin, y, 40, 16) } catch { /* skip */ }
    }
  }
  if (company.companyStamp) {
    const dataUrl = await fetchImageDataUrl(company.companyStamp)
    if (dataUrl) {
      try { doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), pageWidth - margin - 30, y, 30, 30) } catch { /* skip */ }
    }
  }

  const lineY = y + 20
  doc.setDrawColor(148, 163, 184)
  doc.line(margin, lineY, margin + 60, lineY)
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Authorized Signature', margin, lineY + 4)
  doc.text(`Date: ${formatDate(new Date())}`, margin, lineY + 8)

  return lineY + 12
}

export async function addQrCode(ctx: BrandedDoc, value: string, x: number, y: number, size = 24) {
  if (!value) return
  try {
    const QRCode = await import('qrcode')
    // Render well above the target print size and let jsPDF scale down --
    // avoids visible pixelation on a 24mm-square code.
    const dataUrl = await QRCode.toDataURL(value, { margin: 0, width: size * 8 })
    ctx.doc.addImage(dataUrl, 'PNG', x, y, size, size)
  } catch {
    // QR rendering must never break PDF generation -- skip on any failure
    // (unsupported value, canvas unavailable, etc).
  }
}

export async function addBarcode(ctx: BrandedDoc, value: string, x: number, y: number, width = 50, height = 12) {
  if (!value) return
  try {
    const { default: JsBarcode } = await import('jsbarcode')
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, { format: 'CODE128', displayValue: false, margin: 0 })
    ctx.doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, width, height)
  } catch {
    // Same failure policy as addQrCode -- skip rather than break the document.
  }
}

// Stamps every page of the finished document with page numbers, a
// generated-by/date footer, the optional company footer message, and (if
// provided) a watermark -- as one final pass over every page, rather than
// the old per-break footer logic that only some code paths actually reached.
export function finalizeBrandedDoc(ctx: BrandedDoc, company: PdfCompany, opts: { generatedBy?: string; watermark?: string | null } = {}) {
  const { doc, margin, pageWidth, pageHeight } = ctx
  const pageCount = doc.internal.getNumberOfPages()
  const watermarkText = opts.watermark ?? company.watermark ?? null
  // Mirrors the header's colored bar (startBrandedDoc uses primaryColor) so
  // the company's own colors bracket every page top and bottom, not just top.
  const footerRgb = hexToRgb(company.secondaryColor || '#f5f7fa')

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    if (watermarkText) addWatermark(ctx, watermarkText)

    doc.setFillColor(footerRgb.r, footerRgb.g, footerRgb.b)
    doc.rect(0, pageHeight - 3, pageWidth, 3, 'F')

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
    doc.text(`Generated ${opts.generatedBy ? `by ${opts.generatedBy} ` : ''}on ${formatDate(new Date())}`, margin, pageHeight - 10)
    if (company.footerMessage) {
      doc.setFontSize(7)
      doc.text(company.footerMessage, margin, pageHeight - 6)
    }
  }
}

export interface DrawTableOptions {
  headers: string[]
  rows: (string | number)[][]
  colWidths: number[]
  aligns: ('left' | 'right')[]
  startY: number
  pageTitle?: string
}

// Auto-paginating table -- the one pagination implementation every export
// function shares now. A row that would overflow the page triggers
// doc.addPage() plus a re-drawn column-header row before continuing, instead
// of silently drawing past the bottom margin (exportDocumentPdf's line-item
// table had no such check before this).
export function drawTable(ctx: BrandedDoc, opts: DrawTableOptions): number {
  const { doc, margin, pageWidth, pageHeight, themeRgb } = ctx
  const { headers, rows, colWidths, aligns, pageTitle } = opts
  let currentY = opts.startY
  const headerFill = tintWhite(themeRgb)

  const drawHeaderRow = (y: number) => {
    doc.setFillColor(headerFill.r, headerFill.g, headerFill.b)
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    let x = margin
    headers.forEach((h, idx) => {
      const w = colWidths[idx]
      if (aligns[idx] === 'right') doc.text(h, x + w, y + 6, { align: 'right' })
      else doc.text(h, x + 2, y + 6)
      x += w
    })
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, y + 8, pageWidth - margin, y + 8)
    return y + 8
  }

  currentY = drawHeaderRow(currentY)

  rows.forEach((row) => {
    if (currentY + 10 > pageHeight - 24) {
      doc.addPage()
      currentY = 20
      if (pageTitle) {
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(30, 41, 59)
        doc.text(pageTitle, margin, currentY)
        currentY += 8
      }
      currentY = drawHeaderRow(currentY)
    }

    const isTotal = row.some((cell) => typeof cell === 'string' && (cell.startsWith('Total') || cell.includes('Net Profit') || cell.includes('Net Loss') || cell === 'Totals'))
    doc.setFont('Helvetica', isTotal ? 'bold' : 'normal')
    if (isTotal) {
      doc.setFillColor(headerFill.r, headerFill.g, headerFill.b)
      doc.rect(margin, currentY, pageWidth - margin * 2, 8, 'F')
    }
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    let x = margin
    row.forEach((cell, idx) => {
      const w = colWidths[idx]
      const text = String(cell ?? '')
      if (aligns[idx] === 'right') doc.text(text, x + w, currentY + 6, { align: 'right' })
      else doc.text(text, x + 2, currentY + 6)
      x += w
    })
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8)
    currentY += 8
  })

  return currentY
}
