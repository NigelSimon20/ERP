# RavenShield ERP — Fix Plan

Source: QA audit of https://ravenshield-erp.vercel.app on 6 Nov 2026 (company "Govaspak Investments", Super Admin). Every item below was reproduced against the live app; evidence (record numbers, figures) is included so it can be reproduced.

Work through it phase by phase. For each task: find the code, confirm the root cause, fix it, add a test, run the tests, and tick the task off here. Do not move to the next phase until the current phase's gate passes. Ask the owner before any database migration that changes or deletes existing data.

## 0. Ground rules

- Never deploy to production and never run destructive SQL on the production database. Work on a branch, against a local or staging database. The owner approves every deploy.
- Understand before changing. Read the relevant route, page and Prisma model before editing. Don't rebuild working modules; keep changes small and local.
- Every fix gets a test (unit or API integration) that fails before the fix and passes after. Prefer testing the API route directly.
- Money: never use JavaScript floats for stored amounts. Use Prisma Decimal (`@db.Decimal(18,2)`) or integer cents. Round each line to 2 dp when it is created.
- Data migrations (backfills, dedupes, opening balances) are written as scripts with a `--dry-run` mode that prints what would change. The owner must approve them before a real run.
- Errors: API routes must never return raw Prisma, Postgres or Zod messages to the client. Return `{ error: "<human message>", code: "<CODE>" }` and log the details on the server.
- After each phase, run `npm run build`, `npm run lint`, and the full test suite.

### Stack observed (confirm in the repo)

- Next.js App Router on Vercel; route groups `app/(auth)` and `app/(dashboard)`; API routes under `app/api/**`.
- Prisma with PostgreSQL. Supabase is used for real-time channels; the client is created in the dashboard layout with the project URL `yachjdzjfckvobsezwmi.supabase.co` and a publishable key.
- Validation with Zod. Custom authentication at `/api/auth/login` with an HttpOnly cookie.
- Some records have snake_case fields (`entry_date`, `total_debit`, `current_balance`, `created_date`, `is_sample`) left over from an earlier data import (it looks like a Base44 export), alongside camelCase fields.

## Phase 0 — Stop the bleeding (target: 1–2 weeks)

### - [x] P0-1 · Journal Entries page crashes (BUG-001) — CRITICAL

Repro: open `/finance/journal-entries` → "Application error: a client-side exception". Console: `RangeError: Invalid time value` in `app/(dashboard)/finance/journal-entries/page.*`.

Root cause: the list renders `formatDate(new Date(e.date))`, but `GET /api/finance/journal-entries` returns `entry_date` (snake_case) and no `date` field.

Fix:
- In the API serializer, map every entry to a stable DTO: `{ id, reference, date: entry_date, description, totalDebit, totalCredit, status, lines }`.
- Make the shared date formatter safe: an invalid or empty input returns "—" instead of throwing.
- Search the codebase for other places that call `new Date(x.date)`, `new Date(x.createdAt)` and similar on DTOs that may be snake_case.

Accept: the page lists all 579+ journals; there are no console errors; a test renders the list with one row that has `date: null`.

### - [x] P0-2 · `/api/guards` does not exist — blocks Incidents, Deployments, Patrols, Employee Accounts (BUG-002) — CRITICAL

Repro: Operations → Incidents → Report Incident: the Site dropdown is empty (89 sites exist) and Guard shows only "None". The New Deployment and Schedule Patrol forms are affected the same way.

Root cause: these pages load data with `Promise.all([fetch('/api/operations/sites'), fetch('/api/guards')])`. `/api/guards` returns a 404 HTML page, so `.json()` throws, the whole `Promise.all` rejects, and neither list is ever set. Affected pages: `operations/incidents`, `operations/deployments`, `operations/patrols`, `finance/employee-accounts`.

Fix:
- Create `app/api/guards/route.ts` → GET returns `{ guards: [{ id, name, employeeNumber, rank, status }] }` for all Active employees of the session company, with no pagination. Scope it by company, like the other routes.
- In all four pages, replace `Promise.all` with `Promise.allSettled`, check `res.ok`, and show a toast if one list fails, while still loading the other.

Accept: each form's dropdowns are populated; an incident, a deployment and a patrol can be created through the UI; there is a test for `/api/guards`.

### - [x] P0-3 · Missing database migrations: Credit Notes, Debit Notes, Proforma, Purchase Orders, GRNs (BUG-025) — CRITICAL

Repro: `POST /api/finance/credit-notes` fails with Postgres 42704: `type "public.CreditNoteStatus" does not exist`. Debit notes, proforma invoices and `PurchaseOrderStatus` fail the same way. Expense claims (`POST /api/hr/expense-claims`) return a 500, probably for the same reason; check it.

Fix: compare `prisma/schema.prisma` with the migrations folder. Generate the missing migration(s) and apply them to staging with `prisma migrate deploy`. Add a CI step (`prisma migrate diff --exit-code`, or `prisma migrate status`) that fails when the schema and the migrations drift apart.

Accept: on staging, one record of each document type can be created, posted and voided; there is a smoke test per document type.

### - [x] P0-4 · Password reset is a no-op (BUG-013) — HIGH

Repro: the "Forgot Password?" link does nothing. The login page passes `onForgotPassword: () => {}`, and `/forgot-password` and `/reset-password` return 404.

Fix: build a reset flow:
- `POST /api/auth/forgot-password` creates a random token, stores only its SHA-256 hash with a 30-minute expiry, and sends a link by email (or WhatsApp, if the user has no email).
- `POST /api/auth/reset-password` validates the token, sets the new password (with a strength rule), invalidates all of the user's sessions, and writes an audit entry.
- The forgot-password endpoint always returns the same response, whether or not the account exists, and is rate-limited.

Accept: the full flow works on staging; a used or expired token is rejected.

### - [x] P0-5 · Verify Supabase Row-Level Security (SEC-01) — CRITICAL until verified

The Supabase URL and publishable key ship in the browser bundle. If any table or real-time channel lacks RLS, the data is readable from the internet, across every tenant.

Do:
- In the Supabase dashboard, list every table in `public` and confirm RLS is enabled with policies that scope by company (or that the anon role has no access at all, if Prisma connects with the service role).
- Make real-time channels private and authorised.
- Add a CI script that queries each table with the anon key and expects an error or 0 rows.
- If anything was exposed, rotate the keys.

Accept: a written list of tables showing their RLS status (all protected), and the CI test passing.

### - [x] P0-6 · Basic security hardening (SEC-07, SEC-08, BUG-030)

- Add these headers in `next.config` (`headers()`) or middleware: Content-Security-Policy (start in report-only mode), `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy; and set `poweredByHeader: false`.
- Return `Cache-Control: private, no-store` on all authenticated API responses (`/api/auth/me` currently returns `public`).
- Central API error handler: wrap route handlers so that Prisma and Zod errors become `{ error, code }`. Today, an invalid date sent to the journal API returns the raw `prisma.lockDate.findFirst()` invocation text, including the companyId.

### Gate 0

- [x] All P0 tests pass (48 tests, `npm test`).
- [ ] Journal Entries, Incidents, Deployments, Patrols, Credit Notes, Debit Notes, POs and Proforma can each be created on staging. **Verified against a database built only from `prisma/migrations` (the test suite); no staging environment exists yet — see progress log.**
- [ ] The RLS report is complete.

## Phase 1 — Trustworthy ledger (target: weeks 3–10)

Principle: posted journal lines are the single source of truth. Every balance, report, dashboard KPI and subledger total is derived from them, or from a cache rebuilt from them inside the same transaction.

### - [x] P1-1 · Money as Decimal; zero-tolerance balance checks (BUG-011)

Evidence: the trial balance for FY2026 is Dr 592,132.7628 / Cr 592,132.7328 (off by 0.03) yet is reported `balanced: true`. Stored values include 585.585, 4809.2121 and 139066.26078634209.

Convert all money columns to `Decimal(18,2)`, with a data migration that rounds existing values. Round each line on create. Replace balance tolerances with an exact comparison.

Accept: the trial balance sums are exact; a test posts lines of 0.1 + 0.2 and checks for exactly 0.30.

### - [x] P1-2 · Balance Sheet, Income Statement and dashboards derived from the ledger (BUG-003, BUG-006)

Evidence (FY2026, fiscal year starts 01-01):
- Income Statement: revenue 261,735.73, expenses 38,271.67, net 223,464.06.
- Finance dashboard: revenue 139,066.26, expenses 31,338.02, and "Net Position" 114,395.76, which equals cash collected 145,733.77 minus expenses — mixed bases.
- Balance Sheet: "3900 Current Year Earnings" = 231,058.83, computed as Assets − Liabilities − Retained Earnings (a plug), which is 7,594.77 different from the Income Statement profit.
- Balance Sheet asset lines use the stored `current_balance`, not ledger sums: account 1000 shows −6,827.82 against a ledger net of +641.18; account 1100 shows 223,453.42 against 207,461.48.

Fix: one report service (`lib/reports/ledger.ts`) that sums posted lines (status = POSTED, date ≤ as-at) per account and applies normal-balance signs by account type. Then:
- The Balance Sheet uses it, and Current Year Earnings = the Income Statement net profit for the fiscal year to date.
- The dashboard KPIs call the same service. Show "Cash collected" as a separate, labelled KPI.
- If Assets ≠ Liabilities + Equity, return `balanced: false` and show the difference. Never plug.

Accept: a test ledger fixture produces an Income Statement net profit equal to Current Year Earnings, and the Balance Sheet balances exactly; the dashboard revenue equals the Income Statement revenue for the same period.

### - [ ] P1-3 · Stored balances rebuilt from transactions (BUG-010, BUG-005)

Evidence: the Bank Accounts page shows "Variance" on 6 of 8 accounts. For example, Ecobank USD stores 59,160.52 but calculates 80,029.90 from its transactions; CBZ stores 3,902.59 but calculates 534.91.

Evidence: summing chart-of-accounts balances gives Assets 1,203,909.76 against L + E + (R − X) of 317,801.90. GL bank accounts 1013–1020 were created with opening balances (53,609; 95,959; ZWL 200,000; ZWG 556,666; …) and no balancing journal.

Fix:
- Opening balances must be created as balanced journals against a new "3050 Opening Balance Equity" account.
- `current_balance` on GL accounts and bank accounts is updated only inside the posting transaction (or replaced by a computed view).
- Add a nightly reconcile job that recomputes every account and alerts on any difference.
- Multi-currency: store the amount in transaction currency plus the rate plus the amount in reporting currency on each line; totals always use the reporting-currency amount. Fix accounts 1011 "Bank Control Account ZWG" and 1301 "Petty Cash ZWG", which have currency USD while holding ZWG amounts.

Accept: the reconcile job reports zero differences on staging after the data migration (P1-8).

### - [x] P1-4 · AR/AP subledgers reconcile to their control accounts (BUG-004)

Evidence: one quantity, five values — invoice balances 116,392.24; customer outstandingBal 98,148.57; dashboard 85,782.86; AI helpdesk 102,047.26; GL account 1100 223,453.42. Payables: bills 20,186.43; supplier balances 25,045.68; GL account 2000 860.43.

Fix: customer and supplier balances are computed from open documents (or allocations). The dashboard, customer list and AI helpdesk all call one `getReceivables()` / `getPayables()` function. A reconcile check compares AR/AP subledger totals with the control accounts.

Accept: one AR figure everywhere, tying out to account 1100; the same for AP and account 2000.

### - [x] P1-5 · Receipts and invoices: concurrency, allocation and voids (BUG-026, BUG-027, BUG-028, BUG-008, BUG-009)

- BUG-027 (race / lost update): two simultaneous $10 receipts on INV-000047 both posted to the bank and the GL (+$20), but `amount_paid` rose by only $10. Fix: wrap receipt creation in `prisma.$transaction`, lock the invoice row (`SELECT … FOR UPDATE` via `$queryRaw`) or use an atomic increment, and re-check the balance inside the transaction. Better still: add an Allocation table (receiptId, invoiceId, amount) and derive `amount_paid` = sum of allocations.
- BUG-028: REC-000087 was recorded for customer "Dr Mlilo" yet reduced an invoice of "TEST - QA Customer Ltd". Fix: when `invoiceId` is given, take `customerId` from the invoice, and reject a mismatch.
- BUG-026: INV-000046 was voided while a $100 receipt (REC-000086) was allocated to it. The invoice journal was voided but the receipt stayed posted, leaving an orphan AR credit. Fix: block the void while allocations exist (or move the allocations to unapplied customer credit first, in the same transaction).
- BUG-008 (duplicates): 22 receipt references are reused (REC00037 ×6, REC00020 ×5, …); invoice numbers repeat (INV00008 ×4); PINV00006 appears 6 times in sales invoices; INV00019 ($462) was paid $924. Fix:
  - Add a unique index on `(companyId, invoice_number)` and `(companyId, reference)` per document type, after the dedupe migration.
  - Generate numbers server-side with an atomic counter, and route imports through the same sequence.
  - Accept an `Idempotency-Key` header on create endpoints.
  - Record overpayments as customer credit instead of clamping the balance to 0.
- BUG-009: 7 invoices are PAID with money still owing (e.g. 2421456: 7,491.91 owing; 2421457: 4,809.21). Fix: derive status from (total, paid, dueDate, voided). Use one status enum, in UPPERCASE (the API currently returns "Sent" and "Partial" while the UI expects UNPAID and PARTIAL — BUG-033).

Accept: a test sends 10 receipts in parallel and the invoice paid amount equals the sum of the receipts; voiding an invoice with allocations is rejected; duplicate numbers are impossible (a test hits the unique constraint); there is a status-derivation unit test.

### - [x] P1-6 · Journal API validation (BUG-029, BUG-016)

Evidence: the API accepted and posted RS-JE-000508 (all zero) and RS-JE-000510 (debit 5 and credit 5 on the same line). It accepted a draft with a non-existent account ID (RS-JE-000509); posting that draft returns a 500. The chart of accounts has duplicate codes 2000, 5101 and 5105. Account "4000 Bank Loan" is a liability coded in the revenue range. Auto-journal references are nested (JE-auto-INV-INV-INV-000035). Payroll journal RS-JE-000507 was posted with 0 lines.

Fix: a Zod refinement requiring each line to have exactly one of debit or credit > 0, at least 2 lines, a total > 0, and every account to exist, be active and belong to the session company. Add a unique `(companyId, account_code)` index, and a check that the code range matches the account type. Fix the reference builder so it adds its prefix only once.

Accept: each of these cases has a test returning 400 (not 500).

### - [x] P1-7 · Pagination and aggregates (BUG-012, BUG-014, BUG-015)

Evidence: paging sales invoices returns 117 rows but only 113 unique, so 4 invoices are never shown (the sort key isn't unique). The Sales Invoices summary cards and the HR overview ("Active Guards 10 · 25 total headcount", when the true figures are 198 of 312) are computed in the browser from page 1 only.

Fix: every list endpoint orders by `(<sortField>, id)` and honours a `limit` parameter (capped). Add `/summary` endpoints (or include summary in the list response) computed in SQL with the same filters; dashboards use server-side counts.

Accept: paging through all invoices returns each id exactly once; the cards equal the SQL totals.

### - [ ] P1-8 · Data remediation scripts (owner approval required)

Write as `scripts/remediate/*.ts`, each with `--dry-run`:
- List and reverse (by journal, keeping the audit trail) all TEST-QA records: the bank, customer, payee, guard, site, contract, fixed asset and inventory item; transfer RS-TRF-000005 ($100 to CBZ) and payment PAY-000055 ($25); and the ZZTEST records from the audit (INV-000046–050, REC-000086–089, RS-JE-000508–514, EMP-0332–0337, the ZZTEST incident, deployment and overtime requests).
- Report duplicate receipts and invoices for an accountant to review. Never auto-delete.
- Post the opening-balance journals (P1-3).
- Recompute stored balances after the fixes and print the before/after differences.

### - [ ] P1-9 · Audit trail, period locks, approvals (SEC-05, SEC-06, F-12)

Evidence: audit entries record user and time, but 0 of 42 test actions stored old values, all 42 had a null ipAddress, posts and voids are logged only as a generic "UPDATE", and imported data was never audited. The lock-date feature works (create, post and void are all blocked in a locked period — keep it).

Fix:
- The audit write happens in the same transaction as the change, recording: action (CREATE / UPDATE / POST / VOID / DELETE / LOGIN / EXPORT), before/after JSON diff, user, IP (from the `x-forwarded-for` header on Vercel), user agent and request id.
- Make the audit table append-only (no update or delete grants).
- Add maker-checker: journals, payments and payroll above a configurable amount need a second approver, by role.

Accept: posting a journal writes an audit row with the action, the before/after diff and the IP.

### - [x] P1-10 · Statutory payroll engine (BUG-007, F-07)

Evidence: payroll previews return 204 guards, all with zero gross. The engine computes hourlyRate × hoursWorked, but hourlyRate is 0 for every guard — the stored dailyRate (5.45–5.91) is ignored — and attendance records have no hours (1,866 records, all with null check-in/check-out and hoursWorked: 0). The September run was marked PAID with $0. 201 orphan payslips have net 27,735 against gross 1,269. Payslip items: 0 earnings and 0 deductions configured.

Fix:
- Pay basis per employee: daily rate × paid days (from attendance statuses PRESENT and INDUCTION_PAID, plus paid LEAVE), monthly salary, or hourly. Configurable per company.
- Configurable, effective-dated statutory tables, each requiring approval: ZIMRA PAYE bands (USD and ZWG), AIDS Levy (3% of PAYE), NSSA (employee and employer contributions up to the insurable-earnings ceiling), NEC Security Industry grade minimums and levy, ZIMDEF/SDL. Store the source document and effective date for each table. No hardcoded rates.
- Validation: block approving or paying a run with zero gross or with any payslip where net ≠ gross − deductions; enforce net ≥ 0.
- The posting journal comes from the run: Dr Salaries and Wages / Cr Net Pay Payable, Cr PAYE, Cr NSSA, and so on.
- Quarantine the 201 orphan payslips (no payrollRunId) — exclude them from reports.

Accept: a fixture with 3 guards, known rates and days produces payslips that match a hand-calculated spreadsheet; a zero-gross run cannot be approved.

### - [x] P1-11 · Input validation, HR and Ops (BUG-019, BUG-031, BUG-032, BUG-017, BUG-018, BUG-020, BUG-021, BUG-022)

- Employees API accepted a duplicate national ID (EMP-0332/0333), a date of birth of 2030-01-01, the year 275760, a daily rate of −50 and a 3,000-character name. Add: a unique `(companyId, normalised idNumber)`; age 18–75; hire date after date of birth; rate > 0; name ≤ 120 characters; the same validation in imports.
- Overtime accepted 30 hours in one day → cap at 24 minus scheduled hours; warn above a configurable weekly limit.
- Incidents: severity "APOCALYPTIC" → 500. Validate the enum with Zod and return 400.
- Attendance rate: currently 1,419 present ÷ 1,866 records = 76%. Exclude OFF and LEAVE from the denominator: 1,419 ÷ 1,493 = 95%.
- Inventory: an item with quantity 10 and reorder level 5 is flagged "Low". It should be low only when quantity ≤ reorder level.
- Invoices: the API now rejects a due date before the issue date, but imports created INV00025, INV00026 and INV00008 that way. Apply the same validation to imports.
- Currency formatting: ZWG amounts show "$". Use `Intl.NumberFormat` with the account's currency code.
- Fixed assets and inventory must post to the GL. The asset register shows $500 but GL 1500 holds $1,000; depreciation has never run. Add a month-end depreciation job.
- Invoice `notes` is dropped on create. Map it.

### Gate 1

- [ ] On staging, a full month (invoices, receipts, payments, payroll, depreciation) closes.
- [ ] The trial balance, the AR/AP control accounts and every bank balance reconcile to the cent.
- [ ] The reconcile job is clean.
- [ ] The audit trail captures every action.

## Phase 2 — Field operations (target: months 3–6)

Build in this order (each depends on the previous):

- [ ] Post and shift model: a site has posts; a post has shift templates (day/night, 8h/12h, days of week), required headcount, skills and pay/bill rates.
- [ ] Roster engine: assign guards to shifts with conflict detection (already present for deployments — "Guard is already deployed during this period"; keep it). Add rest-period and maximum-hours rules, a public-holiday calendar per country, leave-aware replacement suggestions, and unfilled-shift alerts.
- [ ] Time and attendance: clock-in/out against the scheduled shift; flags for late, early, no-show and AWOL; supervisor approval; approved hours feed payroll (P1-10).
- [ ] Guard PWA (offline-first): installable PWA (manifest, service worker, IndexedDB queue) for low-end Android. Clock in with GPS (geofence check), QR/NFC/GPS patrol checkpoints, incident reports with photos, an SOS button, and post orders. Sync when back online. Privacy: track only while on shift; the policy is configurable per company.
- [ ] Patrols: routes with ordered checkpoints, schedules, missed-checkpoint alerts and supervisor verification.
- [ ] Incident workflow: category taxonomy, evidence attachments (signed, company-scoped storage URLs), investigator assignment, escalation SLA, client-visible status and PDF report. Today's form has only title, site, severity, guard, datetime and description.
- [ ] WhatsApp Business notifications (the company already has `whatsappEnabled` and a number in settings): shift reminders, no-show alerts to supervisors, SOS, incident notices to clients, invoice and statement delivery. Store templates per event.
- [ ] Client portal v2 (`/portal/client` exists): attendance, patrols, incidents, invoices and statements, and complaints — strictly scoped to the client's own organisation (with tests).

### Gate 2

- [ ] Two external pilot security companies are running daily operations on it for 30 days.

## Phase 3 — Differentiators (target: months 6–12)

- [ ] Profit per contract and site: revenue (billing from contract rates × delivered hours) against payroll, statutory costs, uniforms and equipment, transport and communications. Dashboards for margin %, revenue per guard and cost per guard, plus loss-making contract flags.
- [ ] Contract billing: monthly invoices generated from contracts or approved hours; escalation clauses; renewal alerts; amendments with history.
- [ ] Command centre: live board of guards on duty, late and absent, vacant posts, missed patrols, open incidents and SOS.
- [ ] Bank reconciliation: CSV/OFX statement import with auto-matching (no reconciliation has ever been done in the current data).
- [ ] Credit control: credit limits (all customers currently have 0), dunning by WhatsApp and email, statements, stop-service flag.
- [ ] Fleet and assets: vehicle logbook, fuel and mileage, service and licence expiry; issue and return of radios and uniforms per guard.
- [ ] Security: TOTP 2FA (mandatory for Super Admin, Admin and Finance), session and device list with remote sign-out, login history page, signup email/WhatsApp verification and CAPTCHA (public `/register` creates tenants today), granular per-action permissions.
- [ ] SaaS: plans, per-active-guard pricing, seat and site limits, feature flags, trials, tenant admin console, automated backup monitoring and quarterly restore drills.
- [ ] AI (later): anomaly detection (ghost guards, overtime spikes, missed-patrol patterns), predictive staffing. The existing AI helpdesk must use the same report services as the dashboards (it currently answers with a fifth receivables figure, and renders `**markdown**` as literal text).

## Test checklist the agent must leave green

- [x] `GET /finance/journal-entries` renders with entries that have null or invalid dates
- [x] `/api/guards` returns all active guards; the incident, deployment and patrol forms load
- [ ] Create, post and void works for: journal, sales invoice, receipt, credit note, debit note, proforma, PO, GRN, purchase invoice, payment, transfer, expense claim
- [x] Journal rejects: unbalanced, < 2 lines, all-zero, debit and credit on one line, foreign or missing account, negative amounts (all 400, never 500)
- [ ] Locked period blocks create, post and void for journals, invoices, receipts and payments (keep the existing behaviour)
- [x] 10 parallel receipts on one invoice → paid = sum of receipts; GL AR = subledger AR
- [x] Receipt customer ≠ invoice customer → rejected
- [x] Voiding an invoice with allocations → rejected
- [ ] Unique numbering per document type; imports respect the sequence
- [x] Balance Sheet balances without a plug; Current Year Earnings = Income Statement net profit
- [x] Dashboard, customer list, AI and GL report the same AR total
- [x] Paging returns every record exactly once; summary cards come from server totals
- [x] Payroll fixture matches the hand calculation; a zero-gross run cannot be approved
- [x] Employee validation: duplicate ID, invalid DOB, negative rate and over-long name are rejected (API and import)
- [x] Security headers present; authenticated APIs return no-store; no Prisma or Zod text in any error response
- [x] RLS check script: the anon key reads 0 rows from every table
- [ ] Audit row includes action, before/after diff, user and IP for every create, update, post and void

## What the developer should send back

- A PR per phase, with a short changelog mapping each change to its task id (P0-1, P1-5 …).
- The RLS table report (P0-5).
- The dry-run output of the remediation scripts (P1-8) for owner and accountant approval.
- A staging URL, plus one test login per role (Guard, Supervisor/Operations, Finance, HR, Client) and a second test tenant, so role-based access and cross-tenant isolation can be re-tested independently.

## Progress log

_Notes per task, added as each one is done._

### Phase 0 — branch `fix/phase-0` (2026-11-10)

Environment note: the audit ran against `ravenshield-erp.vercel.app` (Supabase project `yachjdzjfckvobsezwmi`). This repo now deploys to the owner's own Supabase project `zesyhoaltbjfnxxirqqv`, which was rebuilt from a schema baseline on 2026-10-27, so record-level evidence (579 journals, Govaspak data) cannot be reproduced here. Every bug was reproduced in code and in tests against a local Postgres instead.

Test harness (new): Vitest; integration tests call route handlers directly with a real sealed session cookie, against `TEST_DATABASE_URL`, which is rebuilt with `prisma migrate reset` each run and must be a local host (the setup refuses anything else). Each test below was run against the pre-fix code and failed, then passed after the fix.

- **P0-1** — `lib/utils.ts`: `formatDate`/`formatDateTime`/`formatTime` were already safe; `timeAgo` was not (8 call sites) — now returns "—". `DashboardStats` called date-fns directly — now uses `timeAgo`. `GET /api/finance/journal-entries` returns an explicit DTO (`lib/journal-entries.ts`) instead of spreading the raw row; `reference` falls back to `entry_number` for imported rows. Codebase sweep found no other unsafe `format(new Date(x.field))` / `.toISOString()` on record fields. The plan's DTO lists `lines`; the list page doesn't use them, so they were left out of the list payload. Tests: `tests/p0-1-journal-entries.test.ts`, `tests/p0-1-journal-page.test.tsx` (renders a `date: null` row).
- **P0-2** — `/api/guards` already existed (committed in 576f7f6) and the pages no longer used `Promise.all`; what remained was that no page checked `res.ok` or toasted. New `lib/fetch-list.ts` used by incidents, deployments, patrols and employee-accounts. Tests: `tests/p0-2-guards.test.ts` (company scoping, inactive excluded, 401, incident/deployment/patrol creation, one list failing doesn't blank the other).
- **P0-3** — The 2026-10-27 baseline already creates every enum; on this database the 42704 error cannot occur. Smoke tests found a real bug: **voiding a proforma from the UI 500'd** (bodyless PUT hit a bare `req.json()`) — fixed. Expense claims: create → approve (by a second user; self-approval is correctly blocked) → paid works. CI drift check added (`npm run check:migrations`, `.github/workflows/ci.yml`); verified it exits 0 in sync and 2 on drift. Tests: `tests/p0-3-documents.test.ts` (credit note, debit note, proforma, PO→GRN, cancelled PO, expense claim; posted ones produce a balanced journal).
- **P0-4** — Old flow (`/api/auth/reset-password?action=`) was a 6-digit WhatsApp OTP stored in plaintext with no attempt limit, and had no UI. Replaced: `POST /api/auth/forgot-password` (256-bit token, only SHA-256 stored, 30-min expiry, one live link, identical response for every outcome, 10/15 min per IP → 429, 3/15 min per email silently, link built from `NEXT_PUBLIC_APP_URL` only — never the Host header) and `POST /api/auth/reset-password` (single-use claim, strength rule ≥10 chars with a letter and a number, ≤72 bytes for bcrypt, audit row in the same transaction). Pages `/forgot-password`, `/reset-password`; login link wired. Session invalidation: new nullable `users.passwordChangedAt` (additive migration `20261110000000_add_user_password_changed_at`, no existing data changed); sessions carry `issuedAt`; middleware rechecks every 5 min via `/api/auth/session-status` and signs out revoked or deactivated users. Change-password now also signs out other devices. Verified end to end on a `next start` server. Tests: `tests/p0-4-password-reset.test.ts`.
- **P0-5** — Report: `docs/security/rls-report.md` — 84/84 tables have RLS on with no policies; non-empty tables (users, companies, roles, permissions…) return 0 rows to the publishable key; a private realtime channel is refused. Broadcast/presence channels in `lib/realtime.ts` are now private (nothing in the app uses them today). Script: `npm run check:rls` (CI job runs it when repo secrets are set). No exposure found on this project, so no key rotation is needed for it.
- **P0-6** — `next.config.mjs`: CSP (report-only), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS, `poweredByHeader: false`, `Cache-Control: private, no-store` on `/api/*` (confirmed on a real server, including `/api/auth/me`). `lib/api-error.ts`: Prisma/Zod/JSON/programming errors become `{ error, code, requestId }`, details logged server-side; 54 leaking `err.message` returns across 47 route files replaced. **Also fixed:** middleware skipped every path containing a dot, including `/api/...`, so `/api/hr/employees/a.b` bypassed the role guards. Tests: `tests/p0-6-hardening.test.ts` and the dotted-path case in `tests/p0-4-password-reset.test.ts`.

Gate 0 status:
- `npm test`: 48/48 pass. `npm run build`: passes (234 pages).
- `npm run lint`: **fails, but on pre-existing errors** — `master` has 212, this branch has 212 (none introduced). CI runs lint as non-blocking until that backlog is cleared.
- **Not done — owner action:** there is no staging environment. Vercel's Preview environment shares the production `DATABASE_URL`, so a preview of this branch would run against production — and production lacks `users.passwordChangedAt`, so login would fail there. Needed before Gate 0 can be signed off: a staging Supabase project (or at least applying the additive migration to production first), and a decision on whether pushing this branch is allowed to create a preview.
- **Owner action (P0-5):** in the Supabase dashboard → Realtime → Settings, turn off public channel access. Separately, the old project `yachjdzjfckvobsezwmi` behind `ravenshield-erp.vercel.app` was not checked (no access) — if it is still live, run `npm run check:rls` against it or take it down.

Found during Phase 0, deferred to Phase 1:
- Credit/debit note "issue" marks the note ISSUED before the GL transaction; a failed posting leaves an issued note with no journal (P1-5/P1-6).
- 87 routes call `req.json()` unguarded; malformed bodies now return a clean 400 only where the route's catch uses `apiError`. 119 routes have no try/catch at all (Next returns a bare 500 — no leak, but not the `{ error, code }` shape).

### Phase 1 — branch `fix/phase-1` (2026-11-10)

All new tests were run against the pre-fix code where it existed and failed first. `npm test`: 129/129. `npm run build`: passes. Lint: 210 errors, all pre-existing (master 212). Schema ↔ migrations: no drift.

- **P1-1** — 89 money columns → `Decimal(18,2)` (migration `20261110010000_money_decimal_18_2` **rounds existing values: owner approval required**; preview with `scripts/remediate/money-rounding.mjs --dry-run`). `lib/money.ts` rounds half-up on Decimal. Trial balance and balance sheet compare exactly (were `< 1`). Decimal serialises and adds as a number so existing UI/untyped code keeps working.
- **P1-2** — `lib/reports/ledger.ts` sums posted lines in SQL. Balance sheet: Current Year Earnings = fiscal-YTD net profit, prior unclosed P&L its own line, `difference` reported, never plugged. Finance and executive dashboards: ledger revenue/expenses/profit for the company's fiscal year (was hard-coded to 1 Jan); "Cash collected" separate.
- **P1-3 (partial)** — Bank accounts post opening balances as journals against 3050 Opening Balance Equity. Nightly `/api/cron/reconcile` (GL vs posted lines, bank vs GL, AR/AP vs control) notifies finance admins. Scripts: `opening-balances.mjs`, `recompute-balances.mjs` (also lists accounts named for one currency but recorded in another, e.g. 1011/1301). **Open:** per-line transaction currency + rate + reporting amount. Today a receipt into a ZWG bank posts the ZWG figure into the USD ledger. Needs an accountant decision on FX revaluation and historical vs current rates before building.
- **P1-4** — `getReceivables`/`getPayables` from document amounts (PAID-but-owing counted; credit notes, overpayments and unallocated receipts are credits) with a control-account difference. Used by both dashboards and the AI helpdesk; customer/supplier balance recalculation follows the same rule.
- **P1-5** — Receipts lock the invoice row (`FOR UPDATE`) and re-check inside the transaction; invoice decides the customer; GL-linked bank required. Voiding an invoice with money allocated is refused. `Idempotency-Key` on receipts (new `idempotency_keys` table). Status derived from amounts, one UPPERCASE vocabulary. Unique `(companyId, number)` for receipts/payments and invoices in migration `20261110030000` — **fails until duplicates are cleaned: accountant review via `duplicate-documents.mjs`, owner approval**. Deviation: overpaying an invoice is rejected rather than turned into credit (an unallocated receipt is the way to record credit); no separate Allocation table — the row lock meets the acceptance test.
- **P1-6** — One rule set for every journal (`lib/journal-rules.ts`), enforced by the schema and by `postJournal`, which all auto-postings now use. Draft posting re-validates and claims atomically. Single-prefix auto references. Code-range check on account create/type change. Unique account code index **waits for the duplicate merge** (`duplicate-account-codes.mjs`).
- **P1-7** — Paginated lists order by `(field, id)` and accept `?limit=` (≤100). Sales invoice cards and HR overview counts from the server.
- **P1-8 (scripts written, not run on real data)** — `scripts/remediate/`: `money-rounding`, `duplicate-account-codes`, `duplicate-documents`, `opening-balances`, `recompute-balances`, `reverse-test-records`. All default to read-only; the writing ones need `--apply`. **The dry-run output for owner/accountant approval has to be produced against the database that holds the audited data** (the original `yachjdzjfckvobsezwmi` project), which this environment cannot reach.
- **P1-9 (maker-checker partial)** — Audit rows record IP, user agent, request id and a field diff for every existing call; POST/VOID actions; journal post/void audit inside the transaction; `audit_trail` append-only via trigger. Maker-checker for journals over `Company.approvalThreshold`. **Open:** maker-checker for payments and payroll (they post immediately on create; needs an approval step in their workflow).
- **P1-10** — Pay basis per employee (daily × paid days / monthly / hourly). `lib/payroll/engine.ts` with effective-dated, second-person-approved statutory tables (PAYE bands after NSSA, AIDS Levy, NSSA ceiling, NEC, ZIMDEF) — no rates in code. Zero-gross / inconsistent runs refused. Run journal via `postJournal`. Orphan payslips excluded. Matches a 3-guard hand calculation.
- **P1-11** — Employee rules (API + import), incident enum, overtime cap, attendance-rate denominator, numeric low-stock compare, currency formatting, invoice notes. Fixed assets and inventory post to the GL; month-end depreciation (`/api/cron/depreciation`). Invoice imports: the import engine has no invoice module (bad invoices came from the original data load); the API already rejects due-before-issue.

Also fixed along the way: GL accounts with a NULL balance never moved when posted to; currency converter used outside the caller's transaction (pool exhaustion under concurrent receipts); credit/debit notes marked ISSUED before their posting succeeded; **document numbers were unique across all tenants** (a second company's first CRN-000001 collided) — now per company.

Gate 1 status — **not passed, owner action needed:**
- Requires a staging environment holding a copy of the audited data to close a month and reconcile to the cent. None exists; this environment can only reach the owner's new, nearly empty Supabase project.
- Before any of this reaches production: owner approval for the rounding migration and the unique-index migrations, then the remediation scripts in order (`reverse-test-records` → `opening-balances` → dedupe → `recompute-balances`), each dry-run first.
- Phase 2 has not been started, per the rule that the current phase's gate must pass first.
