import { execSync } from 'child_process'

// Rebuilds the test database from prisma/migrations once per run, so the
// suite also proves the migrations build an empty database (P0-3).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL to a disposable local Postgres, e.g. postgresql://postgres@localhost:5432/ravenshield_test')
  }
  // Hard stop: `migrate reset` drops every table.
  const host = new URL(url).hostname
  if (!['localhost', '127.0.0.1', 'postgres'].includes(host)) {
    throw new Error(`Refusing to reset non-local database host "${host}"`)
  }
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })
}
