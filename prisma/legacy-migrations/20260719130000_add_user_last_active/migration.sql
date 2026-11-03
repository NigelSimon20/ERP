-- Adds a lastActiveAt heartbeat column to users, backing lightweight
-- online/offline presence in Messages (no Supabase Realtime dependency --
-- that's configured with no env vars in this project, see
-- lib/realtime.ts). Idempotent per this project's established pattern.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
