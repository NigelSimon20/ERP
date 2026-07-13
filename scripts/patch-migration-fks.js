const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql');
let sql = fs.readFileSync(filePath, 'utf8');

const fksToAdd = {
  users: [{col: 'companyId', ref: 'companies'}],
  guards: [{col: 'companyId', ref: 'companies'}],
  deployments: [{col: 'guardId', ref: 'guards'}, {col: 'siteId', ref: 'sites'}],
  attendance: [{col: 'guardId', ref: 'guards'}, {col: 'siteId', ref: 'sites'}],
  incidents: [{col: 'siteId', ref: 'sites'}, {col: 'guardId', ref: 'guards'}],
  patrols: [{col: 'siteId', ref: 'sites'}, {col: 'guardId', ref: 'guards'}],
  equipment: [{col: 'companyId', ref: 'companies'}, {col: 'siteId', ref: 'sites'}],
  coverage_requests: [{col: 'siteId', ref: 'sites'}],
  chart_of_accounts: [{col: 'companyId', ref: 'companies'}],
  journal_entries: [{col: 'companyId', ref: 'companies'}],
  journal_lines: [{col: 'journalEntryId', ref: 'journal_entries'}, {col: 'accountId', ref: 'chart_of_accounts'}],
  bank_accounts: [{col: 'companyId', ref: 'companies'}],
  bank_transfers: [{col: 'fromAccountId', ref: 'bank_accounts'}, {col: 'toAccountId', ref: 'bank_accounts'}, {col: 'journalEntryId', ref: 'journal_entries'}],
  customers: [{col: 'companyId', ref: 'companies'}],
  suppliers: [{col: 'companyId', ref: 'companies'}],
  sales_invoices: [{col: 'companyId', ref: 'companies'}, {col: 'customerId', ref: 'customers'}],
  purchase_invoices: [{col: 'companyId', ref: 'companies'}, {col: 'supplierId', ref: 'suppliers'}],
  payments: [{col: 'companyId', ref: 'companies'}, {col: 'bankAccountId', ref: 'bank_accounts'}],
  receipts: [{col: 'companyId', ref: 'companies'}, {col: 'bankAccountId', ref: 'bank_accounts'}, {col: 'customerId', ref: 'customers'}, {col: 'invoiceId', ref: 'sales_invoices'}],
  fixed_assets: [{col: 'companyId', ref: 'companies'}],
  inventory_items: [{col: 'companyId', ref: 'companies'}],
  bank_reconciliations: [{col: 'bankAccountId', ref: 'bank_accounts'}],
  lock_dates: [{col: 'companyId', ref: 'companies'}],
  departments: [{col: 'companyId', ref: 'companies'}],
  employee_accounts: [{col: 'guardId', ref: 'guards'}],
  payslip_items: [{col: 'companyId', ref: 'companies'}],
  payroll_runs: [{col: 'companyId', ref: 'companies'}, {col: 'bankAccountId', ref: 'bank_accounts'}],
  leave_requests: [{col: 'guardId', ref: 'guards'}, {col: 'companyId', ref: 'companies'}],
  leads: [{col: 'companyId', ref: 'companies'}],
  quotations: [{col: 'companyId', ref: 'companies'}, {col: 'leadId', ref: 'leads'}, {col: 'customerId', ref: 'customers'}],
  client_liaisons: [{col: 'customerId', ref: 'customers'}, {col: 'guardId', ref: 'guards'}, {col: 'userId', ref: 'users'}, {col: 'siteId', ref: 'sites'}],
  tasks: [{col: 'companyId', ref: 'companies'}],
  requests: [{col: 'companyId', ref: 'companies'}],
  meetings: [{col: 'companyId', ref: 'companies'}],
  meeting_attendees: [{col: 'meetingId', ref: 'meetings'}, {col: 'userId', ref: 'users'}],
  notifications: [{col: 'userId', ref: 'users'}, {col: 'companyId', ref: 'companies'}],
  file_records: [{col: 'companyId', ref: 'companies'}],
  audit_trail: [{col: 'companyId', ref: 'companies'}, {col: 'userId', ref: 'users'}],
};

const addFks = (tableName, block, fks) => {
  const existing = fks.filter(({col}) => new RegExp(`FOREIGN KEY \("${col}"\)`, 'i').test(block));
  const toAdd = fks.filter(({col}) => !existing.some((e) => e.col === col));
  if (!toAdd.length) return block;

  const insert = toAdd.map(({col, ref}) => `  FOREIGN KEY ("${col}") REFERENCES "${ref}"("id")`).join(',\n');
  const idx = block.lastIndexOf('\n');
  const before = block.slice(0, idx);
  let lastLine = before.split('\n').pop();
  if (lastLine && !lastLine.trim().endsWith(',')) {
    const start = before.lastIndexOf('\n');
    const newBefore = before.slice(0, start + 1) + lastLine + ',';
    return newBefore + '\n' + insert + '\n' + block.slice(idx);
  }
  return before + '\n' + insert + block.slice(idx);
};

let updatedCount = 0;
for (const [table, fks] of Object.entries(fksToAdd)) {
  const regex = new RegExp(`CREATE TABLE "${table}" \(([^]*?)\n\);`, 'i');
  const match = sql.match(regex);
  if (!match) {
    console.warn('table not found', table);
    continue;
  }
  const newBlock = addFks(table, match[0], fks);
  if (newBlock !== match[0]) {
    sql = sql.replace(match[0], newBlock);
    updatedCount += 1;
  }
}
fs.writeFileSync(filePath, sql, 'utf8');
console.log('updated tables with FKs:', updatedCount);
