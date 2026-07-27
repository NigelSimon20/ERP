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
