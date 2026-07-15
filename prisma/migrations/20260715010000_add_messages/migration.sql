-- CreateTable
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_companyId_recipientId_read_idx" ON "messages"("companyId", "recipientId", "read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_companyId_senderId_recipientId_createdAt_idx" ON "messages"("companyId", "senderId", "recipientId", "createdAt");

-- Enable Supabase Realtime push for live message delivery (best-effort; safe to
-- re-run, and safe if the publication already includes this table).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
