-- Sales-side document backlog: Proforma Invoice, Credit Note, Debit Note --
-- deferred from the Phase 4 document-suite plan as net-new business features.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "proforma_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_proforma_number" INTEGER DEFAULT 1;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_note_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_credit_note_number" INTEGER DEFAULT 1;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "debit_note_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_debit_note_number" INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS "proforma_invoices" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "proformaNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "convertedInvoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "proforma_invoices_companyId_idx" ON "proforma_invoices"("companyId");
CREATE INDEX IF NOT EXISTS "proforma_invoices_customerId_idx" ON "proforma_invoices"("customerId");

CREATE TABLE IF NOT EXISTS "proforma_invoice_lines" (
  "id" TEXT PRIMARY KEY,
  "proformaInvoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_notes" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "salesInvoiceId" TEXT,
  "creditNoteNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "credit_notes_companyId_idx" ON "credit_notes"("companyId");
CREATE INDEX IF NOT EXISTS "credit_notes_customerId_idx" ON "credit_notes"("customerId");

CREATE TABLE IF NOT EXISTS "credit_note_lines" (
  "id" TEXT PRIMARY KEY,
  "creditNoteId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS "debit_notes" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT,
  "debitNoteNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "debit_notes_companyId_idx" ON "debit_notes"("companyId");
CREATE INDEX IF NOT EXISTS "debit_notes_supplierId_idx" ON "debit_notes"("supplierId");

CREATE TABLE IF NOT EXISTS "debit_note_lines" (
  "id" TEXT PRIMARY KEY,
  "debitNoteId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoice_lines" ADD CONSTRAINT "proforma_invoice_lines_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "debit_notes"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
