-- The Coverage Requests UI has always treated an unset "To" date as a valid
-- open-ended request (renders "Open" in the table), but the column was
-- NOT NULL and the API wrongly rejected any submission without one.
ALTER TABLE "coverage_requests" ALTER COLUMN "endDate" DROP NOT NULL;
