-- P1-11. Additive: nullable columns only.
ALTER TABLE "companies" ADD COLUMN "fixed_assets_account_id" TEXT,
ADD COLUMN "accumulated_depreciation_account_id" TEXT,
ADD COLUMN "depreciation_expense_account_id" TEXT,
ADD COLUMN "inventory_account_id" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "lastDepreciatedPeriod" TEXT;
