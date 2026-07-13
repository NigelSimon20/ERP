# Database Migration Guide for Raven Shield ERP

## Overview
This guide walks through importing the complete database backup (`db-backup/ravenshield_backup.json`) to Supabase and ensuring all data integrity.

## Prerequisites

1. **Supabase Project**: Active and running
2. **Database URL**: Set in `.env` file as `DATABASE_URL`
3. **Prisma**: Installed (`npm install` already done)
4. **Node.js**: v16+ installed

## Supabase Configuration

1. Open your Supabase project dashboard.
2. Go to `Settings` → `Database` → `Connection string`.
3. Copy the PostgreSQL connection URL.

   Example:
   ```bash
   postgresql://postgres:Ravenshield$$!2026@db.yachjdzjfckvobsezwmi.supabase.co:5432/postgres
   ```

4. In the repo root, create or update `.env` with:
   ```env
   DATABASE_URL="postgresql://postgres:Ravenshield$$!2026@db.yachjdzjfckvobsezwmi.supabase.co:5432/postgres"
   ```

5. If you forgot the password, reset it in Supabase under `Settings` → `Database` and then update the `DATABASE_URL`.

6. Optional: install Supabase agent skills for better AI-assisted Supabase commands:
   ```bash
   npx skills add supabase/agent-skills
   ```

## Tables Being Migrated

### 1. Settings (System Configuration)
- **Backup table**: `settings`
- **Prisma model**: `Company`
- **Field mapping**:
  - `company_name` → `name`
  - `email` → `email`
  - `default_currency` → `currency`
  - `default_vat_rate` → `taxRate`
  - `fiscal_year_start` → `fiscalYearStart`

### 2. Chart of Accounts (Accounting)
- **Backup table**: `chartOfAccounts`
- **Prisma model**: `ChartOfAccount`
- **Records**: 50+ accounts across all types (Asset, Liability, Equity, Revenue, Expense)
- **Data validation**: All account codes are unique

### 3. Employees/Guards
- **Backup table**: `employees`
- **Prisma model**: `Guard`
- **Records**: 20+ active employees
- **Key fields**: employeeNumber, name, phone, hireDate, hourlyRate, status

### 4. Sites (Operations)
- **Backup table**: `sites`
- **Prisma model**: `Site`
- **Records**: Multiple security sites with contract details
- **Key fields**: name, address, contractValue, guardsRequired, status

### 5. Attendance Records
- **Backup table**: `attendance`
- **Prisma model**: `Attendance`
- **Records**: Daily attendance logs
- **Key fields**: guardId, siteId, date, checkIn, checkOut, hoursWorked, status

### 6. Bank Accounts
- **Backup table**: `bankAccounts`
- **Prisma model**: `BankAccount`
- **Records**: Multiple bank accounts in different currencies
- **Key fields**: bankName, accountNumber, accountType, currentBalance

### 7. Invoices
- **Backup table**: `invoices`
- **Prisma model**: `SalesInvoice` + `InvoiceLineItem`
- **Records**: 32+ invoices
- **Key fields**: invoiceNumber, customerId, totalAmount, status, lineItems

### 8. Payments
- **Backup table**: `payments`
- **Prisma model**: `Payment`
- **Key fields**: reference, amount, paymentDate, method, status

### 9. Payslips
- **Backup table**: `payslips`
- **Prisma model**: `Payslip` + `PayslipLine`
- **Key fields**: payDate, employeeId, grossPay, netPay, deductions

### 10. Journal Entries
- **Backup table**: `journalEntries`
- **Prisma model**: `JournalEntry` + `JournalLine`
- **Records**: 500+ entries
- **Key fields**: reference, entryDate, description, status, lines

### 11. Customers
- **Backup table**: `customers`
- **Prisma model**: `Customer`
- **Records**: Active customer list
- **Key fields**: name, email, phone, paymentTerms, creditLimit

### 12. Suppliers
- **Backup table**: `suppliers`
- **Prisma model**: `Supplier`
- **Records**: Vendor/supplier list
- **Key fields**: name, email, phone, paymentTerms

### 13. Equipment
- **Backup table**: `equipment`
- **Prisma model**: `Equipment`
- **Records**: Security equipment inventory
- **Key fields**: name, serialNumber, category, status, condition

## Step-by-Step Migration Process

### Step 1: Prepare Database
```bash
# Ensure Supabase database is running
# Verify connection
npx prisma db push --skip-generate

# Generate Prisma client
npx prisma generate
```

### Step 2: Run Migration Script
```bash
# Execute the import
npx ts-node scripts/import-backup.ts

# Or compile first:
npx tsc scripts/import-backup.ts
node scripts/import-backup.js
```

### Step 3: Validate Data
```bash
# Check counts
npx prisma studio

# Or run validation query
npx ts-node scripts/validate-import.ts
```

## Data Validation Checklist

- [ ] Company settings imported correctly
- [ ] All 50+ chart of accounts present
- [ ] All employees/guards have required fields
- [ ] Sites linked to customers where applicable
- [ ] Attendance records have valid guard and site references
- [ ] All invoices have line items
- [ ] Bank accounts show correct balances
- [ ] Journal entries are balanced (debit = credit)
- [ ] Payslips reference valid guards and payroll runs
- [ ] All dates are valid (no future dates or null dates where required)
- [ ] Currencies match supported list (USD, ZWL, ZAR)
- [ ] No duplicate records (unique constraints satisfied)

## Handling Errors

### Common Issues:

1. **FK Constraint Error** - Foreign key reference not found
   - Solution: Ensure parent records are imported first
   - Order: Company → Users → Guards → Sites → Deployments

2. **Unique Constraint Error** - Duplicate record found
   - Solution: Check backup for duplicates, clean before import
   - Use UPSERT to handle existing records

3. **Data Type Mismatch** - Field value incompatible
   - Solution: Check mapping in import script
   - Validate decimal places for prices/amounts

4. **Date Parse Error** - Invalid date format
   - Solution: Use ISO 8601 format (YYYY-MM-DD)
   - Handle timezone differences

## Non-AI Features to Test Post-Import

After successful import, test these features (no AI involved):

1. **Dashboard**
   - View summary statistics
   - Check KPI cards with imported data

2. **Operations**
   - List all sites from import
   - View deployments for each site
   - Check attendance records
   - View incidents and patrols

3. **Finance**
   - View chart of accounts
   - Check journal entries
   - Generate reports from imported data
   - View invoices and payments

4. **HR**
   - List all employees
   - View payroll runs
   - Check payslips
   - View attendance history

5. **Business Development**
   - View customers
   - Check quotations
   - View customer profiles with contract data

## Rollback Procedure

If import fails and data is inconsistent:

```bash
# Option 1: Reset tables (careful - deletes data)
npx prisma migrate reset

# Option 2: Manually delete records
npx prisma studio

# Option 3: Restore from backup point
# Contact Supabase support for database restore
```

## Performance Notes

- Total records: ~2000+ across all tables
- Import time: ~2-5 minutes (depending on connection)
- Memory usage: ~50-100MB
- Recommended: Run during off-peak hours

## Support & Troubleshooting

1. Check `.env` file for correct DATABASE_URL
2. Verify Supabase project is active
3. Check network connectivity to AWS EU region
4. Review Prisma logs in `/tmp/prisma*.log`
5. Test connection: `psql $(grep DATABASE_URL .env | cut -d'"' -f2)`

---

**Version**: 1.0
**Last Updated**: 2026-06-26
**Project**: Raven Shield ERP
