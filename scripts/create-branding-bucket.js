// One-off setup script: creates the public 'branding' Supabase Storage
// bucket used by app/api/settings/logo/route.ts. Separate from the private
// 'uploads' bucket (scripts/create-storage-bucket.js) because branding
// assets must be fetchable via a plain unauthenticated `fetch(url)` from
// lib/pdf-engine.ts when rendering PDFs. Safe to re-run -- no-ops if the
// bucket already exists.
//
// Usage: node scripts/create-branding-bucket.js
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const projectRoot = path.join(__dirname, '..');
const envLocal = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
const urlMatch = envLocal.match(/^NEXT_PUBLIC_SUPABASE_URL="?([^"\n]+)"?/m);
const keyMatch = envLocal.match(/^SUPABASE_SERVICE_ROLE_KEY="?([^"\n]+)"?/m);
if (!urlMatch || !keyMatch) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
}

const supabase = createClient(urlMatch[1], keyMatch[1]);
const BUCKET = 'branding';

async function main() {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Failed to list buckets: ${listError.message}`);

  if (existing.some((b) => b.name === BUCKET)) {
    console.log(`Bucket '${BUCKET}' already exists -- nothing to do.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (createError) throw new Error(`Failed to create bucket: ${createError.message}`);

  console.log(`Created public bucket '${BUCKET}'.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
