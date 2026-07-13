const fs = require('fs')
const path = require('path')
const backupPath = path.join(__dirname, '..', 'db-backup', 'ravenshield_backup.json')
function round2dp(v){ if(typeof v!=='number' || !isFinite(v)) return 0; return Math.round(v*100)/100 }
function calcLineSubtotal(q,p){ return round2dp((Number(q)||0)*(Number(p)||0)) }
function calcLineTax(subtotal, taxRate){ return round2dp((Number(subtotal)||0)*((Number(taxRate)||0)/100)) }
function calcInvoiceTotals(lines, invoiceVatRate = 0){
  let subtotal=0, tax=0
  for(const line of lines||[]){
    const s = calcLineSubtotal(line.quantity, line.unit_price ?? line.unitPrice)
    const rate = Number(line.tax_rate ?? line.taxRate ?? 0) || 0
    const effective = rate > 0 ? rate : Number(invoiceVatRate || 0)
    const t = calcLineTax(s, effective)
    subtotal += s
    tax += t
  }
  subtotal=round2dp(subtotal)
  tax=round2dp(tax)
  return {subtotal,tax,total:round2dp(subtotal+tax)}
}
function approxEqual(a,b){ return round2dp(a)===round2dp(b) }

console.log('Reading backup:', backupPath)
const raw = fs.readFileSync(backupPath,'utf8')
const data = JSON.parse(raw)
console.log('Top-level keys:')
for(const k of Object.keys(data)){
  const v = data[k]
  if(Array.isArray(v)) console.log('-',k, ': array length', v.length)
  else if(v && typeof v === 'object') console.log('-',k, ': object keys', Object.keys(v).length)
  else console.log('-',k, ':', typeof v)
}

// Invoice validations
if(Array.isArray(data.invoices)){
  console.log('\nValidating invoices... total invoices=', data.invoices.length)
  let mismatches = 0
  for(let i=0;i<Math.min(200,data.invoices.length);i++){
    const inv = data.invoices[i]
    // Pass invoice-level VAT rate as fallback to per-line tax rates
    const invoiceVat = Number(inv.vat_rate || inv.vatRate || 0)
    const computed = calcInvoiceTotals(inv.lines, invoiceVat)
    const fileSubtotal = Number(inv.subtotal || inv.subTotal || 0)
    const fileTax = Number(inv.tax_amount || inv.taxAmount || inv.vat_amount || 0)
    const fileTotal = Number(inv.total_amount || inv.totalAmount || inv.total || 0)
    if(!approxEqual(computed.subtotal, fileSubtotal) || !approxEqual(computed.tax, fileTax) || !approxEqual(computed.total, fileTotal)){
      mismatches++
      console.log('Invoice mismatch at index',i,'id',inv.id)
      console.log(' file subtotal/tax/total=',fileSubtotal,fileTax,fileTotal)
      console.log(' computed subtotal/tax/total=',computed.subtotal,computed.tax,computed.total)
      if(mismatches>10) break
    }
  }
  if(mismatches===0) console.log('Invoices look consistent (among first 200).')
  else console.log('Found',mismatches,'mismatches (first up to 10 listed).')
} else console.log('No invoices array found')

// Payslip validations
if(Array.isArray(data.payslips)){
  console.log('\nValidating payslips... total payslips=', data.payslips.length)
  let errors=0
  for(let i=0;i<Math.min(200,data.payslips.length);i++){
    const p = data.payslips[i]
    const basic = Number(p.basic_salary || 0)
    // Apply per-item rounding for earnings and deductions to match payroll rules
    const earnings = (p.earnings || []).reduce((s, it) => s + round2dp(Number(it.amount || 0)), 0)
    const deductions = (p.deductions || []).reduce((s, it) => s + round2dp(Number(it.amount || 0)), 0)
    const net = Number(p.net_pay || 0)
    const computed = round2dp(basic + earnings - deductions)
    if(!approxEqual(net, computed)){
      errors++
      console.log('Payslip mismatch idx',i,'id',p.id,'employee',p.employee_name)
      console.log(' file basic/earnings/deductions/net=',basic,earnings,deductions,net)
      console.log(' computed net=',computed)
      if(errors>10) break
    }
  }
  if(errors===0) console.log('Payslips net pay calculations look consistent (first 200).')
  else console.log('Found',errors,'payslip mismatches (first up to 10 listed).')
} else console.log('No payslips array found')

console.log('\nQuick summary checks complete.')
process.exit(0)
