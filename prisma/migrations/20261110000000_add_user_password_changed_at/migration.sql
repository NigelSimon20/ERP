-- Additive only: existing rows get NULL, which means "no reset yet".
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
