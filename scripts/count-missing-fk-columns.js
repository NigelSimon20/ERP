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
      if (m) fks.push(m[1]);
      continue;
    }
    const m = line.match(/^"([^"]+)"\s+([A-Z][^\s,]*)/i);
    if (m) cols.push(m[1]);
  }
  tables.push({ name, cols, fks });
}

const candidates = [];
for (const table of tables) {
  for (const col of table.cols) {
    if (/Id$/.test(col) && !table.fks.includes(col)) {
      candidates.push({table: table.name, column: col});
    }
  }
}
console.log('missing FK columns:', candidates.length);
console.log(candidates.slice(0, 200));
