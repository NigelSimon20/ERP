const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql'), 'utf8');
const tableRegex = /CREATE TABLE "([^"]+)"\s*\(([^]*?)\);/gmi;
const tables = [];
let match;
while ((match = tableRegex.exec(sql)) !== null) {
  const name = match[1];
  const body = match[2];
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cols = [];
  const fks = [];
  for (const line of lines) {
    if (/^FOREIGN KEY/i.test(line)) {
      const m = line.match(/FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)"\("([^"]+)"\)/i);
      if (m) fks.push({col: m[1], refTable: m[2], refCol: m[3]});
      continue;
    }
    const m = line.match(/^"([^"]+)"\s+([^\s,]+)/);
    if (m) cols.push(m[1]);
  }
  tables.push({name, cols, fks});
}

const fkCols = new Map();
for (const {name, cols, fks} of tables) {
  for (const fk of fks) {
    fkCols.set(`${name}.${fk.col}`, true);
  }
}
const suggestions = [];
for (const {name, cols, fks} of tables) {
  for (const col of cols) {
    if (col === 'id' || col === 'createdAt' || col === 'updatedAt' || col === 'status' || col === 'notes' || col.endsWith('Date') || col.endsWith('At') || col === 'name' || col === 'description' || col === 'email' || col === 'phone' || col === 'address' || col === 'currency' || col === 'amount' || col === 'total' || col === 'subtotal' || col === 'qty' || col === 'lineTotal' || col === 'reference' || col === 'title' || col === 'message' || col === 'type' || col === 'createdBy') continue;
    if (col.endsWith('Id') && !fkCols.has(`${name}.${col}`)) {
      suggestions.push({table:name,col});
    }
  }
}
console.log('possible missing FK constraints', suggestions.length);
console.log(suggestions.slice(0,200));
