-- Budget Planning: the /finance/planning page and Set Budget dialog already
-- existed in the UI but had no backing table (the API returned an empty list
-- and rejected writes with 501). This adds the table it needs.

CREATE TABLE IF NOT EXISTS "budgets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "budgetedAmount" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_companyId_department_month_year_key"
  ON "budgets"("companyId", "department", "month", "year");
CREATE INDEX IF NOT EXISTS "budgets_companyId_year_idx" ON "budgets"("companyId", "year");
