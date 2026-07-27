// One-off setup script: creates the private 'uploads' Supabase Storage bucket
// used by app/api/files/** and lib/import-export/storage.ts. Safe to re-run --
// no-ops if the bucket already exists.
//
// Usage: node scripts/create-storage-bucket.js
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
const BUCKET = 'uploads';

async function main() {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Failed to list buckets: ${listError.message}`);

  if (existing.some((b) => b.name === BUCKET)) {
    console.log(`Bucket '${BUCKET}' already exists -- nothing to do.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '10MB',
  });
  if (createError) throw new Error(`Failed to create bucket: ${createError.message}`);

  console.log(`Created private bucket '${BUCKET}'.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
