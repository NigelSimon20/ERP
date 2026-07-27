// Normalizes Guard.status / Site.status to the exact canonical casing the
// new GuardStatus/SiteStatus enums use, before the migration's ALTER COLUMN
// TYPE cast runs. Only run AFTER check-status-values.js has passed clean --
// this only handles known casing variants (e.g. 'ACTIVE' -> 'Active') and
// NULLs, it does not invent a mapping for a genuinely unexpected value.
//
// Usage: node scripts/normalize-status-casing.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
const envLocal = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
const match = envLocal.match(/^DATABASE_URL="([^"]+)"/m);
if (!match) throw new Error('DATABASE_URL not found in .env.local');

const KNOWN_GUARD = ['Active', 'Resigned', 'Terminated', 'Blacklisted'];
const KNOWN_SITE = ['Active', 'Terminated'];

async function main() {
  const client = new Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const value of KNOWN_GUARD) {
      const r = await client.query(
        `UPDATE guards SET status = $1 WHERE status IS NOT NULL AND upper(status) = upper($1) AND status != $1`,
        [value]
      );
      if (r.rowCount) console.log(`guards: normalized ${r.rowCount} row(s) to '${value}'`);
    }
    const guardNulls = await client.query(`UPDATE guards SET status = 'Active' WHERE status IS NULL`);
    if (guardNulls.rowCount) console.log(`guards: defaulted ${guardNulls.rowCount} NULL row(s) to 'Active'`);

    for (const value of KNOWN_SITE) {
      const r = await client.query(
        `UPDATE sites SET status = $1 WHERE status IS NOT NULL AND upper(status) = upper($1) AND status != $1`,
        [value]
      );
      if (r.rowCount) console.log(`sites: normalized ${r.rowCount} row(s) to '${value}'`);
    }
    const siteNulls = await client.query(`UPDATE sites SET status = 'Active' WHERE status IS NULL`);
    if (siteNulls.rowCount) console.log(`sites: defaulted ${siteNulls.rowCount} NULL row(s) to 'Active'`);

    console.log('\nNormalization complete. Safe to apply the migration now:');
    console.log('  node scripts/apply-migration.js 20260727100000_convert_status_enums');
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
