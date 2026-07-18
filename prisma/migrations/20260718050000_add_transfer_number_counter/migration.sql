-- nextTransferReference() read-then-incremented the last BankTransfer row in
-- plain JS (no companyId filter either), matching the exact race-condition
-- class already fixed for invoices/payments/receipts/etc via an atomic
-- per-company counter column. Add the same counter for transfers, seeded
-- past any existing reference numbers so newly issued ones can't collide.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_transfer_number" INTEGER DEFAULT 1;

UPDATE "companies" SET "next_transfer_number" = COALESCE((
  SELECT MAX(CAST(regexp_replace(reference, '\D', '', 'g') AS INTEGER)) + 1
  FROM "bank_transfers"
  WHERE reference ~ '\d'
), 1);
