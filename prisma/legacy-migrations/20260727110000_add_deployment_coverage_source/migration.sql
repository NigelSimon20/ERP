-- Additive, nullable link from an auto-created Deployment back to the
-- Coverage Request that spawned it via the new "Assign Guard" action.
-- Deployments created the normal way are unaffected (column stays NULL).
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "sourceCoverageRequestId" TEXT;
