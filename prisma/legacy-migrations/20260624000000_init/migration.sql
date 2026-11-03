-- Ravenshield Security ERP — Initial Migration
-- Run this in your Supabase SQL Editor

-- ENUMS
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN','ADMIN','FINANCE_MANAGER','OPERATIONS_MANAGER','HR_MANAGER','BD_MANAGER','STAFF','GUARD','CLIENT','READ_ONLY');
CREATE TYPE "GuardStatus" AS ENUM ('ACTIVE','INACTIVE','SUSPENDED','TERMINATED');
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE','INACTIVE','SUSPENDED');
CREATE TYPE "ShiftType" AS ENUM ('DAY','NIGHT','FULLDAY','ROTATING');
CREATE TYPE "DeploymentStatus" AS ENUM ('ACTIVE','COMPLETED','CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT','ABSENT','LATE','HALF_DAY','LEAVE');
CREATE TYPE "Severity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN','INVESTIGATING','RESOLVED','CLOSED');
CREATE TYPE "PatrolStatus" AS ENUM ('SCHEDULED','COMPLETED','MISSED','DELAYED');
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE','ASSIGNED','REPAIR','RETIRED');
CREATE TYPE "CoverageStatus" AS ENUM ('PENDING','APPROVED','FULFILLED','REJECTED');
CREATE TYPE "AccountType" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT','POSTED','VOID');
CREATE TYPE "TransferStatus" AS ENUM ('PENDING','COMPLETED','CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID','PARTIAL','PAID','OVERDUE','VOID');
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE','DISPOSED','SOLD');
CREATE TYPE "PayItemType" AS ENUM ('EARNING','DEDUCTION');
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT','CONFIRMED','PAID');
CREATE TYPE "PayslipStatus" AS ENUM ('PENDING','PAID');
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE "LeadStatus" AS ENUM ('NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED');
CREATE TYPE "Priority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING','IN_REVIEW','APPROVED','REJECTED','COMPLETED');
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED','COMPLETED','CANCELLED');

-- COMPANY & USERS
CREATE TABLE "companies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "logo" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'STAFF',
  "department" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "avatar" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "lastLogin" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "users_companyId_idx" ON "users"("companyId");
CREATE INDEX "users_email_idx" ON "users"("email");

-- GUARDS / EMPLOYEES
CREATE TABLE "guards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "idNumber" TEXT NOT NULL UNIQUE,
  "phone" TEXT NOT NULL,
  "whatsapp" TEXT,
  "email" TEXT,
  "department" TEXT,
  "rank" TEXT,
  "status" "GuardStatus" NOT NULL DEFAULT 'ACTIVE',
  "hireDate" TIMESTAMP(3) NOT NULL,
  "hourlyRate" DECIMAL(10,2) NOT NULL,
  "basicSalary" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "bankAccount" TEXT,
  "bankName" TEXT,
  "bankBranch" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "guards_companyId_idx" ON "guards"("companyId");
CREATE INDEX "guards_status_idx" ON "guards"("status");

-- OPERATIONS
CREATE TABLE "sites" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "customerId" TEXT,
  "contractValue" DECIMAL(15,2) NOT NULL,
  "contractStart" TIMESTAMP(3),
  "contractEnd" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "guardsRequired" INTEGER NOT NULL DEFAULT 1,
  "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  -- Backward-compatible fields from legacy backup
  "contact_phone" TEXT,
  "city" TEXT,
  "site_code" TEXT,
  "coverage_schedule" TEXT,
  "equipment_requirements" TEXT,
  "contract_start_date" TEXT,
  "contract_end_date_text" TEXT,
  "night_shift_shortage" INTEGER,
  "day_shift_assigned" INTEGER,
  "special_instructions" TEXT,
  "is_active" BOOLEAN,
  "contact_person" TEXT,
  "billing_rate_day" DOUBLE PRECISION,
  "billing_rate_night" DOUBLE PRECISION,
  "night_shift_assigned" INTEGER,
  "site_name" TEXT,
  "day_shift_shortage" INTEGER,
  "risk_level" TEXT,
  "day_shift_required" INTEGER,
  "night_shift_required" INTEGER,
  "customer_name" TEXT,
  "allowances" TEXT,
  "created_date" TEXT,
  "updated_date" TEXT,
  "created_by_id" TEXT,
  "created_by" TEXT,
  "is_sample" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sites_companyId_idx" ON "sites"("companyId");
CREATE INDEX "sites_status_idx" ON "sites"("status");
CREATE INDEX "sites_customerId_idx" ON "sites"("customerId");

CREATE TABLE "deployments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "shiftType" "ShiftType" NOT NULL,
  "hoursPerDay" DECIMAL(4,2) NOT NULL,
  "ratePerHour" DECIMAL(10,2) NOT NULL,
  "status" "DeploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "deployments_guardId_idx" ON "deployments"("guardId");
CREATE INDEX "deployments_siteId_idx" ON "deployments"("siteId");
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

CREATE TABLE "attendance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "checkIn" TIMESTAMP(3),
  "checkOut" TIMESTAMP(3),
  "hoursWorked" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE("guardId","date")
);
CREATE INDEX "attendance_guardId_idx" ON "attendance"("guardId");
CREATE INDEX "attendance_siteId_idx" ON "attendance"("siteId");
CREATE INDEX "attendance_date_idx" ON "attendance"("date");

CREATE TABLE "incidents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "guardId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "Severity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "reportedBy" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "incidents_siteId_idx" ON "incidents"("siteId");
CREATE INDEX "incidents_guardId_idx" ON "incidents"("guardId");
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

CREATE TABLE "patrols" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "guardId" TEXT NOT NULL,
  "scheduledTime" TIMESTAMP(3) NOT NULL,
  "actualTime" TIMESTAMP(3),
  "status" "PatrolStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "patrols_siteId_idx" ON "patrols"("siteId");
CREATE INDEX "patrols_guardId_idx" ON "patrols"("guardId");
CREATE INDEX "patrols_status_idx" ON "patrols"("status");

CREATE TABLE "equipment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serialNumber" TEXT UNIQUE,
  "category" TEXT NOT NULL,
  "assignedTo" TEXT,
  "siteId" TEXT,
  "condition" TEXT NOT NULL,
  "purchaseDate" TIMESTAMP(3),
  "purchasePrice" DECIMAL(10,2),
  "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "equipment_companyId_idx" ON "equipment"("companyId");
CREATE INDEX "equipment_status_idx" ON "equipment"("status");

CREATE TABLE "coverage_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requiredGuards" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "CoverageStatus" NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "rejectionReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "coverage_requests_siteId_idx" ON "coverage_requests"("siteId");
CREATE INDEX "coverage_requests_status_idx" ON "coverage_requests"("status");

-- FINANCE
CREATE TABLE "chart_of_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL UNIQUE,
  "accountName" TEXT NOT NULL,
  "accountType" "AccountType" NOT NULL,
  "parentId" TEXT,
  "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "chart_of_accounts_companyId_idx" ON "chart_of_accounts"("companyId");
CREATE INDEX "chart_of_accounts_accountType_idx" ON "chart_of_accounts"("accountType");

CREATE TABLE "journal_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "totalDebit" DECIMAL(15,2) NOT NULL,
  "totalCredit" DECIMAL(15,2) NOT NULL,
  "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");
CREATE INDEX "journal_entries_entryDate_idx" ON "journal_entries"("entryDate");

CREATE TABLE "journal_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "description" TEXT,
  "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
  FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE
);
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

CREATE TABLE "bank_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "openingBalance" DECIMAL(15,2) NOT NULL,
  "currentBalance" DECIMAL(15,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");

CREATE TABLE "bank_transfers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromAccountId" TEXT NOT NULL,
  "toAccountId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "notes" TEXT,
  "status" "TransferStatus" NOT NULL DEFAULT 'COMPLETED',
  "journalEntryId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bank_transfers_fromAccountId_idx" ON "bank_transfers"("fromAccountId");
CREATE INDEX "bank_transfers_toAccountId_idx" ON "bank_transfers"("toAccountId");

CREATE TABLE "customers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "paymentTerms" INTEGER NOT NULL DEFAULT 30,
  "creditLimit" DECIMAL(15,2) NOT NULL,
  "outstandingBal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "paymentTerms" INTEGER NOT NULL DEFAULT 30,
  "outstandingBal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "suppliers_companyId_idx" ON "suppliers"("companyId");

CREATE TABLE "sales_invoices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "subtotal" DECIMAL(15,2) NOT NULL,
  "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "balanceDue" DECIMAL(15,2) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sales_invoices_companyId_idx" ON "sales_invoices"("companyId");
CREATE INDEX "sales_invoices_customerId_idx" ON "sales_invoices"("customerId");
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");
CREATE INDEX "sales_invoices_dueDate_idx" ON "sales_invoices"("dueDate");

CREATE TABLE "invoice_line_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPrice" DECIMAL(15,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(15,2) NOT NULL,
  FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE
);
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

CREATE TABLE "purchase_invoices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "subtotal" DECIMAL(15,2) NOT NULL,
  "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "balanceDue" DECIMAL(15,2) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "purchase_invoices_companyId_idx" ON "purchase_invoices"("companyId");
CREATE INDEX "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");
CREATE INDEX "purchase_invoices_status_idx" ON "purchase_invoices"("status");

CREATE TABLE "purchase_invoice_line_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseInvoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPrice" DECIMAL(15,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(15,2) NOT NULL,
  "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(15,2) NOT NULL,
  FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE
);
CREATE INDEX "purchase_invoice_line_items_purchaseInvoiceId_idx" ON "purchase_invoice_line_items"("purchaseInvoiceId");

CREATE TABLE "payments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "amount" DECIMAL(15,2) NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");
CREATE INDEX "payments_bankAccountId_idx" ON "payments"("bankAccountId");
CREATE INDEX "payments_entityId_idx" ON "payments"("entityId");

CREATE TABLE "receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "amount" DECIMAL(15,2) NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "receipts_companyId_idx" ON "receipts"("companyId");
CREATE INDEX "receipts_customerId_idx" ON "receipts"("customerId");
CREATE INDEX "receipts_invoiceId_idx" ON "receipts"("invoiceId");

CREATE TABLE "fixed_assets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "purchaseDate" TIMESTAMP(3) NOT NULL,
  "purchasePrice" DECIMAL(15,2) NOT NULL,
  "usefulLifeYears" INTEGER NOT NULL,
  "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
  "accumulatedDepreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "currentValue" DECIMAL(15,2) NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "fixed_assets_companyId_idx" ON "fixed_assets"("companyId");

CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantityOnHand" DECIMAL(10,2) NOT NULL,
  "reorderLevel" DECIMAL(10,2) NOT NULL,
  "unitCost" DECIMAL(15,2) NOT NULL,
  "totalValue" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "inventory_items_companyId_idx" ON "inventory_items"("companyId");

CREATE TABLE "bank_reconciliations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bankAccountId" TEXT NOT NULL,
  "reconcileDate" TIMESTAMP(3) NOT NULL,
  "statementBalance" DECIMAL(15,2) NOT NULL,
  "bookBalance" DECIMAL(15,2) NOT NULL,
  "difference" DECIMAL(15,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bank_reconciliations_bankAccountId_idx" ON "bank_reconciliations"("bankAccountId");

CREATE TABLE "exchange_rates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "baseCurrency" TEXT NOT NULL,
  "targetCurrency" TEXT NOT NULL,
  "rate" DECIMAL(15,6) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "exchange_rates_baseCurrency_idx" ON "exchange_rates"("baseCurrency");
CREATE INDEX "exchange_rates_effectiveDate_idx" ON "exchange_rates"("effectiveDate");

CREATE TABLE "lock_dates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "lockedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "lock_dates_companyId_idx" ON "lock_dates"("companyId");

-- HR & PAYROLL
CREATE TABLE "departments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "managerId" TEXT,
  "budget" DECIMAL(15,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "departments_companyId_idx" ON "departments"("companyId");

CREATE TABLE "employee_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardId" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "branch" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "employee_accounts_guardId_idx" ON "employee_accounts"("guardId");

CREATE TABLE "payslip_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemType" "PayItemType" NOT NULL,
  "calculationMethod" TEXT NOT NULL,
  "fixedAmount" DECIMAL(10,2),
  "percentage" DECIMAL(5,2),
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payslip_items_companyId_idx" ON "payslip_items"("companyId");

CREATE TABLE "payroll_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "totalGross" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalDeductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalNet" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "processedBy" TEXT NOT NULL,
  "bankAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payroll_runs_companyId_idx" ON "payroll_runs"("companyId");
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

CREATE TABLE "payslips" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payrollRunId" TEXT NOT NULL,
  "guardId" TEXT NOT NULL,
  "basicSalary" DECIMAL(10,2) NOT NULL,
  "overtimePay" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "grossPay" DECIMAL(10,2) NOT NULL,
  "totalDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "netPay" DECIMAL(10,2) NOT NULL,
  "hoursWorked" DECIMAL(6,2) NOT NULL,
  "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "status" "PayslipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id")
);
CREATE INDEX "payslips_payrollRunId_idx" ON "payslips"("payrollRunId");
CREATE INDEX "payslips_guardId_idx" ON "payslips"("guardId");

CREATE TABLE "payslip_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payslipId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "itemType" "PayItemType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  FOREIGN KEY ("payslipId") REFERENCES "payslips"("id")
);
CREATE INDEX "payslip_lines_payslipId_idx" ON "payslip_lines"("payslipId");

CREATE TABLE "leave_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "leaveType" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "daysRequested" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "rejectionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "leave_requests_guardId_idx" ON "leave_requests"("guardId");
CREATE INDEX "leave_requests_companyId_idx" ON "leave_requests"("companyId");
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- BUSINESS DEVELOPMENT
CREATE TABLE "leads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactEmail" TEXT,
  "source" TEXT,
  "industry" TEXT,
  "estimatedValue" DECIMAL(15,2) NOT NULL,
  "probability" INTEGER NOT NULL DEFAULT 0,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "assignedTo" TEXT,
  "notes" TEXT,
  "lostReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "leads_companyId_idx" ON "leads"("companyId");
CREATE INDEX "leads_status_idx" ON "leads"("status");

CREATE TABLE "quotations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "leadId" TEXT,
  "customerId" TEXT,
  "quoteNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "subtotal" DECIMAL(15,2) NOT NULL,
  "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(15,2) NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "quotations_companyId_idx" ON "quotations"("companyId");
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

CREATE TABLE "quotation_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "quotationId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPrice" DECIMAL(15,2) NOT NULL,
  "total" DECIMAL(15,2) NOT NULL,
  FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE
);
CREATE INDEX "quotation_items_quotationId_idx" ON "quotation_items"("quotationId");

CREATE TABLE "client_liaisons" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "guardId" TEXT,
  "userId" TEXT,
  "siteId" TEXT,
  "role" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "client_liaisons_customerId_idx" ON "client_liaisons"("customerId");

-- TASKS & REQUESTS
CREATE TABLE "tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "assignedTo" TEXT NOT NULL,
  "assignedBy" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "whatsappReminder" BOOLEAN NOT NULL DEFAULT false,
  "reminderTime" TIMESTAMP(3),
  "reminderSent" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "tasks_companyId_idx" ON "tasks"("companyId");
CREATE INDEX "tasks_assignedTo_idx" ON "tasks"("assignedTo");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

CREATE TABLE "requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "assignedTo" TEXT,
  "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "approvalNote" TEXT,
  "whatsappReminder" BOOLEAN NOT NULL DEFAULT false,
  "reminderTime" TIMESTAMP(3),
  "reminderSent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "requests_companyId_idx" ON "requests"("companyId");
CREATE INDEX "requests_requestedBy_idx" ON "requests"("requestedBy");
CREATE INDEX "requests_status_idx" ON "requests"("status");

CREATE TABLE "meetings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "organizerId" TEXT NOT NULL,
  "location" TEXT,
  "meetingDate" TIMESTAMP(3) NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "whatsappReminder" BOOLEAN NOT NULL DEFAULT false,
  "reminderTime" TIMESTAMP(3),
  "reminderSent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "meetings_companyId_idx" ON "meetings"("companyId");
CREATE INDEX "meetings_status_idx" ON "meetings"("status");
CREATE INDEX "meetings_meetingDate_idx" ON "meetings"("meetingDate");

CREATE TABLE "meeting_attendees" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "meetingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "attendanceStatus" TEXT NOT NULL DEFAULT 'INVITED',
  FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE
);
CREATE INDEX "meeting_attendees_meetingId_idx" ON "meeting_attendees"("meetingId");
CREATE INDEX "meeting_attendees_userId_idx" ON "meeting_attendees"("userId");

-- SYSTEM
CREATE TABLE "notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "link" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
CREATE INDEX "notifications_companyId_idx" ON "notifications"("companyId");
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

CREATE TABLE "file_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "folder" TEXT NOT NULL DEFAULT 'general',
  "linkedModule" TEXT,
  "linkedId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "file_records_companyId_idx" ON "file_records"("companyId");
CREATE INDEX "file_records_folder_idx" ON "file_records"("folder");
CREATE INDEX "file_records_linkedModule_idx" ON "file_records"("linkedModule");

CREATE TABLE "audit_trail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "recordId" TEXT,
  "oldValues" JSONB,
  "newValues" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "audit_trail_companyId_idx" ON "audit_trail"("companyId");
CREATE INDEX "audit_trail_userId_idx" ON "audit_trail"("userId");
CREATE INDEX "audit_trail_module_idx" ON "audit_trail"("module");
CREATE INDEX "audit_trail_createdAt_idx" ON "audit_trail"("createdAt");

CREATE TABLE "otp_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "otp_tokens_email_idx" ON "otp_tokens"("email");

-- Required by Prisma migrate tracking
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
