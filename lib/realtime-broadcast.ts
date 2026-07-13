/**
 * Helper functions to broadcast real-time events when financial transactions occur
 */

export async function broadcastFinancialEvent(
  event: string,
  data: any,
  companyId: string
) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/realtime/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event,
        data: {
          ...data,
          companyId,
        },
      }),
    })

    if (!response.ok) {
      console.error('Failed to broadcast event:', await response.text())
    }
  } catch (error) {
    // Silently fail - don't block transaction if broadcast fails
    console.error('Error broadcasting realtime event:', error)
  }
}

/**
 * Invoice events
 */
export async function broadcastInvoiceCreated(
  invoiceId: string,
  invoiceNumber: string,
  customerId: string,
  total: number,
  companyId: string
) {
  await broadcastFinancialEvent('invoice.created', {
    invoiceId,
    invoiceNumber,
    customerId,
    total,
    action: 'Invoice created',
  }, companyId)
}

export async function broadcastInvoiceVoided(
  invoiceId: string,
  invoiceNumber: string,
  companyId: string
) {
  await broadcastFinancialEvent('invoice.voided', {
    invoiceId,
    invoiceNumber,
    action: 'Invoice voided',
  }, companyId)
}

/**
 * Payment events
 */
export async function broadcastPaymentCreated(
  paymentId: string,
  reference: string,
  amount: number,
  supplierId?: string,
  customerId?: string,
  companyId?: string
) {
  await broadcastFinancialEvent('payment.created', {
    paymentId,
    reference,
    amount,
    supplierId,
    customerId,
    action: 'Payment recorded',
  }, companyId || '')
}

/**
 * Balance update events
 */
export async function broadcastBalanceUpdated(
  recordType: 'customer' | 'supplier',
  recordId: string,
  recordName: string,
  newBalance: number,
  changeAmount: number,
  companyId: string
) {
  await broadcastFinancialEvent('balance.updated', {
    recordType,
    recordId,
    recordName,
    newBalance,
    changeAmount,
    action: `${recordType} balance updated`,
  }, companyId)
}

/**
 * Bank transfer events
 */
export async function broadcastBankTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  companyId: string
) {
  await broadcastFinancialEvent('bank.transfer', {
    fromAccountId,
    toAccountId,
    amount,
    action: 'Bank transfer completed',
  }, companyId)
}

/**
 * Journal entry events
 */
export async function broadcastJournalPosted(
  journalId: string,
  reference: string,
  totalDebit: number,
  companyId: string
) {
  await broadcastFinancialEvent('journal.posted', {
    journalId,
    reference,
    totalDebit,
    action: 'Journal entry posted',
  }, companyId)
}

/**
 * Payroll events
 */
export async function broadcastPayrollProcessed(
  payrollId: string,
  period: string,
  employeeCount: number,
  totalAmount: number,
  companyId: string
) {
  await broadcastFinancialEvent('payroll.processed', {
    payrollId,
    period,
    employeeCount,
    totalAmount,
    action: 'Payroll processed',
  }, companyId)
}

/**
 * Real-time ticker update for dashboard KPIs
 */
export async function broadcastDashboardUpdate(
  metrics: {
    totalOutstanding?: number
    totalPaid?: number
    avgPaymentDays?: number
    overdueCash?: number
  },
  companyId: string
) {
  await broadcastFinancialEvent('dashboard.update', {
    metrics,
    action: 'Dashboard metrics updated',
  }, companyId)
}
