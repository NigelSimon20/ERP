const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql');
const sql = fs.readFileSync(file, 'utf8');
const lines = sql.split(/\r?\n/);
const problems = [];
const types = new Map();
const tables = new Map();
const indexes = new Map();
let current = null;
let paren = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const t = line.trim();
  let m;

  if ((m = t.match(/^CREATE TYPE\s+"([^"]+)"/i))) {
    const name = m[1];
    if (types.has(name)) problems.push({line: i + 1, msg: `Duplicate type ${name}`});
    types.set(name, i + 1);
  }

  if ((m = t.match(/^CREATE TABLE\s+"([^"]+)"/i))) {
    const name = m[1];
    if (tables.has(name)) problems.push({line: i + 1, msg: `Duplicate table ${name}`});
    tables.set(name, { line: i + 1, cols: new Map() });
    current = name;
    paren = 0;
  }

  if (current) {
    paren += (line.match(/\(/g) || []).length;
    paren -= (line.match(/\)/g) || []).length;
    const colMatch = t.match(/^"([^"]+)"\s+([A-Z][A-Z0-9_\("]*)/i);
    if (colMatch) {
      const col = colMatch[1];
      if (tables.get(current).cols.has(col)) problems.push({line: i + 1, msg: `Duplicate column ${col} in table ${current}`});
      tables.get(current).cols.set(col, i + 1);
    }
    if (paren <= 0) current = null;
  }

  if ((m = t.match(/^CREATE INDEX\s+"([^"]+)"/i))) {
    const name = m[1];
    if (indexes.has(name)) problems.push({line: i + 1, msg: `Duplicate index ${name}`});
    indexes.set(name, i + 1);
  }

  if ((m = t.match(/FOREIGN KEY\s+\("([^"]+)"\)\s+REFERENCES\s+"([^"]+)"\("([^"]+)"\)/i))) {
    const refTable = m[2];
    if (!tables.has(refTable)) problems.push({line: i + 1, msg: `FK references unknown table ${refTable}`});
  }

  if (/""\s+[A-Z]/.test(t)) problems.push({line: i + 1, msg: 'Empty column name'});
  if (/CREATE TABLE\s+""/i.test(t)) problems.push({line: i + 1, msg: 'Empty table name'});
  if (/DEFAULT\s+CURRENT_TIMESTAMP\s+NOT\s+NULL/i.test(t)) problems.push({line: i + 1, msg: 'Default CURRENT_TIMESTAMP should appear before NOT NULL'});
}
console.log(`Problems found: ${problems.length}`);
problems.slice(0, 200).forEach((p) => console.log(`${p.line}: ${p.msg}`));
console.log('Total tables', tables.size, 'Total types', types.size, 'Total indexes', indexes.size);
