# Remaining Fixes Report (A1–A9)

Branch: `fix/A9-small-items`. The fix branches are stacked, each built on the one before, so this branch contains everything: the safety net, R9, R23 and A1–A9. Nothing has been pushed, deployed or run against production.

## Summary

| Check | Result |
|---|---|
| Full test suite (R1–R29, new tests, ledger invariants) | **290 / 290 pass** (33 files) |
| `tsc --noEmit` | clean |
| `npm run build` | passes (238 pages) |
| `npm run lint` | 206 errors, all pre-existing `no-explicit-any` style issues (210 at the end of Phase 1); no new ones |
| Click-through, Super Admin of a seeded test company | **74 / 74 sidebar pages**: no "Application error", no uncaught errors, no console errors, no API 5xx |

The click-through ran against a local database, not a Vercel preview. Vercel previews use the production `DATABASE_URL`, and production doesn't have these migrations yet. A preview would run the new code against the live database. See "Could not do".

## Step 1: safety net

`tests/regression/` holds R1–R29, which run against the `tests/fixtures/seed.ts` tenant. Ledger invariants run after every file. All four invariants are now enforced:

- Σ debits = Σ credits
- GL 1100 = Σ customer outstanding
- GL 2000 = Σ supplier outstanding
- for each bank: stored balance = calculated balance = GL balance

On the code as it was, 57 of 66 R-tests passed. I reported the failures and, with your approval, fixed them:

| | Problem | Commit |
|---|---|---|
| R9 | 8 routes returned 422 with no `PERIOD_LOCKED` code; creating a bill in a locked period returned 400 | `d2fb9d2` |
| R23 | An impossible date of birth (`1990-02-31`) was accepted and saved (API and imports) | `6b15b39` |

## Step 2: fixes

| ID | Status | Commit | Tests added |
|---|---|---|---|
| A1 Payments must say what they pay for | Done | `5e08932` | `tests/fixes/a1-payments.test.ts` (11) |
| A2 Credit/debit notes applied to their invoice/bill | Done | `68d4481` | `tests/fixes/a2-note-allocation.test.ts` (9) |
| A3.1 Payroll DRAFT → APPROVED → PAID | Done | `f01ff6a` | `tests/fixes/a3-payroll.test.ts`, `tests/fixtures/payroll-expected.csv` |
| A3.2 Statutory tables page, effective-to dates | Done | `9d097fa` | same file |
| A3.3 NEC grade-minimum warning | Done | `f026842` | same file (15 in total) |
| A4 Bank calculated balance from the ledger | Done | `e31fc39` | `tests/fixes/a4-bank-balance.test.ts` (3) |
| A5 RBZ sync | Done | `c389eaf` | `tests/fixes/a5-rbz.test.ts` (10), `tests/fixtures/rbz/*.html` |
| A6 Default chart of accounts | Done | `367e7a8` | `tests/fixes/a6-default-chart.test.ts` (5) |
| A7 Idempotency-Key | Done | `ac62013` | `tests/fixes/a7-idempotency.test.ts` (10), `tests/fixes/transfer-numbers.test.ts` |
| A8 AI helpdesk | Done (the key itself is for you to set) | `a114781` | `tests/fixes/a8-ai-helpdesk.test.ts` (2) |
| A9.1 Invoice notes on update | Done | `a042992` | `tests/fixes/a9-small-items.test.ts` |
| A9.2 One invoice status vocabulary | Done (backfill awaits approval) | `45a97f9` | same file |
| A9.3 Depreciation catch-up | Done | `2484512` | same file |
| A9.4 Operations input validation | Done | `512ba0e` | `tests/fixes/a9-ops-validation.test.ts` (18) |
| A9.5 No gaps in receipt/payment numbers | Done | `40ab64e` | `tests/fixes/a9-small-items.test.ts` |
| A9.6 Bank account `glAccountId` / `accountName` | Done | `1a9710f` | same file |

Every fix's tests were run against the unfixed code first and failed. Two exceptions: the A8 and A9.6 tests weren't run that way, because what they test didn't exist before (no availability check, no `glAccountId` support). The full suite was run after every fix.

### Bugs found along the way (fixed)

- **Transfers between companies collided.** Bank transfer references were unique across all tenants but numbered per company, so a second company's first transfer (`TRF-000001`) failed. Fixed in A7: references are now unique per company.
- **Attendance, patrols and deployments trusted the guard.** They never checked that the guard (and site) belonged to the user's company, so any company's guard could be written to. Fixed in A9.4.
- **A fully depreciated asset made the cron fail.** The zero check used decimal.js `isPositive()`, which is true for 0, so the asset tried to post a 0.00 journal. Fixed in A9.3.
- **Tests could reach the real Supabase.** Prisma loads `.env`, so the tests could call the real Supabase Auth through the login fallback. Fixed in `b255d80`.

### Existing tests changed because the brief changes the behaviour

- **`p1-payroll`:** "confirm posts the journal" now confirms, then approves as a second user. The totals are the same. (A3)
- **`p1-reconcile`, `p1-receipts`, `a2`:** these expected the stored legacy status spelling and now expect the UPPERCASE value. (A9.2)

## Migrations and scripts

To run on production, in order: `supabase/upgrade-2026-11-10.sql` (Phase 0/1, if not done), then **`supabase/upgrade-2026-11-12.sql`**. I tested this on a local copy built from `setup.sql`. After both, Prisma reports the database up to date with no difference from the schema.

| Migration | Kind |
|---|---|
| `20261112000000_credit_note_allocation` | Additive: columns with defaults (A2) |
| `20261112010000_payroll_approval` | Additive: one enum value, nullable and defaulted columns (A3) |
| `20261112020000_statutory_effective_to` | Additive: nullable column (A3) |
| `20261112030000_idempotency_request_hash` | Additive: column and indexes (A7) |
| `20261112040000_bank_transfer_reference_per_company` | Adds a nullable column and **replaces the global unique index with a per-company one**. No rows change, but it isn't purely additive, so please approve it explicitly. |

Data scripts. Each does a dry run by default and never touches production on its own:

| Script | What it does | Dry-run output |
|---|---|---|
| `scripts/remediate/unlinked-payments.mjs` (A1) | Lists payments with no bill, expense or supplier, or no linked journal, for someone to reclassify. Report only. | Local data: `0 payment(s) to review. Nothing was changed.` It must be run on the production data. |
| `scripts/remediate/invoice-status.mjs` (A9.2) | Sent → UNPAID, Partial → PARTIAL, Paid → PAID, Void → VOID. Changes the status text only. `--apply` needs your approval. | Test data: `Sent 1 -> UNPAID`, `Void 1 -> VOID`, `2 invoice(s) would change`. It must be run on the production data. |

## Changes users will notice

- **Payments:** must say what they're for: a supplier bill, a direct expense, or a supplier advance (new account 1450). A bank with no GL account is refused.
- **Credit and debit notes:**
  - They can be tied to an invoice or bill, and then reduce its balance.
  - A note larger than the remaining balance is refused unless **Settings → Allow unapplied credit** is on (it's off by default).
  - An invoice or bill with an applied note can't be voided.
- **Payroll:** "Confirm" now creates a draft.
  - Someone other than the creator must **approve** it, then **pay** it. This is on by default; a Super Admin can override, which is audited.
  - Payment is refused if the bank can't cover it.
  - Statutory rates are entered and approved on **HR → Statutory Tables**. Until they are, no deductions are calculated and the preview shows a warning.
- **Transfers:** both banks need a GL account.
- **Exchange rates:** a warning appears when the newest rate is more than 3 days old. A failed RBZ sync notifies admins.
- **New companies:** get a default chart of accounts. An empty chart offers "Load default chart".
- **AI helpdesk:** shows "Assistant unavailable — contact your administrator" until `GROQ_API_KEY` is set.
- **Depreciation:** catches up missed months. A month inside a locked period is never posted: that asset waits and finance admins are notified.
- **Invoice statuses:** are stored in UPPERCASE from now on.

## Deployment steps for the owner

1. Set `GROQ_API_KEY` in Vercel (Production and Preview) if you want the AI helpdesk.
2. Create a staging database (a separate Supabase project). Run `supabase/setup.sql`, `upgrade-2026-11-10.sql`, then `upgrade-2026-11-12.sql`.
3. Run the dry runs on staging, then on production (read-only): `unlinked-payments.mjs`, `invoice-status.mjs`, and the Phase 1 scripts (`reverse-test-records`, `opening-balances`, `duplicate-documents`, `recompute-balances`).
4. Approve: the transfer-reference index migration, the invoice-status backfill, and any reclassification the unlinked-payments list calls for.
5. Run `upgrade-2026-11-12.sql` on production, then merge and deploy.
6. Run the approved backfills with `--apply`.
7. In the app: enter and approve statutory tables; check the GL account mappings in Settings (including Net Pay Payable, or let it create 2210).

## Could not do, and why

- **Preview deployment and preview URL.** Vercel previews share the production database, which doesn't have these migrations. A preview would break and could write to live data. The click-through ran on the production build locally instead, against a seeded local database. A safe preview needs a staging database configured for Preview in Vercel (step 2).
- **Dry runs against real data.** I can't reach the production or audited database from here. The outputs above are from local data.
- **Applying a supplier advance to a bill later (A1).** Advances post to 1450 and are listed against the supplier. A screen to set an advance against a bill (Dr AP / Cr 1450) isn't built yet.
- **Bank account form fields (A9.6).** The API accepts `glAccountId` and `accountName`; the form doesn't show them yet.
- **Finding F1, reported and not fixed.** A manual journal posted to a bank's GL account moves the GL but not the bank's stored balance, so the nightly reconcile job flags it. Whether manual journals to bank accounts should be allowed, or should update the bank, is an accounting decision.
- **Locked months in depreciation (A9.3).** I chose the cautious behaviour: wait and notify, never post into a locked month. If you'd rather post the missed months as a single catch-up in the first open month, that's a small change.

## For the re-test

- **Preview URL:** not provided, for the reason above. A staging database is needed first.
- **Database:** the click-through used a local database, not production.
- **Test logins:** the seeded test company has Super Admin, Finance (×2), Operations and HR users (`tests/fixtures/seed.ts`, password `Correct-horse-1`). Guard and Client logins and a second tenant need creating on staging.
- **RLS report:** `docs/security/rls-report.md` (Phase 0). The two new columns' tables already had RLS; no new tables were added.
- **Test mailbox:** not set up. Password-reset emails need `RESEND_API_KEY` on staging.
