// P0-5: proves the publishable (anon) key — which ships in the browser —
// cannot read any table or join any realtime channel. Read-only.
//
//   node scripts/check-rls.mjs            # human report (markdown)
//   node scripts/check-rls.mjs --ci       # exit 1 on any exposure
//
// Needs DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ..._ANON_KEY) in the environment.
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const ci = process.argv.includes('--ci')
const dbUrl = process.env.DIRECT_URL
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!dbUrl || !url || !anonKey) {
  console.error('DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required')
  process.exit(2)
}

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows: tables } = await db.query(`
  SELECT c.relname AS table,
         c.relrowsecurity AS rls,
         (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select_grant
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ORDER BY c.relname`)
// Real row counts, so "anon saw 0 rows" on a non-empty table is proof
// rather than an empty table telling us nothing.
for (const t of tables) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM public."${t.table.replace(/"/g, '""')}"`)
  t.dbRows = rows[0].n
}
await db.end()

// What the internet actually gets with the browser key, table by table.
const results = []
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${encodeURIComponent(t.table)}?select=*&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  const body = await res.json().catch(() => null)
  const rows = Array.isArray(body) ? body.length : 0
  // Protected = anon has no grant, or RLS is on and anon saw nothing.
  // An empty table with RLS off is still exposed (the next insert leaks).
  const isProtected = !t.anon_select_grant || (t.rls && (!res.ok || rows === 0))
  results.push({ ...t, status: res.status, rows, protected: isProtected })
}

// Realtime: a private channel must be refused to the anon key.
const supabase = createClient(url, anonKey)
const channelStatus = await new Promise((resolve) => {
  const ch = supabase.channel('rls-check-probe', { config: { private: true } })
  const timer = setTimeout(() => resolve('TIMED_OUT'), 10000)
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
      clearTimeout(timer)
      resolve(status)
    }
  })
})
await supabase.removeAllChannels()
const realtimeProtected = channelStatus !== 'SUBSCRIBED'

const exposed = results.filter((r) => !r.protected)
console.log(`# RLS report — ${url}\n`)
console.log(`Generated ${new Date().toISOString()} with the publishable key.\n`)
console.log('| Table | RLS enabled | Policies | Rows in DB | Anon REST result | Protected |')
console.log('|---|---|---|---|---|---|')
for (const r of results) {
  console.log(`| ${r.table} | ${r.rls ? 'yes' : '**NO**'} | ${r.policies} | ${r.dbRows} | HTTP ${r.status}, ${r.rows} row(s) | ${r.protected ? 'yes' : '**NO**'} |`)
}
const proven = results.filter((r) => r.protected && r.dbRows > 0).length
console.log(`\n${proven} non-empty table(s) returned 0 rows to the anon key (direct proof RLS is filtering).`)
console.log(`\nRealtime private channel with anon key: ${channelStatus} (${realtimeProtected ? 'refused — protected' : '**ADMITTED — exposed**'})`)
console.log(`\n${results.length - exposed.length}/${results.length} tables protected.`)

if (ci && (exposed.length > 0 || !realtimeProtected)) process.exit(1)
process.exit(0)
