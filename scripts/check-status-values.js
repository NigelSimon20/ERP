// Read-only pre-migration safety check for 20260727100000_convert_status_enums.
// Prints every distinct Guard.status / Site.status value currently in the
// live DB and aborts (non-zero exit) if anything falls outside the values
// the new GuardStatus/SiteStatus enums will allow -- run this BEFORE
// normalize-status-casing.js / applying the migration, never skip it.
//
// Usage: node scripts/check-status-values.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
const envLocal = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
const match = envLocal.match(/^DATABASE_URL="([^"]+)"/m);
if (!match) throw new Error('DATABASE_URL not found in .env.local');

const KNOWN_GUARD = ['Active', 'Resigned', 'Terminated', 'Blacklisted'];
const KNOWN_SITE = ['Active', 'Terminated'];

function isKnown(value, knownList) {
  if (value === null) return true; // normalized to 'Active' before the ALTER
  return knownList.some((k) => k.toLowerCase() === value.toLowerCase());
}

async function main() {
  const client = new Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const guardRows = (await client.query('SELECT status, COUNT(*) FROM guards GROUP BY status ORDER BY status')).rows;
    const siteRows = (await client.query('SELECT status, COUNT(*) FROM sites GROUP BY status ORDER BY status')).rows;

    console.log('Guard.status distinct values:');
    guardRows.forEach((r) => console.log(`  ${r.status === null ? 'NULL' : JSON.stringify(r.status)}: ${r.count}`));
    console.log('Site.status distinct values:');
    siteRows.forEach((r) => console.log(`  ${r.status === null ? 'NULL' : JSON.stringify(r.status)}: ${r.count}`));

    const unexpectedGuard = guardRows.filter((r) => !isKnown(r.status, KNOWN_GUARD));
    const unexpectedSite = siteRows.filter((r) => !isKnown(r.status, KNOWN_SITE));

    if (unexpectedGuard.length || unexpectedSite.length) {
      console.error('\nUNEXPECTED VALUES FOUND -- do not proceed with the migration yet.');
      if (unexpectedGuard.length) console.error('  Guard.status:', unexpectedGuard.map((r) => r.status));
      if (unexpectedSite.length) console.error('  Site.status:', unexpectedSite.map((r) => r.status));
      console.error('Resolve these by hand (decide which canonical value they map to), then re-run this check.');
      process.exit(1);
    }

    console.log('\nAll values are known casing-variants or exact matches. Safe to run normalize-status-casing.js next.');
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
