-- P1-9: richer, append-only audit trail. Additive: new nullable columns, an
-- index and a trigger; existing rows are untouched.
ALTER TABLE "audit_trail" ADD COLUMN "userAgent" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "changes" JSONB;

CREATE INDEX "audit_trail_companyId_createdAt_idx" ON "audit_trail"("companyId", "createdAt");

-- Grants can't restrict the table owner (which the app connects as), so a
-- trigger enforces append-only for every role.
CREATE OR REPLACE FUNCTION audit_trail_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_trail is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_trail_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "audit_trail"
  FOR EACH ROW EXECUTE FUNCTION audit_trail_append_only();

-- Maker-checker threshold (NULL = off).
ALTER TABLE "companies" ADD COLUMN "approval_threshold" DECIMAL(18,2);
