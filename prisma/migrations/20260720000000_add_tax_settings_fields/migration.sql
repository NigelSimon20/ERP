-- Centralized Tax Settings: adds the 3 Company columns that don't already
-- exist (tax percentage/reg number/enable-flag are reused from the existing
-- default_vat_rate/vat_number/show_vat columns, see schema.prisma).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_name" TEXT DEFAULT 'VAT';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_inclusive" BOOLEAN DEFAULT false;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_applied_by_default" BOOLEAN DEFAULT true;
