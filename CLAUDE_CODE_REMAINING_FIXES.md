# RavenShield ERP — Remaining Fixes (Claude Code brief)

> Work in this order: **Step 1 (safety net) → Step 2 (fixes A1–A9, one at a time) → Step 3 (final check)**.
> Do not start a fix until Step 1 is complete and green.
> After every fix, run the **entire** test suite. If any previously passing test fails, stop, revert that change, and say why.
> Never deploy, never run migrations or SQL against production, and never delete data. Ask the owner before any migration that alters or backfills existing rows.

## 0. Rules (every change)

1. **Branch per fix** (`fix/A1-unlinked-payments`, `fix/A2-credit-note-allocation`, …), one small commit per fix, message referencing the ID (e.g. `A1: require payment entityType`).
2. **Test first:** a test that reproduces the bug and fails; make it pass; run the full suite.
3. **Smallest change that works.** No refactors, renames or reformatting outside the fix; no dependency upgrades; don't change an API response shape the UI uses (adding fields is OK).
4. **Single source of truth:** balances come from posted journal lines — never a separate calculation.
5. **Money:** Decimal or integer cents, rounded per line, exact comparisons.
6. **Errors:** `{ error, code, requestId }` with a 4xx for anything the user can cause. A 500 is always a bug.
7. **One transaction:** document, journal, allocations and audit row together, or not at all.
8. **Migrations:** additive only (new nullable/defaulted columns and tables). Backfills are separate `--dry-run` scripts. No drops or renames.
9. **Surprising behaviour changes** go behind a company setting with a safe default, plus a changelog note.
10. **Multi-tenancy:** every query filtered by session `companyId`; new routes use the existing session helper; new tables have `companyId` + index.

## Step 1 — Safety net (done first)

Behaviours verified at https://erp-five-azure.vercel.app on 11 Nov 2026, pinned as API tests in `tests/regression/` against the `tests/fixtures/seed.ts` tenant ("ZZTEST Co", FY 01-01, VAT 15.5%; accounts 1100, 1200, 1400, 1500, 1510, 2000, 2100, 2200, 2300, 3050, 3100, 4100, 5100, 5200, 6106; 2 USD banks; customers A and B; 1 supplier; 2 sites; 3 active guards at $6/day).

| # | Behaviour |
|---|---|
| R1 | Journal list returns a valid `date`; page renders rows |
| R2 | Unbalanced journal → 400 |
| R3 | < 2 lines → 400 |
| R4 | All-zero line, or debit and credit on one line → 400 |
| R5 | Unknown or foreign account → 400 `INVALID_ACCOUNT` |
| R6 | Date `2026-13-45` → 400 `VALIDATION_ERROR`, no Prisma text |
| R7 | 0.1 + 0.2 vs 0.3 posts; trial balance exact; 1.005 stored as 1.01 |
| R8 | Post twice → 409; void twice → 400; voided entry keeps its lines |
| R9 | Lock until 31 Oct blocks October create/post/void for journals, invoices, bills, payments, transfers → 422 `PERIOD_LOCKED` |
| R10 | 2 × 100 @ 15.5% → 231; Dr 1100 231 / Cr 4100 200 / Cr 2100 31; reference `JE-auto-INV-…` |
| R11 | Unit price 0, negative qty, tax > 100, no lines, due before issue → 400 |
| R12 | 2 simultaneous invoices → different numbers |
| R13 | 10 simultaneous $1 receipts → paid +10; bank +10 |
| R14 | Overpayment → 400 `OVERPAYMENT`; wrong customer → 400 `CUSTOMER_MISMATCH`; amount ≤ 0 → 400 |
| R15 | Invoice with a receipt → void 409 `HAS_ALLOCATIONS` |
| R16 | Assets = L + E exactly; Current Year Earnings = IS net profit; `difference` 0 |
| R17 | Dashboard revenue/expenses/net = IS; AR = GL 1100; cash = Σ bank GL |
| R18 | `limit` honoured; ids unique across pages; `summary` = SQL totals |
| R19 | Credit note, debit note, proforma, PO (approve), GRN, bill, expense claim → 201 |
| R20 | GRN over-receipt rejected; receipt after a full one rejected; PO → RECEIVED |
| R21 | Transfer to same account rejected; insufficient funds rejected; linked payment above bill balance rejected |
| R22 | 5 PRESENT days at $6 → 30; PRESENT + paid LEAVE counted; ABSENT unpaid; zero-gross → 400 `PAYROLL_INVALID`; duplicate period → 409 |
| R23 | Duplicate national ID, age outside 18–75, invalid date, rate ≤ 0, name > 120, hired before birth → 400 |
| R24 | Duplicate account code → 400; code outside type range → 400 `ACCOUNT_CODE_RANGE` |
| R25 | Double-booked guard → 400; bad incident severity → 400; overtime > 24h → 400; `/api/guards` returns active guards; incident form endpoints load |
| R26 | qty 10 / reorder 5 not low; stock and assets post against 3050; second depreciation in a month → 409 |
| R27 | Unauthenticated → 401; `Cache-Control: private, no-store`; CSP, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy; no `x-powered-by`; generic forgot-password; login 429 after 5 failures |
| R28 | Journal POST and VOID write audit rows with action, old/new values, IP, user agent, requestId |
| R29 | Company X can't GET, void or receipt against Company Y's ids → 404 |

Ledger invariants after every test file: Σ debits = Σ credits; GL 1100 = Σ customer outstanding (after A2); GL 2000 = Σ supplier outstanding (after A1); each bank's stored = GL = calculated balance (after A4).

## Step 2 — Fixes (in order)

### A1 · Payments not linked to a bill post to AP — HIGH
Untyped `POST /api/finance/payments` → 201, Dr 2000 / Cr bank, no bill reduced, `journal_entry_id` null. Require `entityType` ∈ `PURCHASE_INVOICE` (needs `entityId`; reduces the bill) | `EXPENSE` (needs `expenseAccountId`; Dr it) | `SUPPLIER_ADVANCE` (needs `supplierId`; Dr new "1450 Supplier Advances", created if missing; allocatable to a bill later). Missing/unknown → 400 `PAYMENT_TYPE_REQUIRED`. Always store `journalEntryId`. Payment form shows the three options. Don't break R21, R9, R17. Tests: each type posts correctly; untyped → 400; GL 2000 = Σ supplier outstanding. Existing data: `--dry-run` script listing payments with no entity and no journal link — no automatic changes.

### A2 · Credit and debit notes not allocated — HIGH
Credit note with `invoiceId` stores `salesInvoiceId: null`; issue leaves the invoice and customer balance unchanged. Accept `invoiceId` or `salesInvoiceId`, add an invoice picker. On `?action=issue`, in the same transaction, allocate to the invoice (≤ invoice balance, else 400 or unapplied customer credit per a company setting); recompute invoice status. Customer outstanding = Σ open invoice balances − Σ unapplied credits. Voiding reverses the allocation. Mirror for debit notes against bills. Don't break R15 (credit-note allocations count), R16, R17, R18. Tests: 11.55 credit on a 115.50 invoice → balance −11.55; customer list = invoice summary = GL 1100 = dashboard AR; over-balance follows the setting; void reverses.

### A3 · Payroll approval, statutory deductions, bank check — HIGH (separate commits)
1. Lifecycle DRAFT → APPROVED → PAID. `confirm` creates DRAFT, no journal. `approve` posts Dr Salaries / Cr Net Pay Payable (+ Cr each deduction liability), by a user other than the creator (setting `payrollRequireSecondApprover`, default on; Super Admin may override with an audit row). `pay` posts Dr Net Pay Payable / Cr Bank with the payments' insufficient-funds check (400 `INSUFFICIENT_FUNDS`). DRAFT deletable; APPROVED reversible by journal; PAID not editable.
2. Statutory engine: table (companyId, type, effectiveFrom, effectiveTo, data JSON, approvedBy, approvedAt, sourceRef) for PAYE bands per currency, AIDS Levy, NSSA, NEC, ZIMDEF/SDL. Admin UI with approval; no hardcoded rates; nothing seeded; warning until approved. Version effective on period end; payslips show each deduction; employer contributions Dr expense / Cr liability.
3. Below-NEC-minimum warning on preview (doesn't block).
Don't break R22, R9. Tests: 3-guard fixture vs `tests/fixtures/payroll-expected.csv`; unapproved pay → 409; self-approval → 403 with the setting on; overdraw → 400; net = gross − deductions.

### A4 · Bank calculated balance ignores transfers and payroll — MEDIUM
Calculated balance = opening balance + Σ posted journal lines on the bank's `chart_account_id`; drop the per-document sum. Don't break R17, R21. Test: after a receipt, payment, transfer in/out and payroll payment → stored = calculated = GL.

### A5 · RBZ exchange-rate sync fails — MEDIUM
Parser in `lib/fx/rbz.ts`, unit-tested against saved pages in `tests/fixtures/rbz/*.html`; tolerant of layout changes; `RBZ_PARSE_FAILED` instead of 502; manual entry keeps working; warning on Exchange Rates page and dashboard when the latest rate is > 3 days old; daily cron with admin failure notification. Don't break dashboard reporting-currency conversion.

### A6 · New company has no chart of accounts — MEDIUM
`lib/onboarding/seedChartOfAccounts.ts`: default security-company chart, own transaction, only when the company has 0 accounts; links the settings. Called on sign-up and from a "Load default chart" button on an empty Chart of Accounts page. Idempotent. Don't break R24; never touch a company that has accounts.

### A7 · Idempotency-Key ignored — MEDIUM
Same key created INV-000006 and INV-000007. Table (companyId, key, requestHash, responseStatus, responseBody, createdAt), unique (companyId, key), 24h TTL clean-up. On POST for invoices, receipts, payments, journals, credit notes, transfers, payroll confirm: same key + body → replay; same key + different body → 422 `IDEMPOTENCY_MISMATCH`; no key → unchanged. Don't break R12, R13.

### A8 · AI Helpdesk offline — MEDIUM
Document `GROQ_API_KEY` in `.env.example`; UI shows "Assistant unavailable — contact your administrator"; receivables, revenue and cash answers use the same functions as `/api/dashboard/finance` (test). Setting the key in Vercel is the owner's task.

### A9 · Small items — LOW (one commit each)
1. Invoice `notes` persisted on create and update.
2. One invoice status enum `UNPAID | PARTIAL | PAID | OVERDUE | VOID`; dry-run backfill of legacy values ("Sent" → UNPAID, "Partial" → PARTIAL); accept legacy values on read.
3. Monthly depreciation cron for every active asset, plus catch-up of missed months from purchase date, one journal per month dated at month end, respecting lock dates.
4. `POST /api/operations/patrols` with missing/invalid `scheduledTime` → 400 (not 500); Zod schemas on all `/api/operations/*` POST routes.
5. Receipt and payment numbers allocated after validation, inside the transaction (no gaps).
6. Bank account create honours `glAccountId` (ASSET, same company, not linked to another bank), else auto-creates; saves `accountName`.

## Step 3 — Final check and report
1. Full suite green (R1–R29, new tests, invariants).
2. `npm run build`, `npm run lint`, type check clean.
3. Click-through on a preview deployment as Super Admin of the test company: no "Application error", no uncaught console errors.
4. `REMAINING_FIXES_REPORT.md`: A1–A9 table (status, commit, tests); R1–R29 runner summary; every migration and backfill with dry-run output; user-visible behaviour changes; owner deployment steps (set `GROQ_API_KEY`; migrations on staging; dry-runs; approval; deploy; approved backfills); what couldn't be done and why.
5. Preview URL only; production needs the owner's written approval.

**Out of scope:** rostering, guard PWA, incident categories/evidence, contract billing, bank statement import, 2FA, WhatsApp notifications, command centre, SaaS plans (Phases 2–3 of `RAVENSHIELD_FIX_PLAN.md`).

**For the re-test, send:** preview URL; whether it shares the production database; one test login per role (Guard, Supervisor/Operations, Finance, HR, Client); the RLS report; a test mailbox for password resets.
