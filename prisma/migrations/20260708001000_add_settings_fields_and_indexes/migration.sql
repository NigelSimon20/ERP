-- Company settings fields: most of the document-numbering / config fields
-- the app now reads (invoicePrefix, nextInvoiceNumber, quotationPrefix, etc.)
-- already exist on "companies" as snake_case columns holding real imported
-- production data (e.g. next_invoice_number = 33, force_number_prefix =
-- 'RS') — schema.prisma now @map's to them directly, so nothing to add here.
-- Only genuinely new fields (no data anywhere, camelCase columns match the
-- Prisma field name with no @map) need ADD COLUMN.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "motto" TEXT,
  ADD COLUMN IF NOT EXISTS "favicon" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryColor" TEXT,
  ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT,
  ADD COLUMN IF NOT EXISTS "accentColor" TEXT,
  ADD COLUMN IF NOT EXISTS "sidebarColor" TEXT,
  ADD COLUMN IF NOT EXISTS "headerColor" TEXT,
  ADD COLUMN IF NOT EXISTS "buttonColor" TEXT,
  ADD COLUMN IF NOT EXISTS "pdfThemeColor" TEXT,
  ADD COLUMN IF NOT EXISTS "loginBackground" TEXT,
  ADD COLUMN IF NOT EXISTS "loginLogo" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTermsDefault" INTEGER,
  ADD COLUMN IF NOT EXISTS "footerMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "qrEnabled" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "barcodeEnabled" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "watermark" TEXT,
  ADD COLUMN IF NOT EXISTS "digitalSignature" TEXT,
  ADD COLUMN IF NOT EXISTS "companyStamp" TEXT,
  ADD COLUMN IF NOT EXISTS "showVat" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showDiscount" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "autoDueDate" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankSwift" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchCode" TEXT,
  ADD COLUMN IF NOT EXISTS "mobileMoneyDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpServer" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER,
  ADD COLUMN IF NOT EXISTS "smtpUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPassword" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpSenderName" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpReplyTo" TEXT;

-- Site billing rates present in the backup ("sites" collection:
-- billing_rate_day, billing_rate_night) -- already added and populated live
-- as of 2026-07-08 (confirmed via live inspection), kept here as IF NOT
-- EXISTS for any environment that hasn't caught up yet.
ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "billing_rate_day" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "billing_rate_night" DOUBLE PRECISION;

-- Performance indexes on columns filtered constantly by finance dashboards
-- and reports that were never indexed, most notably purchase_invoices which
-- had none at all.
CREATE INDEX IF NOT EXISTS "purchase_invoices_companyId_idx" ON "purchase_invoices"("companyId");
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");
CREATE INDEX IF NOT EXISTS "purchase_invoices_status_idx" ON "purchase_invoices"("status");
CREATE INDEX IF NOT EXISTS "purchase_invoices_dueDate_idx" ON "purchase_invoices"("dueDate");

CREATE INDEX IF NOT EXISTS "chart_of_accounts_account_type_idx" ON "chart_of_accounts"("account_type");

CREATE INDEX IF NOT EXISTS "journal_entries_status_idx" ON "journal_entries"("status");
CREATE INDEX IF NOT EXISTS "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

CREATE INDEX IF NOT EXISTS "payments_payment_date_idx" ON "payments"("payment_date");
CREATE INDEX IF NOT EXISTS "payments_customer_id_idx" ON "payments"("customer_id");
CREATE INDEX IF NOT EXISTS "payments_supplier_id_idx" ON "payments"("supplier_id");

CREATE INDEX IF NOT EXISTS "sales_invoices_status_idx" ON "sales_invoices"("status");
CREATE INDEX IF NOT EXISTS "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");
CREATE INDEX IF NOT EXISTS "sales_invoices_due_date_idx" ON "sales_invoices"("due_date");
