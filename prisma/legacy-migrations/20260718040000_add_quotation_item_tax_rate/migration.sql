-- Quotation line items were never actually persisted at all (see the
-- companion fix in app/api/bd/quotations/route.ts) — this table has zero
-- rows in production. Add taxRate so the per-line tax percentage entered on
-- the create form survives, instead of only being folded into the total.
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION;
