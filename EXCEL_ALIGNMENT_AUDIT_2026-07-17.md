# Excel ↔ Database ↔ UI Alignment Audit — 2026-07-17

Read-only re-scan of every workbook in `/excel` against the live Supabase database (via Prisma) and the current Next.js app code. No schema changes, no data changes, no UI changes were made as part of this pass — this is Phase 1-3 of the "master prompt" only, per the user's explicit choice to audit before touching anything.

This builds on an earlier audit from 2026-07-16/17 (see project memory `project_ravenshield_excel_audit.md`), most of which is still accurate and is **not** re-litigated here except where this pass found something new or found that a "resolved" item had regressed.

## Method

- Parsed all `.xlsx` files in `/excel` with `openpyxl` (headers, row counts).
- Read the live Prisma schema (`prisma/schema.prisma`) for each corresponding model's real column names.
- Queried the live Supabase DB (via Prisma) for row counts.
- Grepped the relevant API route + frontend page for each module to check whether the API's JSON keys actually match what the page destructures.

## Row-count reconciliation

| Excel file | Excel rows | DB table | DB rows | Match? |
|---|---|---|---|---|
| Employees (1).xlsx | 310 | guards | 311 | +1 (likely a manually-added employee via the app; no duplicate force_number, no orphan pattern found — not a bug) |
| Customers.xlsx | 39 | customers | 39 | Exact |
| Suppliers.xlsx | 8 | suppliers | 8 | Exact |
| Sites.xlsx | 88 | sites | 88 | Exact |
| Equipment (1).xlsx / Equipment.xlsx (duplicate) | 30 | equipment | 30 | Exact |
| Bank Accounts.xlsx | 7 | bank_accounts | 8 | +1 — the known orphan row (`account_name: null`, phone number in `account_number`, `current_balance: 55555`) flagged 2026-07-16, still not deleted |
| Sales Invoices.xlsx | 116 | sales_invoices | 116 | Exact |
| **Purchase Invoices.xlsx** | **14** | **purchase_invoices** | **0** | **Still fully unimported** — blocked by missing `reference` column (known, unchanged since 2026-07-16) |
| Leave Requests.xlsx | 19 | leave_requests | 16 | 3 short — Study/Cash-in-Lieu leave types have no matching `LeaveType` enum member (known, unchanged) |
| Attendance_2026-07.xlsx | 310 rows × 31 days | attendance | 1,866 | Reconciled exactly against Excel's own Present/Sick/Leave/Absent/AWOL summary columns (done 2026-07-17) |
| Customer Receipts.xlsx | 105 | payments (`payment_type='Customer Receipt'`) | 105 | Exact (fixed 2026-07-17 — was reading from a dead duplicate `receipts` table before) |
| Income_Statement_2026-07-16.xlsx | 36 accounts | chart_of_accounts | 61 accounts | Not a row-count comparison — this file is the app's own (previously broken, now fixed) P&L export, not a source-of-truth import |

## NEW findings this pass (not in the 2026-07-16/17 audit)

### 1. Sites page renders blank — more severe than previously known drift patterns
`app/api/operations/sites/route.ts` GET spreads the raw Prisma row (`site_name`, `day_shift_required`, `contract_start_date`, etc. — real snake_case columns) and only adds `customerName` and a **hardcoded** `activeDeploymentCount: 0`. It never adds the camelCase fields the frontend actually reads.

`app/(dashboard)/operations/sites/page.tsx` reads `s.name`, `s.guardsRequired`, `s.contractValue`, `s.contractStart`, `s.contractEnd` — **none of these keys exist in the API response.** Concretely:
- Every site row renders a **blank Name** cell (`{s.name}` at page.tsx:149 is always `undefined`) across all 88 sites.
- The "contract expiring within 30 days" banner (`isExpiringSoon`, reads `s.contractEnd`) **never fires** for any site — `contractEnd` is always undefined.
- `activeDeploymentCount` is hardcoded to `0` for every site regardless of real deployments.
- `guardsRequired` (frontend) has no real single-field equivalent — the schema splits it into `day_shift_required`/`night_shift_required`, so even a naive rename won't fix this; it needs a real mapping decision.
- There is no `contractValue` column on `Site` at all — same "pure fiction" pattern found in the Employees page's old `hourlyRate`/`rank` bug.

This is the same **general shape** as the "employees have contracts expiring" alert banner you asked about in the master prompt — except that specific banner (with employee names, "9d left" countdown badges) doesn't exist anywhere in the codebase today. Something structurally similar exists for **sites**, but it's non-functional for the reasons above.

### 2. Equipment page queries the right table but with a completely fictional shape
`app/api/operations/equipment/route.ts` GET does `prisma.equipment.findMany()` with no mapping — returns raw `equipment_name`, `equipment_code`, `quantity_in_stock`, `quantity_issued`, `quantity_damaged`, `quantity_lost`, `unit_cost` (all real columns).

`app/(dashboard)/operations/equipment/page.tsx`'s `Equipment` interface expects `name`, `serialNumber`, `condition`, `status` (`'AVAILABLE'` / `'ASSIGNED'`), `value`, `purchaseDate`, `assignedTo`, `assignedToGuard`, `site` — **none of these exist on the real `Equipment` model.** This isn't a naming mismatch, it's a different mental model entirely: the real imported data is **aggregate stock** (30 equipment *types*, with in-stock/issued/damaged/lost quantity counts each), while the frontend is built for **per-unit tracking** (individual serialized items each assigned to one guard/site with a lifecycle status). The two can't be reconciled with a rename — this needs a product decision (see Recommendations).

The POST handler makes it worse: it takes `condition` from the create form and stuffn it into the `description` text column, and `purchaseDate` into `created_date` (import-metadata field, not a real purchase date) — every "Add Equipment" submission silently mislabels data even where it does write something.

### 3. Equipment and Bank Accounts have no real `status` column — Excel's Status column has nowhere to go
Both `Equipment.xlsx` and `Bank Accounts.xlsx` have a `Status` column (e.g. presumably `Active`/`Inactive`/`Damaged`-type values). Neither the `Equipment` nor `BankAccount` Prisma model has a string `status` field — both only have a `is_active: Boolean?`. `app/(dashboard)/finance/bank-accounts/page.tsx` doesn't reference `status` or `is_active` anywhere — the Status column from Excel is simply not surfaced in the UI at all for bank accounts. (Equipment's frontend does reference `status`, but as covered in finding #2, it's the fictional AVAILABLE/ASSIGNED concept, not Excel's real status text.)

## Reconfirmed still-open items (unchanged since 2026-07-16/17, verified still true today)

| Item | Status |
|---|---|
| `z.string().uuid()` validation on IDs in `app/api/finance/transfers/route.ts`, `payments/route.ts`, `accounts/route.ts`, `accounts/[id]/route.ts` | Not fixed — real IDs are 24-char hex from the base44 import, never UUID-formatted. Bank Transfers, Supplier/Other Payments, and Chart-of-Accounts create/edit have likely never successfully submitted in production. |
| `purchase_invoices.reference` column missing | Not fixed — 14 rows still un-importable, table still at 0 rows |
| 3 leave requests (Study / Cash-in-Lieu) | Not fixed — `LeaveType` enum has no matching member |
| Bank Accounts orphan row (`account_name: null`, phone number as account number) | Not deleted |

## Modules confirmed clean this pass (no drift found)

- **Customers**: `app/api/finance/customers/route.ts` correctly maps `company_name` → `name` (spot-checked, matches the 2026-07-09 fix)
- **Attendance, Suppliers**: previously confirmed clean 2026-07-16, not re-broken

## What this report does NOT cover

Per the user's "quick fix only" precedent earlier this session and the explicit choice to run audit-only this round: **no fixes were applied.** Also out of scope for this pass:
- Deep per-row data-quality checks (duplicates, blanks) within each sheet beyond what's already documented
- Chart of Accounts — no `Chart Of Accounts.xlsx` actually exists in `/excel` (the master prompt named it as an example; there's no source file to reconcile against)
- The full "enterprise UI rebuild" (profile drawers, contract-expiry alert banners, import engine, white-theme redesign) — not started, by design

## Recommended priority order (not yet actioned — awaiting direction)

1. **Sites page blank-name bug** — newly found, high visibility (88 real sites, core operations data), pure mapping fix, no schema changes needed except deciding how to represent `guardsRequired`/`contractValue`.
2. **UUID validation bug** — blocks 3 whole forms from ever submitting; isolated, no data risk.
3. **Purchase Invoices reference column + import** — additive schema change (one nullable column) + one-time import of 14 rows.
4. **Equipment model decision** — needs your call: keep it as aggregate stock (fix the frontend to match reality) or actually build per-unit tracking (bigger, needs new schema: assignment records, status lifecycle, serial numbers per unit rather than one text blob).
5. Bank Accounts orphan row deletion (trivial, 1 row).
6. 3 unimportable leave rows — needs a decision on whether to add `STUDY`/`CASH_IN_LIEU` to the `LeaveType` enum.
