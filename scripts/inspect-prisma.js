const fs = require('fs');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const sql = fs.readFileSync('prisma/migrations/20260624000000_init/migration.sql', 'utf8');
const existingModels = [...schema.matchAll(/model\s+(\w+)/g)].map(m => m[1]);
const tableNames = [];
const re = /^CREATE TABLE "([^"]+)"/gim;
let m;
while ((m = re.exec(sql)) !== null) tableNames.push(m[1]);
const missing = tableNames.filter(t => !existingModels.includes(t.split('_').map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)).join('')));
console.log('existingModels', existingModels.length, existingModels.slice(-20));
console.log('tableNames', tableNames.length, tableNames.slice(-20));
console.log('missing', missing.length, missing);
for (const table of missing) {
  const reTable = new RegExp(`CREATE TABLE "${table}"([\\s\\S]*?)(?=CREATE TABLE|$)`, 'm');
  const match = sql.match(reTable);
  console.log('table', table, 'match', !!match);
  if (match) {
    const lines = match[0].split(/\r?\n/).slice(0, 15);
    console.log(lines.join('\n'));
    break;
  }
}
