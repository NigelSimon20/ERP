-- Document numbers were unique across ALL tenants, so a second company's
-- first credit note (CRN-000001) collided with another company's. Unique per
-- company instead. Only relaxes a constraint: no data changes, cannot fail.
-- DropIndex
DROP INDEX "contracts_contractNumber_key";

-- DropIndex
DROP INDEX "credit_notes_creditNoteNumber_key";

-- DropIndex
DROP INDEX "debit_notes_debitNoteNumber_key";

-- DropIndex
DROP INDEX "expense_claims_claimNumber_key";

-- DropIndex
DROP INDEX "goods_received_notes_grnNumber_key";

-- DropIndex
DROP INDEX "proforma_invoices_proformaNumber_key";

-- DropIndex
DROP INDEX "purchase_invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "purchase_orders_poNumber_key";

-- DropIndex
DROP INDEX "quotations_quoteNumber_key";

-- DropIndex
DROP INDEX "receipts_reference_key";

-- CreateIndex
CREATE UNIQUE INDEX "contracts_companyId_contractNumber_key" ON "contracts"("companyId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_companyId_creditNoteNumber_key" ON "credit_notes"("companyId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_companyId_debitNoteNumber_key" ON "debit_notes"("companyId", "debitNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_companyId_claimNumber_key" ON "expense_claims"("companyId", "claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "goods_received_notes_companyId_grnNumber_key" ON "goods_received_notes"("companyId", "grnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_companyId_proformaNumber_key" ON "proforma_invoices"("companyId", "proformaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_companyId_invoiceNumber_key" ON "purchase_invoices"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_companyId_poNumber_key" ON "purchase_orders"("companyId", "poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_quoteNumber_key" ON "quotations"("companyId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_companyId_reference_key" ON "receipts"("companyId", "reference");

