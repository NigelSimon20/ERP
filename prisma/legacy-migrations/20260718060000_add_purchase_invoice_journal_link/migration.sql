-- Sales/purchase invoices never posted to the GL at all (only payments
-- against them did) -- every core financial statement was structurally
-- incomplete. This column lets a purchase invoice track the journal entry
-- that posted it, mirroring sales_invoices.journal_entry_id, both for
-- idempotency (don't double-post on backfill/retry) and traceability.
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
