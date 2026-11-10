import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

function withTaxAliases<T extends { defaultVatRate: unknown; vatNumber: string | null; showVat: boolean | null; taxName: string | null; taxInclusive: boolean | null; taxAppliedByDefault: boolean | null }>(company: T) {
  return {
    ...company,
    taxRate: Number(company.defaultVatRate),
    taxName: company.taxName ?? 'VAT',
    taxNumber: company.vatNumber,
    taxEnabled: company.showVat ?? true,
    taxInclusive: company.taxInclusive ?? false,
    taxAppliedByDefault: company.taxAppliedByDefault ?? true,
  }
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = await prisma.company.findUnique({ where: { id: session.companyId } })
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // smtpPassword is a raw stored credential -- never round-trip it to the
  // client, for any role. Nothing in the Settings UI reads it back (the PUT
  // handler below only ever writes it), so stripping it here breaks nothing.
  const { smtpPassword: _smtpPassword, ...safeCompany } = company

  return NextResponse.json({ company: withTaxAliases(safeCompany) })
}

export async function PUT(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      name,
      tradingName,
      logo,
      favicon,
      motto,
      address,
      city,
      country,
      phone,
      whatsapp,
      email,
      website,
      vatNumber,
      currency,
      fiscalYearStart,
      taxRate,
      taxName,
      taxNumber,
      taxEnabled,
      taxInclusive,
      taxAppliedByDefault,
      // Branding
      primaryColor,
      secondaryColor,
      accentColor,
      sidebarColor,
      headerColor,
      buttonColor,
      pdfThemeColor,
      loginBackground,
      loginLogo,
      // Invoice settings
      invoicePrefix,
      nextInvoiceNumber,
      paymentTermsDefault,
      invoiceTerms,
      footerMessage,
      // Other document numbering
      quotationPrefix,
      quotationTerms,
      paymentPrefix,
      receiptPrefix,
      purchaseInvoicePrefix,
      employeeCodePrefix,
      nextEmployeeNumber,
      vatAccountId,
      receivablesAccountId,
      payablesAccountId,
      salariesExpenseAccountId,
      payrollLiabilitiesAccountId,
      fixedAssetsAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
      inventoryAccountId,
      // Notifications / integrations
      whatsappEnabled,
      whatsappNumber,
      emailNotifications,
      supportedCurrencies,
      defaultCurrency,
      qrEnabled,
      barcodeEnabled,
      watermark,
      digitalSignature,
      companyStamp,
      showVat,
      showDiscount,
      autoDueDate,
      // Banking
      bankName,
      bankBranch,
      bankAccountName,
      bankAccountNumber,
      bankSwift,
      bankBranchCode,
      mobileMoneyDetails,
      // SMTP
      smtpServer,
      smtpPort,
      smtpUsername,
      smtpPassword,
      smtpSenderName,
      smtpReplyTo,
    } = body

    const old = await prisma.company.findUnique({ where: { id: session.companyId } })

    const company = await prisma.company.update({
      where: { id: session.companyId },
      data: {
        ...(name !== undefined && { name }),
        ...(tradingName !== undefined && { tradingName }),
        ...(logo !== undefined && { logo }),
        ...(favicon !== undefined && { favicon }),
        ...(motto !== undefined && { motto }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(country !== undefined && { country }),
        ...(phone !== undefined && { phone }),
        ...(whatsapp !== undefined && { whatsapp }),
        ...(email !== undefined && { email }),
        ...(website !== undefined && { website }),
        ...(vatNumber !== undefined && { vatNumber }),
        ...(currency !== undefined && { currency }),
        ...(fiscalYearStart !== undefined && { fiscalYearStart: String(fiscalYearStart) }),
        ...(taxRate !== undefined && { defaultVatRate: Number(taxRate) }),
        ...(taxName !== undefined && { taxName }),
        ...(taxNumber !== undefined && { vatNumber: taxNumber }),
        ...(taxEnabled !== undefined && { showVat: Boolean(taxEnabled) }),
        ...(taxInclusive !== undefined && { taxInclusive: Boolean(taxInclusive) }),
        ...(taxAppliedByDefault !== undefined && { taxAppliedByDefault: Boolean(taxAppliedByDefault) }),
        // Branding
        ...(primaryColor !== undefined && { primaryColor }),
        ...(secondaryColor !== undefined && { secondaryColor }),
        ...(accentColor !== undefined && { accentColor }),
        ...(sidebarColor !== undefined && { sidebarColor }),
        ...(headerColor !== undefined && { headerColor }),
        ...(buttonColor !== undefined && { buttonColor }),
        ...(pdfThemeColor !== undefined && { pdfThemeColor }),
        ...(loginBackground !== undefined && { loginBackground }),
        ...(loginLogo !== undefined && { loginLogo }),
        ...(favicon !== undefined && { favicon }),
        // Invoice settings
        ...(invoicePrefix !== undefined && { invoicePrefix }),
        ...(nextInvoiceNumber !== undefined && { nextInvoiceNumber }),
        ...(paymentTermsDefault !== undefined && { paymentTermsDefault }),
        ...(invoiceTerms !== undefined && { invoiceTerms }),
        ...(footerMessage !== undefined && { footerMessage }),
        ...(quotationPrefix !== undefined && { quotationPrefix }),
        ...(quotationTerms !== undefined && { quotationTerms }),
        ...(paymentPrefix !== undefined && { paymentPrefix }),
        ...(receiptPrefix !== undefined && { receiptPrefix }),
        ...(purchaseInvoicePrefix !== undefined && { purchaseInvoicePrefix }),
        ...(employeeCodePrefix !== undefined && { employeeCodePrefix }),
        ...(nextEmployeeNumber !== undefined && { nextEmployeeNumber }),
        ...(vatAccountId !== undefined && { vatAccountId }),
        ...(receivablesAccountId !== undefined && { receivablesAccountId }),
        ...(payablesAccountId !== undefined && { payablesAccountId }),
        ...(salariesExpenseAccountId !== undefined && { salariesExpenseAccountId }),
        ...(payrollLiabilitiesAccountId !== undefined && { payrollLiabilitiesAccountId }),
        ...(fixedAssetsAccountId !== undefined && { fixedAssetsAccountId }),
        ...(accumulatedDepreciationAccountId !== undefined && { accumulatedDepreciationAccountId }),
        ...(depreciationExpenseAccountId !== undefined && { depreciationExpenseAccountId }),
        ...(inventoryAccountId !== undefined && { inventoryAccountId }),
        ...(whatsappEnabled !== undefined && { whatsappEnabled }),
        ...(whatsappNumber !== undefined && { whatsappNumber }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(supportedCurrencies !== undefined && { supportedCurrencies }),
        ...(defaultCurrency !== undefined && { defaultCurrency }),
        ...(qrEnabled !== undefined && { qrEnabled }),
        ...(barcodeEnabled !== undefined && { barcodeEnabled }),
        ...(watermark !== undefined && { watermark }),
        ...(digitalSignature !== undefined && { digitalSignature }),
        ...(companyStamp !== undefined && { companyStamp }),
        ...(showVat !== undefined && { showVat }),
        ...(showDiscount !== undefined && { showDiscount }),
        ...(autoDueDate !== undefined && { autoDueDate }),
        // Banking
        ...(bankName !== undefined && { bankName }),
        ...(bankBranch !== undefined && { bankBranch }),
        ...(bankAccountName !== undefined && { bankAccountName }),
        ...(bankAccountNumber !== undefined && { bankAccountNumber }),
        ...(bankSwift !== undefined && { bankSwift }),
        ...(bankBranchCode !== undefined && { bankBranchCode }),
        ...(mobileMoneyDetails !== undefined && { mobileMoneyDetails }),
        // SMTP
        ...(smtpServer !== undefined && { smtpServer }),
        ...(smtpPort !== undefined && { smtpPort }),
        ...(smtpUsername !== undefined && { smtpUsername }),
        ...(smtpPassword !== undefined && { smtpPassword }),
        ...(smtpSenderName !== undefined && { smtpSenderName }),
        ...(smtpReplyTo !== undefined && { smtpReplyTo }),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'Settings',
      recordId: session.companyId,
      oldValues: old
        ? { name: old.name, currency: old.currency, taxRate: Number(old.defaultVatRate), taxName: old.taxName, taxNumber: old.vatNumber, taxEnabled: old.showVat, taxInclusive: old.taxInclusive, taxAppliedByDefault: old.taxAppliedByDefault }
        : undefined,
      newValues: { name: company.name, currency: company.currency, taxRate: Number(company.defaultVatRate), taxName: company.taxName, taxNumber: company.vatNumber, taxEnabled: company.showVat, taxInclusive: company.taxInclusive, taxAppliedByDefault: company.taxAppliedByDefault },
    })

    return NextResponse.json({ company: withTaxAliases(company) })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
