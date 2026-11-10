-- P1-5 (BUG-008): document numbers are unique per company.
--
-- FAILS while duplicates exist (the audit found REC00037 x6, INV00008 x4,
-- PINV00006 x6 ...). OWNER APPROVAL REQUIRED: an accountant reviews
--   node scripts/remediate/duplicate-documents.mjs --dry-run
-- and the duplicates are renumbered before this runs in production.
CREATE UNIQUE INDEX "payments_companyId_payment_number_key" ON "payments"("companyId", "payment_number") WHERE "payment_number" IS NOT NULL;
CREATE UNIQUE INDEX "sales_invoices_companyId_invoice_number_key" ON "sales_invoices"("companyId", "invoice_number") WHERE "invoice_number" IS NOT NULL;
