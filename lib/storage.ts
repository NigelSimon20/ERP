import { createClient } from '@supabase/supabase-js'

// Server-only client using the service-role key -- bypasses RLS, same
// trust level Prisma already operates at for this app. Never import this
// file from client components.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const UPLOADS_BUCKET = 'uploads'

// Object keys use the existing `${companyId}/${folder}/${fileName}` convention
// (see FileRecord.fileUrl) so no data migration is needed -- only the storage
// backend changes, not the key shape.
export async function uploadObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
}

export async function downloadObject(key: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(UPLOADS_BUCKET).download(key)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? 'not found'}`)
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function deleteObject(key: string): Promise<void> {
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).remove([key])
  if (error) throw new Error(`Storage delete failed: ${error.message}`)
}

// Branding assets (logo, favicon, login screen images, ...) need to render
// inside client-generated PDFs via a plain unauthenticated `fetch(url)` (see
// lib/pdf-engine.ts's fetchImageDataUrl), so unlike UPLOADS_BUCKET they can't
// live behind the company-scoped /api/files/[id]/download route -- they need
// a real public URL. Kept in a separate public bucket rather than making
// UPLOADS_BUCKET public, since that one intentionally gates general documents
// behind auth.
export const BRANDING_BUCKET = 'branding'

// `upsert: true` so re-uploading under the same key (e.g. "companyId/logo.png")
// replaces the previous file in place instead of erroring or accumulating
// old copies under new names.
export async function uploadBrandingObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(key, buffer, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return supabase.storage.from(BRANDING_BUCKET).getPublicUrl(key).data.publicUrl
}
