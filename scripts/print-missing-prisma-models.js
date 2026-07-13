const fs = require('fs');
const path = require('path');
const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql'), 'utf8');
const existingModels = new Set([...schema.matchAll(/model\s+(\w+)/g)].map((m) => m[1]));
const sqlTables = [];
const tableRegex = /^CREATE TABLE "([^"]+)"\s*\(([^]*?)\);$/gm;
let m;
while ((m = tableRegex.exec(sql)) !== null) {
  sqlTables.push({ name: m[1], body: m[2] });
}
const mapName = (name) => name.split('_').map((word, idx, arr) => {
  if (idx === arr.length - 1) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('s')) return word.slice(0, -1);
  }
  return word;
}).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const typeMap = (sqlType) => {
  const t = sqlType.toUpperCase();
  if (/^(TEXT|JSONB|UUID|VARCHAR|CHAR|XML|CHARACTER VARYING|JSON)$/.test(t)) return 'String';
  if (/^(TIMESTAMP|TIMESTAMPTZ|DATE|TIME)/.test(t)) return 'DateTime';
  if (/^(DECIMAL|NUMERIC)/.test(t)) return 'Decimal';
  if (/^(DOUBLE PRECISION|REAL|FLOAT)/.test(t)) return 'Float';
  if (/^(INTEGER|INT|SERIAL|BIGINT)/.test(t)) return 'Int';
  if (/^(BOOLEAN)/.test(t)) return 'Boolean';
  const enumName = t.replace(/"/g, '');
  return enumName;
};
const parseColumnLine = (line) => {
  const m = line.trim().match(/^"([^"]+)"\s+([^\s,]+)(.*)$/);
  if (!m) return null;
  const [, col, type, rest] = m;
  const prismaType = typeMap(type);
  const notNull = /NOT NULL/.test(rest);
  const primary = /PRIMARY KEY/.test(rest);
  const unique = /UNIQUE/.test(rest) && !primary;
  const attrs = [];
  if (primary) attrs.push('@id');
  if (unique) attrs.push('@unique');
  if (/DEFAULT CURRENT_TIMESTAMP/.test(rest)) attrs.push('@default(now())');
  if (/DEFAULT true/.test(rest)) attrs.push('@default(true)');
  if (/DEFAULT false/.test(rest)) attrs.push('@default(false)');
  const defaultString = rest.match(/DEFAULT\s+'([^']+)'/);
  if (defaultString) attrs.push(`@default("${defaultString[1]}")`);
  const decimalMatch = type.match(/DECIMAL\((\d+),(\d+)\)/i) || type.match(/NUMERIC\((\d+),(\d+)\)/i);
  if (decimalMatch && prismaType === 'Decimal') attrs.push(`@db.Decimal(${decimalMatch[1]},${decimalMatch[2]})`);
  let field = `  ${col} ${prismaType}`;
  if (!notNull && !primary) field += '?';
  if (attrs.length) field += ' ' + attrs.join(' ');
  return field;
};
const missing = sqlTables
  .map(({ name, body }) => ({
    name,
    model: mapName(name),
    columns: body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !line.startsWith('CREATE INDEX') && !line.startsWith('FOREIGN KEY') && !line.startsWith(');') && !line.startsWith('--')).map(parseColumnLine).filter(Boolean),
  }))
  .filter(({ model }) => !existingModels.has(model));
for (const table of missing) {
  console.log('---');
  console.log(`model ${table.model} {`);
  table.columns.forEach((col) => console.log(col));
  console.log(`\n  @@map("${table.name}")`);
  console.log('}');
}
console.log('Total missing models:', missing.length);
