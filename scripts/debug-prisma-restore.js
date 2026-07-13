const fs = require('fs');
const path = require('path');
const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql'), 'utf8');
const existingModels = new Set([...schema.matchAll(/model\s+(\w+)/g)].map(m => m[1]));
console.log('existingModels', existingModels.size, Array.from(existingModels).slice(0, 40));
const tableRegex = /^CREATE TABLE "([^"]+)" \((.*?)\);$/gms;
const tables = [];
let match;
while ((match = tableRegex.exec(sql)) !== null) {
  tables.push(match[1]);
}
console.log('tables count', tables.length, tables.slice(0, 40));
const mapName = (name) => name.split('_').map((word, idx, arr) => {
  if (idx === arr.length - 1) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('s')) return word.slice(0, -1);
  }
  return word;
}).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const missing = tables.map(t => ({table:t,model:mapName(t)})).filter(({model})=>!existingModels.has(model));
console.log('missing count', missing.length);
console.log(missing.slice(0,40));
for (const {table,model} of missing.slice(0,5)) {
  const re = new RegExp(`CREATE TABLE "${table}"([\s\S]*?)(?=CREATE TABLE|$)`, 'm');
  const m = sql.match(re);
  console.log('table', table, 'model', model, 'match', !!m);
  if (m) {
    const lines = m[0].split(/\r?\n/).slice(0, 10);
    console.log(lines.join('\n'));
    break;
  }
}
