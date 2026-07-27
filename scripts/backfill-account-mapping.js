// One-off deployment-safety script: resolves the 5 GL control accounts using
// the SAME fuzzy-match logic the live code currently uses, and writes the
// resolved IDs onto Company.*AccountId (receivablesAccountId, payablesAccountId,
// vatAccountId, salariesExpenseAccountId, payrollLiabilitiesAccountId).
//
// Run this BEFORE deploying the hard-fail GL-posting code -- that code reads
// these explicit fields and refuses to post if they're unset. This script
// only ever *sets a currently-null* field; it never overwrites a value an
// admin already configured by hand in Settings.
//
// Must run after the 20260726120000_add_gl_account_mapping migration has
// been applied (node scripts/apply-migration.js 20260726120000_add_gl_account_mapping)
// and `npx prisma generate` has been run.
//
// Usage: node scripts/backfill-account-mapping.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resolve(companyId, type, nameFilter) {
  const account = await prisma.chartOfAccount.findFirst({
    where: { companyId, account_type: type, account_name: { contains: nameFilter } },
  });
  return account?.id ?? null;
}

async function resolveExact(companyId, type, name) {
  const account = await prisma.chartOfAccount.findFirst({
    where: { companyId, account_type: type, account_name: name },
  });
  return account?.id ?? null;
}

async function main() {
  const companies = await prisma.company.findMany({
    select: {
      id: true, name: true,
      receivablesAccountId: true, payablesAccountId: true, vatAccountId: true,
      salariesExpenseAccountId: true, payrollLiabilitiesAccountId: true,
    },
  });

  for (const company of companies) {
    console.log(`\n${company.name} (${company.id})`);
    const updates = {};
    const unresolved = [];

    if (!company.receivablesAccountId) {
      const id = await resolve(company.id, 'ASSET', 'Accounts Receivable');
      if (id) updates.receivablesAccountId = id; else unresolved.push('Accounts Receivable');
    }
    if (!company.payablesAccountId) {
      const id = await resolve(company.id, 'LIABILITY', 'Accounts Payable');
      if (id) updates.payablesAccountId = id; else unresolved.push('Accounts Payable');
    }
    if (!company.vatAccountId) {
      const id = await resolve(company.id, 'LIABILITY', 'VAT');
      if (id) updates.vatAccountId = id; else unresolved.push('VAT Payable (optional -- only required if invoices carry tax)');
    }
    if (!company.salariesExpenseAccountId) {
      const id = await resolveExact(company.id, 'EXPENSE', 'Salaries Expense');
      if (id) updates.salariesExpenseAccountId = id; else unresolved.push('Salaries Expense');
    }
    if (!company.payrollLiabilitiesAccountId) {
      const id = await resolveExact(company.id, 'LIABILITY', 'Payroll Liabilities');
      if (id) updates.payrollLiabilitiesAccountId = id; else unresolved.push('Payroll Liabilities');
    }

    if (Object.keys(updates).length) {
      await prisma.company.update({ where: { id: company.id }, data: updates });
      console.log('  Resolved:', Object.keys(updates).join(', '));
    }
    if (unresolved.length) {
      console.log('  UNRESOLVED (set by hand in Settings -> Company -> Tax before enabling hard-fail):', unresolved.join(', '));
    }
    if (!Object.keys(updates).length && !unresolved.length) {
      console.log('  Already fully configured.');
    }
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
