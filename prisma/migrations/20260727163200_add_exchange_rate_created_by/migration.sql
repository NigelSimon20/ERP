-- The Exchange Rates page has always rendered an "Added By" column, but
-- ExchangeRate had no column recording who added a manual rate -- it was
-- always blank. RBZ auto-synced rates leave this null (system-generated).
ALTER TABLE "exchange_rates" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
