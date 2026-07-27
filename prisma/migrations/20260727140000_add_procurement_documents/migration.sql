-- Procurement document backlog: Purchase Order, Goods Received Note --
-- deferred from the Phase 4 document-suite plan as net-new business features.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "po_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_po_number" INTEGER DEFAULT 1;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "grn_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_grn_number" INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL UNIQUE,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "expectedDate" TIMESTAMP(3),
  "subtotal" DOUBLE PRECISION NOT NULL,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");
CREATE INDEX IF NOT EXISTS "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL,
  "quantityReceived" DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "goods_received_notes" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "grnNumber" TEXT NOT NULL UNIQUE,
  "receivedBy" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "goods_received_notes_companyId_idx" ON "goods_received_notes"("companyId");
CREATE INDEX IF NOT EXISTS "goods_received_notes_purchaseOrderId_idx" ON "goods_received_notes"("purchaseOrderId");

CREATE TABLE IF NOT EXISTS "goods_received_note_lines" (
  "id" TEXT PRIMARY KEY,
  "grnId" TEXT NOT NULL,
  "poLineId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantityOrdered" DOUBLE PRECISION NOT NULL,
  "quantityReceived" DOUBLE PRECISION NOT NULL,
  "condition" TEXT NOT NULL DEFAULT 'GOOD'
);

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_received_note_lines" ADD CONSTRAINT "goods_received_note_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_received_notes"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
