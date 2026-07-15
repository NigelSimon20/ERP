# Changelog

## 2026-07-14/15 — Client Portal + Guard Portal: both actually work now

Closed out the "still the one real functional gap left" item from the previous entry below, and along the way found the Guard Portal had the identical underlying disease.

### Client Portal — the deeper problem

There was no schema link between a `CLIENT`-role `User` and any `Customer` record at all (unlike Guard, which already had `User.guardId`). Fixed by mirroring that exact pattern:
- **`User.customerId`** (additive, nullable, unique — `prisma/migrations/20260714020000_add_customer_portal_link/`, still needs to be run against the real database).
- **Login-time self-heal**: `app/api/auth/login/route.ts` now resolves `customerId` by email match for `CLIENT` users, same as it already did for `GUARD`/`guardId`.
- **`POST /api/finance/customers/[id]/create-account`** — mirrors the existing HR guard equivalent: generates a temp password, creates a `CLIENT`-role `User` with `customerId` set. Wired to a new "Create Portal Login" button on the Finance Customers page (with a copy-to-clipboard credentials reveal, matching the Users page pattern) — so this is actually triggerable, not just an API nobody can reach.
- **Four new scoped routes** under `/api/portal/client/*` (invoices, receipts, sites, incidents), each filtering strictly by `session.customerId` — never the internal `/api/finance`/`/api/operations` routes. `app/portal/client/page.tsx` now calls these instead.

### Guard Portal — same disease, already had the cure ingredient

`app/portal/guard/page.tsx` searched `/api/hr/employees?search=<email>` to find its own guard record, then called `/api/operations/deployments`, `/api/operations/attendance`, `/api/hr/payslips` directly — all four now correctly blocked for `GUARD` by the earlier `ROLE_GUARDS` security fix (which likely means this portal partially worked by accident before that fix closed the loophole, and has been fully broken since). Unlike Customer, `User.guardId` already existed, so no schema change was needed:
- Exposed `guardId`/`customerId` from `/api/auth/me` and the login response (previously login only set them in the session cookie, never returned them to the client, so a freshly-logged-in guard's local `user` object couldn't see its own link).
- Three new scoped routes under `/api/portal/guard/*` (deployments, attendance, payslips) reading `session.guardId` server-side.
- Page rewired to use `user.guardId` directly — the email-search round-trip is gone entirely.

### Verified
- `tsc --noEmit`: clean
- `next build`: succeeds, all routes compile

### Still needs your action
- **Three pending migrations, none applied**: `20260714000000_add_rbac_foundation`, `20260714010000_add_occurrence_book`, `20260714020000_add_customer_portal_link`. No DB access from this environment (`prisma migrate status` → `P1001`, re-confirmed, not transient) — run via Supabase SQL editor, `psql`, or `prisma migrate deploy` from a machine that can reach it.

## 2026-07-14 — "Fix them all": swept every remaining open item that didn't need database access

Re-checked database connectivity first (`prisma migrate status` → still `P1001`, confirmed not transient) — the two pending migrations from Phase 2/3 still need to be applied by you. Everything else below was fixable from here, so all of it got fixed.

### Confirmed, not a bug
- `@supabase/supabase-js` **is** actually used (Google OAuth in `components/auth/SocialLogin.tsx` + `app/api/auth/login`/`oauth/callback`, and Realtime channels in `lib/realtime.ts`) — resolves the "purpose unverified" open question from Phase 0.
- `dashboard/finance` — read in full, no bugs found.

### Fixed — a systemic bug class across 5 of the 8 role dashboards
The `recentActivity` field-typo pattern fixed earlier on the executive dashboard turned out to be one instance of a much wider pattern of hardcoded fake zeros/nulls (each with a comment explaining why) and API/frontend field mismatches. Read every dashboard page+API pair end-to-end and fixed all of them:
- **`dashboard/readonly`**: same `recentActivity` typo; a heading that literally rendered as **"Recent ArrowTrendingRegular"** (icon-migration artifact — a component name leaked into visible text); simplified a harmless-but-dead `siteIds` indirection.
- **`dashboard/operations`**: `equipmentAvailable`/`equipmentAssigned` both ran the identical unfiltered count — always showed the same number under two labels. Fixed using real `quantity_in_stock`/`quantity_issued` columns.
- **`dashboard/hr`**: `newHiresThisMonth` was a hardcoded `0`. Fixed with a real JS-side date filter (same approach already used correctly for birthdays in the same file).
- **`dashboard/business-development`**: `STAGE_COLORS` had the identical broken interpolated-Tailwind-class bug as the Client Portal fix from Phase 1 — traced to `lib/theme.ts`'s `STAGE_COLORS` keys not matching the real `LeadStatus` enum at all, fixed at the source. `totalContractValue: 0` and `revenueByCustomer: []` were both hardcoded — the latter's justifying comment ("Customer model lacks companyId") is simply false; fixed both with real aggregations.
- **`dashboard/guard`** — probably the dashboard the most individual users actually see: the welcome banner would render **"Good morning, undefined!"** for every guard (API returned raw `full_name`/`position`/`employee_code`, frontend expected `name`/`rank`/`employeeNumber`). Also `myLatestPayslip: null`, justified by "Payslip has no guardId field" — true, but `Payslip.employee_id` holds it (the same mapping `app/api/hr/payroll/route.ts` already relies on). Both fixed.
- **`dashboard/staff`**: `attendeeMeetingsToday` had no date filter — it fetched every meeting the user had ever attended, mislabeled as "today's meetings." Fixed with the same `meetingDate` filter already used correctly one line below for the weekly count.

### Fixed — mechanical cleanup
- Removed the duplicate `app/api/debug/dev-login/route.ts` (kept `app/api/auth/dev-login/route.ts`, which is more complete). Confirmed via grep neither was referenced from any UI before deleting.
- Removed the dead generic `app/api/dashboard/route.ts` — confirmed via grep nothing calls it (every role uses its own `/api/dashboard/{role}` route).

### Verified

- `tsc --noEmit`: clean
- `next build`: succeeds, all routes compile (191 → 189 after removing the two dead routes, +2 for occurrence-book/users added this week)

### Still open — needs your input or action, not fixable from here
- **The pending migrations still aren't applied** (see the entry above this one for the full, current list — a third was added after this entry was originally written) — no DB access from this environment, confirmed again this session.
- ~~Client Portal is still the one real functional gap left~~ Fixed in the entry above (Guard Portal too).
- Test framework: still not installed, still needs your explicit go-ahead (new dependency).
- `Company.smtpPassword` cleartext storage, no granular RBAC data-driven enforcement yet, multi-currency/statutory-payroll gaps, Firearms Register / GPS Patrol modules — all as previously documented in `docs/AUDIT.md`.

## 2026-07-14 — Phase 3: Occurrence Book (first of three Operations modules)

Scope: built the Occurrence Book — an append-only, sequential, hash-chained shift log per site. You chose this first of the three bundled Phase 3 modules (occurrence book / firearms register / GPS patrol) since it applies regardless of whether guards are armed or GPS-tracked; the other two need their own scoping conversations before design starts.

### Added

- **`OccurrenceEntry` model** in `prisma/schema.prisma` (additive, one new table, no existing model touched — plain scalar `siteId`/`recordedById`/`linkedIncidentId` columns with no formal Prisma relation, matching the convention `Incident`/`Task`/`Lead` already use in this schema).
- **`lib/occurrence-book.ts`** — `computeEntryHash()`, a SHA-256 hash chain: each entry's hash covers its own content plus the previous entry's hash for that site.
- **`app/api/operations/occurrence-book/route.ts`** — `GET` (list entries for a site, re-verifies the entire hash chain on every read and returns a real `chainValid` boolean) and `POST` (create). **No PUT/PATCH/DELETE handler exists in this file, and none should be added** — that's what makes entries actually immutable, not a soft "don't edit this" convention. A concurrent write to the same site racing for the same sequence number gets a 409 (caught via the `@@unique([siteId, sequenceNumber])` constraint) rather than corrupting the sequence.
- **`app/(dashboard)/operations/occurrence-book/page.tsx`** — site picker, chronological entry list (numbered, typed, timestamped, attributed), a live chain-status badge, and an "Add Entry" dialog. Nav entry added to `Sidebar.tsx`'s Operations section.
- **`prisma/migrations/20260714010000_add_occurrence_book/migration.sql`** — hand-written for the same reason as Phase 2's migration (no DB access from this environment). **Still needs to be run against the real database**, alongside Phase 2's still-pending migration + seed if those haven't been applied yet either.

### Verified

- `npx prisma generate`: clean
- `tsc --noEmit`: clean
- `next build`: succeeds, `/operations/occurrence-book` compiles at 6.99 kB

## 2026-07-14 — Closed the Operations Manager / HR nav mismatch

Follow-up to Phase 2: fixed the `/human-resources` role-guard, which correctly started blocking `OPERATIONS_MANAGER` from a module it was never supposed to access — but `components/layout/Sidebar.tsx`'s `ROLE_NAV_ACCESS` still advertised a "Human Resources" nav link to that role (`MobileNav.tsx` inherits this since it just wraps `Sidebar`). Removed the dead-end nav entry rather than granting real access, since expanding a role into HR/payroll data is a permissions decision that shouldn't happen silently — reversible later if the intended answer turns out to be the opposite. Verified with `tsc --noEmit` and `next build` (clean).

## 2026-07-14 — Phase 2: RBAC foundation + a real authorization gap closed

Scope: laid the additive schema foundation for granular RBAC per `docs/AUDIT.md`'s roadmap, and — while deriving the seed data, which required precisely re-checking what's actually enforced today — found and fixed a real, currently-exploitable authorization gap. `User.role` and `middleware.ts`'s hardcoded allowlists remain the live enforcement path; nothing reads from the new tables yet.

### Added

- **`RoleDefinition`, `Permission`, `RolePermission` models** in `prisma/schema.prisma` (additive; named `RoleDefinition` not `Role` because the schema already has an unused `enum Role` and Prisma won't allow a model/enum name collision).
- **`prisma/migrations/20260714000000_add_rbac_foundation/migration.sql`** — hand-written (not `prisma migrate dev`, since this environment has no network route to the database) `CREATE TABLE`/index/FK SQL for the three new tables, idempotent and safe to re-run.
- **`prisma/migrations/20260714000000_add_rbac_foundation/seed_data.sql`** — seeds the 10 existing roles, a permission catalog matching today's real module/dashboard access points (no invented per-action permissions), and role→permission mappings mirroring `middleware.ts` exactly.
- **Action needed from you:** both SQL files still need to be run against the real database (Supabase SQL editor, `psql`, or `prisma migrate deploy` from a machine that can reach it) — I could not apply them from this sandboxed environment (`prisma migrate status` returned `P1001: Can't reach database server`).

### Fixed — real authorization gap (not just the schema work)

- **`middleware.ts`**: `ROLE_GUARDS` derived each API-path check as `` `/api${prefix}` `` from the page prefix, assuming they always match. They don't for HR (`/human-resources` pages vs `/api/hr` API) or Business Development (`/business-development` pages vs `/api/bd` API). Neither module's route handlers check `session.role` independently (only `session.isLoggedIn`) — so **any authenticated user of any role, including GUARD/STAFF/CLIENT/READ_ONLY, could call `/api/hr/payroll`, `/api/hr/employees`, `/api/bd/leads`, and other HR/BD endpoints.** Fixed by listing every real prefix (page and API) explicitly instead of deriving one from the other. This also fixes the page-side symptom (the HR page shell had no role gate at all, since `/hr` never matched `/human-resources`).

### Not fixed — flagged as an open product decision

- Fixing the above properly surfaced a related, separate issue: `Sidebar.tsx` shows Operations Managers a "Human Resources" nav link they can no longer reach (correctly) post-fix. That's a genuine product call (grant real access vs. remove the link), not a mechanical bug — left as-is, documented as finding #18 in `docs/AUDIT.md`.

### Verified

- `npx prisma generate`: clean (pure codegen from schema, no DB connection needed)
- `tsc --noEmit`: clean
- `next build`: succeeds, all routes compile, middleware bundle size unchanged (31.7 kB)

## 2026-07-14 — Global search wired in

Turned out the global search bar you asked for already existed as real, working code — `components/shared/SearchPalette.tsx` (Ctrl+K palette, debounced, keyboard-navigable) backed by `app/api/search/route.ts` (real Prisma queries against Guards, Sites, Customers, Sales Invoices, and Incidents, case-insensitive, company-scoped). It was fully built but **never imported anywhere** — dead code, invisible to every user. This matches the "Missing entirely: global search" gap flagged in `docs/AUDIT.md`.

### Fixed

- **`components/layout/TopBar.tsx`** — imported and mounted `SearchPalette` in the space between the company name and the notification/profile cluster. No API or schema changes; the search logic itself was already correct.

### Verified

- `tsc --noEmit`: clean
- `next build`: succeeds, all routes compile

## 2026-07-14 — Search coverage expanded to 11 modules

Extended `app/api/search/route.ts` from 5 to 11 searchable modules, and fixed a real bug uncovered by actually wiring the search bar in: 4 of the 5 original result types linked to `/[module]/${id}` detail routes that **don't exist anywhere in the app** — only Sales Invoices has a real per-record page (`finance/sales-invoices/[id]`). Every other module (Guards, Sites, Customers, Incidents, and now the new ones) only has a list page, so clicking those results would have 404'd the moment a real user tried it.

### Added in this expansion

- New searchable modules: **Users** (name/email/role), **Suppliers** (company name/contact), **Tasks** (title/status/priority), **Leads** (company/contact name), **Equipment** (name/code/category), **Purchase Invoices** (invoice number/status).

### Fixed in this expansion

- Guards, Sites, Customers, and Incidents results now link to their real list pages instead of a nonexistent `[id]` route.
- Customers and Sales Invoices search queries were missing `companyId` scoping — added, so results can't leak across tenants.
- Simplified the Incidents query: the old code filtered `siteId: { in: siteIds } }` where `siteIds` was populated from *every* site row (Site has no `companyId` to scope by), making the filter a no-op — removed the dead indirection, same behavior, less code.

### Verified after expansion

- `tsc --noEmit`: clean
- `next build`: succeeds, all routes compile

## 2026-07-14 — Phase 1 (partial): Users page + safe cross-cutting fixes

Scope: built the Users settings page against the already-existing (and already-correct) `/api/users` API, plus the smallest, zero-risk items from the Phase 0 audit's risk register — nothing here touches the database schema, adds a dependency, or changes any existing route's behavior for other roles.

### Added

- **`app/(dashboard)/settings/users/page.tsx`** — was a static "under construction" stub; the API (`GET/POST /api/users`, `PATCH /api/users/[id]`) was already fully built and audited (validation, role check, audit logging, last-Super-Admin/self-deactivation guards) but had no UI. Built:
  - Searchable, role-filterable user list (name, email, role badge, department, phone, last login, active/inactive + "pending setup" status)
  - Add User dialog → creates the account, then reveals the generated temporary password once (copy-to-clipboard), since it's otherwise unrecoverable after the API response
  - Edit User dialog → role, department, phone, WhatsApp, active toggle
  - Deactivate/reactivate action per row; disabled on your own row (mirrors the server-side guard so the error is never hit in the first place)
  - All actions surface the API's real error messages via toast (e.g. "Cannot deactivate the last Super Admin") rather than swallowing them

### Fixed in this phase

- **Dark mode flash of light theme on load** (`app/layout.tsx`) — added an inline script in `<head>` that reads the stored theme preference and applies the `dark` class before first paint, instead of waiting for `ThemeToggle`'s post-hydration `useEffect`.
- **Hardcoded light-only colors in `components/layout/NotificationBell.tsx`** — replaced `text-[#111827]` (×2) and `bg-[#FFF8F8]` literals with theme tokens (`text-foreground`, `bg-primary/5`) so the notification panel now actually adapts in dark mode.
- **Client Portal status/severity badges were all visually identical** (`app/portal/client/page.tsx`) — `STATUS_COLORS` and `SEVERITY_COLORS` previously mapped every key to the same interpolated Tailwind arbitrary-value string (which Tailwind's JIT likely couldn't even generate at build time). Replaced with real static per-key classes matching the pattern already used correctly elsewhere (e.g. the guard portal, `NotificationBell`).

### Verified in this phase

- `tsc --noEmit`: clean
- `next build`: succeeds, all 191 routes compile, `/settings/users` now ships real code (8.38 kB) instead of the stub

### Not done this pass (deliberately out of scope — see `docs/AUDIT.md` risk register)

- Client Portal is still functionally broken for its own data (finding #4) — its `fetch` calls hit `/api/finance/*` and `/api/operations/*`, which `middleware.ts` blocks for the `CLIENT` role. Fixing this needs new client-scoped API routes, a bigger, separate change.
- No test framework installed yet — needs your go-ahead since it's a new dependency.
- RBAC is still the hardcoded `middleware.ts` allowlist — no `Role`/`Permission` schema yet (Phase 2 in the roadmap).
- Duplicate dev-login endpoints and the dead generic `/api/dashboard` route were not removed (both are inert, not urgent, and deletion felt like it deserved a explicit nod first).
