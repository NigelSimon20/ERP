// Applies a single migration.sql file to the live DB via a raw pg Client
// over the Supabase pooler connection. Needed because `prisma migrate
// dev/deploy/db push` all hang against this project's pgbouncer
// transaction-mode pooler (it doesn't support the advisory locks/sessions
// the Prisma schema engine wants) -- see the schema-drift history for
// details. Reads DATABASE_URL from .env.local (Next.js prioritizes it over
// .env, and it holds the real pooler URL for this project).
//
// Usage: node scripts/apply-migration.js <migration-folder-name>
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const folderName = process.argv[2];
if (!folderName) {
  console.error('Usage: node scripts/apply-migration.js <migration-folder-name>');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');
const envLocal = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
const match = envLocal.match(/^DATABASE_URL="([^"]+)"/m);
if (!match) throw new Error('DATABASE_URL not found in .env.local');
const connectionString = match[1];

const migrationPath = path.join(projectRoot, 'prisma/migrations', folderName, 'migration.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${folderName} successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
