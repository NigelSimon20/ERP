// New comprehensive calculations library following the financial golden rules.
// All functions accept/return plain numbers (never Prisma Decimal) and use
// round2dp for consistent rounding. Functions are pure and have no side-effects.

function round2dp(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

// Due dates are stored as date-only values, which parse as UTC midnight of
// that calendar day. Comparing "now > dueDate" directly makes something
// overdue from the first moment of its own due date in any timezone ahead of
// UTC (e.g. Zimbabwe, UTC+2, is overdue from 2am local on the due date
// itself) — a full day early. Give the due date its entire calendar day by
// only treating a date as overdue once the day *after* it has begun.
export function overdueThreshold(dueDate: Date | string): Date {
  return new Date(new Date(dueDate).getTime() + 24 * 60 * 60 * 1000)
}

export function isPastDue(dueDate: Date | string, reference: Date = new Date()): boolean {
  return reference >= overdueThreshold(dueDate)
}

// For Prisma queries filtering `due_date: { lt: ... }` — the bound a stored
// due_date must be strictly before to count as overdue right now (i.e. the
// inverse of overdueThreshold, solved for dueDate instead of reference).
export function overdueQueryCutoff(reference: Date = new Date()): Date {
  return new Date(reference.getTime() - 24 * 60 * 60 * 1000)
}

// ----------------------
// 1.1 INVOICE CALCULATIONS
// ----------------------
export function calculateLineSubtotal(quantity: number, unitPrice: number): number {
  try {
    return round2dp((Number(quantity) || 0) * (Number(unitPrice) || 0))
  } catch {
    return 0
  }
}

export function calculateLineTax(subtotal: number, taxRate: number): number {
  try {
    return round2dp((Number(subtotal) || 0) * ((Number(taxRate) || 0) / 100))
  } catch {
    return 0
  }
}

export function calculateLineTotal(quantity: number, unitPrice: number, taxRate: number): { subtotal: number; taxAmount: number; lineTotal: number } {
  const subtotal = calculateLineSubtotal(quantity, unitPrice)
  const taxAmount = calculateLineTax(subtotal, taxRate)
  const lineTotal = round2dp(subtotal + taxAmount)
  return { subtotal, taxAmount, lineTotal }
}

export function calculateInvoiceTotals(
  lines: Array<{ quantity: number; unitPrice?: number; unit_price?: number; taxRate?: number; tax_rate?: number }>,
  invoiceVatRate = 0
): { subtotal: number; taxAmount: number; totalAmount: number; subTotal?: number; taxTotal?: number } {
  let subtotal = 0
  let taxAmount = 0
  // Use per-line rounding before summing to match common accounting rules
  for (const line of lines || []) {
    const qty = Number(line.quantity) || 0
    const price = Number(line.unitPrice ?? line.unit_price) || 0
    const rate = Number(line.taxRate ?? line.tax_rate ?? 0) || 0
    const s = calculateLineSubtotal(qty, price)
    // prefer per-line tax rate; if not present or zero, fall back to invoice-level VAT rate
    const effectiveRate = rate > 0 ? rate : Number(invoiceVatRate || 0)
    const t = calculateLineTax(s, effectiveRate)
    subtotal += s
    taxAmount += t
  }
  subtotal = round2dp(subtotal)
  taxAmount = round2dp(taxAmount)
  const totalAmount = round2dp(subtotal + taxAmount)
  // include alternate key names for backward compatibility (subTotal, taxTotal)
  return { subtotal, taxAmount, totalAmount, subTotal: subtotal, taxTotal: taxAmount }
}

export function calculateBalanceDue(totalAmount: number, paidAmount: number): number {
  const ta = Number(totalAmount) || 0
  const pa = Number(paidAmount) || 0
  return round2dp(Math.max(0, ta - pa))
}

export function determineInvoiceStatus(totalAmount: number, paidAmount: number, dueDate: Date): 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' {
  const ta = Number(totalAmount) || 0
  const pa = Number(paidAmount) || 0
  if (pa >= ta && ta > 0) return 'PAID'
  if (pa > 0 && pa < ta) return 'PARTIAL'
  if (isPastDue(dueDate) && pa === 0) return 'OVERDUE'
  return 'UNPAID'
}

// ----------------------
// 1.2 BANK & BALANCE CALCULATIONS
// ----------------------
export function calculateNewBankBalance(currentBalance: number, movement: number, direction: 'IN' | 'OUT'): number {
  const cb = Number(currentBalance) || 0
  const mv = Number(movement) || 0
  if (direction === 'IN') return round2dp(cb + mv)
  if (direction === 'OUT') return round2dp(cb - mv)
  return round2dp(cb)
}

export function calculateTotalCashPosition(bankBalances: number[]): number {
  const sum = (bankBalances || []).reduce((s, b) => s + (Number(b) || 0), 0)
  return round2dp(sum)
}

export function calculateTransferImpact(fromBalance: number, toBalance: number, amount: number): { newFromBalance: number; newToBalance: number; valid: boolean; reason?: string } {
  const from = Number(fromBalance) || 0
  const to = Number(toBalance) || 0
  const amt = Number(amount) || 0
  if (amt <= 0) return { newFromBalance: from, newToBalance: to, valid: false, reason: 'Amount must be greater than zero' }
  if (from < amt) return { newFromBalance: from, newToBalance: to, valid: false, reason: `Insufficient balance. Available: ${round2dp(from)}, Required: ${round2dp(amt)}` }
  return { newFromBalance: round2dp(from - amt), newToBalance: round2dp(to + amt), valid: true }
}

// ----------------------
// 1.3 PAYROLL CALCULATIONS
// ----------------------
export function calculateHoursWorked(checkIn: Date, checkOut: Date): number {
  try {
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
    const hours = diff / (1000 * 60 * 60)
    return round2dp(Math.max(0, hours))
  } catch {
    return 0
  }
}

export function calculateOvertimeHours(hoursWorked: number, standardHoursPerDay = 8): number {
  return round2dp(Math.max(0, (Number(hoursWorked) || 0) - (Number(standardHoursPerDay) || 0)))
}

export function calculateBasicSalary(hoursWorked: number, hourlyRate: number): number {
  return round2dp((Number(hoursWorked) || 0) * (Number(hourlyRate) || 0))
}

export function calculateOvertimePay(overtimeHours: number, hourlyRate: number, multiplier = 1.5): number {
  return round2dp((Number(overtimeHours) || 0) * (Number(hourlyRate) || 0) * (Number(multiplier) || 1.5))
}

export function calculatePayslipEarning(item: { calculationMethod: string; fixedAmount?: number; percentage?: number }, basicSalary: number): number {
  const method = item?.calculationMethod ?? ''
  if (method === 'FIXED') return round2dp(Number(item.fixedAmount) || 0)
  if (method === 'PERCENTAGE_OF_BASIC') return round2dp((Number(basicSalary) || 0) * ((Number(item.percentage) || 0) / 100))
  return 0
}

export function calculatePayslipDeduction(item: { calculationMethod: string; fixedAmount?: number; percentage?: number }, basicSalary: number, grossPay: number): number {
  const method = item?.calculationMethod ?? ''
  if (method === 'FIXED') return round2dp(Number(item.fixedAmount) || 0)
  if (method === 'PERCENTAGE_OF_BASIC') return round2dp((Number(basicSalary) || 0) * ((Number(item.percentage) || 0) / 100))
  if (method === 'PERCENTAGE_OF_GROSS') return round2dp((Number(grossPay) || 0) * ((Number(item.percentage) || 0) / 100))
  return 0
}

export function calculateGrossPay(basicSalary: number, overtimePay: number, earnings: number[]): number {
  // Apply per-item rounding for earnings before summing to match payroll rules
  const totalEarnings = (earnings || []).reduce((s, e) => {
    const val = Number(e) || 0
    return s + round2dp(val)
  }, 0)
  return round2dp((Number(basicSalary) || 0) + (Number(overtimePay) || 0) + totalEarnings)
}

export function calculateNetPay(grossPay: number, deductions: number[]): number {
  // Apply per-item rounding for deductions before summing
  const totalDeductions = (deductions || []).reduce((s, d) => {
    const val = Number(d) || 0
    return s + round2dp(val)
  }, 0)
  return round2dp(Math.max(0, (Number(grossPay) || 0) - totalDeductions))
}

export function calculatePayrollTotals(payslips: Array<{ grossPay: number; totalDeductions: number; netPay: number }>): { totalGross: number; totalDeductions: number; totalNet: number } {
  const totalGross = round2dp((payslips || []).reduce((s, p) => s + (Number(p.grossPay) || 0), 0))
  const totalDeductions = round2dp((payslips || []).reduce((s, p) => s + (Number(p.totalDeductions) || 0), 0))
  const totalNet = round2dp((payslips || []).reduce((s, p) => s + (Number(p.netPay) || 0), 0))
  return { totalGross, totalDeductions, totalNet }
}

// ----------------------
// 1.4 ASSET DEPRECIATION
// ----------------------
export function calculateMonthlyDepreciation(purchasePrice: number, usefulLifeYears: number): number {
  const pp = Number(purchasePrice) || 0
  const life = Number(usefulLifeYears) || 0
  if (life <= 0) return 0
  return round2dp(pp / (life * 12))
}

export function calculateCurrentAssetValue(purchasePrice: number, accumulatedDepreciation: number): number {
  return round2dp(Math.max(0, (Number(purchasePrice) || 0) - (Number(accumulatedDepreciation) || 0)))
}

export function calculateNewAccumulatedDepreciation(current: number, purchasePrice: number, monthlyDep: number): number {
  const c = Number(current) || 0
  const pp = Number(purchasePrice) || 0
  const md = Number(monthlyDep) || 0
  return round2dp(Math.min(c + md, pp))
}

// ----------------------
// 1.5 INVENTORY CALCULATIONS
// ----------------------
export function calculateInventoryValue(quantity: number, unitCost: number): number {
  return round2dp((Number(quantity) || 0) * (Number(unitCost) || 0))
}

export function isLowStock(quantityOnHand: number, reorderLevel: number): boolean {
  return (Number(quantityOnHand) || 0) <= (Number(reorderLevel) || 0)
}

// ----------------------
// 1.6 EXCHANGE RATE CALCULATIONS
// ----------------------
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string, rate: number): number {
  if (fromCurrency === toCurrency) return round2dp(Number(amount) || 0)
  return round2dp((Number(amount) || 0) * (Number(rate) || 0))
}

// ----------------------
// 1.7 OUTSTANDING BALANCE CALCULATIONS
// ----------------------
export function calculateCustomerOutstandingBalance(invoices: Array<{ totalAmount: number; paidAmount: number; status: string }>): number {
  const sum = (invoices || [])
    .filter((inv) => inv?.status !== 'VOID')
    .reduce((s, inv) => s + Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.paidAmount) || 0)), 0)
  return round2dp(sum)
}

export function calculateSupplierOutstandingBalance(bills: Array<{ totalAmount: number; paidAmount: number; status: string }>): number {
  const sum = (bills || [])
    .filter((b) => b?.status !== 'VOID')
    .reduce((s, b) => s + Math.max(0, (Number(b.totalAmount) || 0) - (Number(b.paidAmount) || 0)), 0)
  return round2dp(sum)
}

// ----------------------
// 1.8 DASHBOARD KPI CALCULATIONS
// ----------------------
export function calculateNetProfit(totalRevenue: number, totalExpenses: number): number {
  return round2dp((Number(totalRevenue) || 0) - (Number(totalExpenses) || 0))
}

export function calculateAttendanceRate(present: number, total: number): number {
  if (!total || Number(total) === 0) return 0
  return round2dp((Number(present) || 0) / Number(total) * 100)
}

export function calculateQuoteConversionRate(accepted: number, total: number): number {
  if (!total || Number(total) === 0) return 0
  return round2dp((Number(accepted) || 0) / Number(total) * 100)
}

export function calculateWeightedPipelineValue(leads: Array<{ estimatedValue: number; probability: number }>): number {
  const sum = (leads || []).reduce((s, lead) => s + ((Number(lead.estimatedValue) || 0) * ((Number(lead.probability) || 0) / 100)), 0)
  return round2dp(sum)
}

export function calculatePatrolComplianceRate(completed: number, total: number): number {
  if (!total || Number(total) === 0) return 0
  return round2dp((Number(completed) || 0) / Number(total) * 100)
}

export function calculateAgedBalance(invoices: Array<{ balanceDue: number; dueDate: Date; status: string }>): { current: number; days1to30: number; days31to60: number; days61to90: number; days91plus: number; total: number } {
  const today = new Date()
  const result = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days91plus: 0 }
  for (const inv of invoices || []) {
    if (!inv || ['PAID', 'VOID'].includes(inv.status)) continue
    const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    const amt = round2dp(Number(inv.balanceDue) || 0)
    if (daysOverdue <= 0) result.current += amt
    else if (daysOverdue <= 30) result.days1to30 += amt
    else if (daysOverdue <= 60) result.days31to60 += amt
    else if (daysOverdue <= 90) result.days61to90 += amt
    else result.days91plus += amt
  }
  // round all buckets
  result.current = round2dp(result.current)
  result.days1to30 = round2dp(result.days1to30)
  result.days31to60 = round2dp(result.days31to60)
  result.days61to90 = round2dp(result.days61to90)
  result.days91plus = round2dp(result.days91plus)
  const total = round2dp(result.current + result.days1to30 + result.days31to60 + result.days61to90 + result.days91plus)
  return { ...result, total }
}

// ----------------------
// Exports for backward compatibility
// ----------------------
// Provide older function names used across the codebase as aliases.
export const calculateInvoiceLineTotal = (q: number, p: number, r: number) => {
  const res = calculateLineTotal(q, p, r)
  // original shape expected: { lineTotal, taxAmount, subtotal }
  return { lineTotal: res.lineTotal, taxAmount: res.taxAmount, subtotal: res.subtotal }
}

export const calculatePayslipItem = (item: any, basicSalary: number, grossPay: number) => {
  // earlier implementation returned either earning or deduction depending on context
  // prefer deduction when PERCENTAGE_OF_GROSS used, otherwise percentage of basic
  const method = item?.calculationMethod ?? ''
  if (method === 'PERCENTAGE_OF_GROSS') return calculatePayslipDeduction(item, basicSalary, grossPay)
  if (method === 'PERCENTAGE_OF_BASIC' || method === 'FIXED') return calculatePayslipEarning(item, basicSalary)
  return 0
}

export const calculateStraightLineDepreciation = (purchasePrice: number, usefulLifeYears: number) => calculateMonthlyDepreciation(purchasePrice, usefulLifeYears)

export { round2dp }
