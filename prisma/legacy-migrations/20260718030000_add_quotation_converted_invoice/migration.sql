-- Convert-to-invoice left the quotation's status unchanged (still ACCEPTED),
-- so the "Convert to Invoice" button stayed visible/clickable after use and
-- a double-click created a second SalesInvoice for the same quotation. Track
-- the resulting invoice so conversion can be made idempotent.
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "convertedInvoiceId" TEXT;
