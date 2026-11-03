-- The Employee create/edit form has always had a "WhatsApp" input, but Guard
-- never had a column for it -- every value entered there was silently
-- discarded. Add it, nullable, matching the User model's phone/whatsapp split.
ALTER TABLE "guards" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
