const fs = require('fs');
const path = require('path');
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
const sql = fs.readFileSync(sqlPath, 'utf8');
const existingEnums = new Set([...schema.matchAll(/enum\s+(\w+)/g)].map(m => m[1]));
const existingModels = new Set([...schema.matchAll(/model\s+(\w+)/g)].map(m => m[1]));

function parseEnum(line) {
  const m = line.match(/^CREATE TYPE "([^"]+)" AS ENUM \((.*)\);$/);
  if (!m) return null;
  const name = m[1];
  const values = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  return { name, values };
}

function parseColumn(line) {
  const m = line.match(/^"([^\"]+)"\s+([^\s,]+)(.*)$/);
  if (!m) return null;
  const [, col, type, rest] = m;
  let field = col;
  let prismaType = 'String';
  const sqlType = type.toUpperCase();
  if (/^(TEXT|JSONB|UUID|CHAR|VARCHAR|XML)$/.test(sqlType) || /^STRING/.test(sqlType)) prismaType = 'String';
  else if (/^(TIMESTAMP|DATE|TIME|TIMESTAMPTZ)/.test(sqlType)) prismaType = 'DateTime';
  else if (/^(DECIMAL|NUMERIC)/.test(sqlType)) prismaType = 'Decimal';
  else if (/^(DOUBLE PRECISION|REAL|FLOAT)/.test(sqlType)) prismaType = 'Float';
  else if (/^(INTEGER|INT|SERIAL|BIGINT)/.test(sqlType)) prismaType = 'Int';
  else if (/^(BOOLEAN)/.test(sqlType)) prismaType = 'Boolean';
  else if (/^"?\w+"?$/.test(sqlType)) {
    const enumName = sqlType.replace(/"/g, '');
    if (existingEnums.has(enumName) || sql.includes(`CREATE TYPE "${enumName}"`)) prismaType = enumName;
    else prismaType = 'String';
  }
  let fieldLine = `  ${field} ${prismaType}`;
  const isNotNull = /NOT NULL/.test(rest);
  const hasPrimary = /PRIMARY KEY/.test(rest);
  const hasUnique = /UNIQUE/.test(rest);
  if (!hasPrimary && !isNotNull) fieldLine += '?';
  const attrs = [];
  if (hasPrimary) attrs.push('@id');
  if (hasUnique && !hasPrimary) attrs.push('@unique');
  if (/DEFAULT CURRENT_TIMESTAMP/.test(rest)) attrs.push('@default(now())');
  if (/DEFAULT true/.test(rest)) attrs.push('@default(true)');
  if (/DEFAULT false/.test(rest)) attrs.push('@default(false)');
  const defaultMatch = rest.match(/DEFAULT\s+'([^']+)'/);
  if (defaultMatch) {
    const defaultValue = defaultMatch[1];
    if (prismaType === 'String') attrs.push(`@default("${defaultValue}")`);
    else if (prismaType === 'DateTime' && defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP') attrs.push('@default(now())');
    else attrs.push(`@default(${defaultValue})`);
  }
  const decimalMatch = sqlType.match(/DECIMAL\((\d+),(\d+)\)/i) || sqlType.match(/NUMERIC\((\d+),(\d+)\)/i);
  if (decimalMatch && prismaType === 'Decimal') attrs.push(`@db.Decimal(${decimalMatch[1]},${decimalMatch[2]})`);
  if (attrs.length) fieldLine += ' ' + attrs.join(' ');
  return fieldLine;
}

function extractEnums() {
  const lines = sql.split(/\r?\n/);
  return lines
    .map(parseEnum)
    .filter(Boolean)
    .filter(e => !existingEnums.has(e.name));
}

function extractTable(name) {
  const re = new RegExp(`CREATE TABLE "${name}"([\\s\\S]*?)(?=CREATE TABLE|$)`, 'm');
  const match = sql.match(re);
  if (!match) return null;
  const lines = match[0].split(/\r?\n/).slice(1).filter(l => l.trim() && !l.trim().startsWith('CREATE INDEX') && !l.trim().startsWith('FOREIGN KEY') && !l.trim().startsWith(')') && !l.trim().startsWith('--'));
  return lines.map(line => parseColumn(line)).filter(Boolean);
}

function sqlTableNames() {
  const tableNames = [];
  const re = /^CREATE TABLE "([^"]+)"/gm;
  let m;
  while ((m = re.exec(sql)) !== null) {
    tableNames.push(m[1]);
  }
  return tableNames;
}

const allSqlTables = sqlTableNames();
const missingTables = allSqlTables
  .map((t) => {
    const name = t.split('_').map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))).join('');
    return { table: t, model: name };
  })
  .filter(({ model }) => !existingModels.has(model));

const newEnums = extractEnums();

const modelText = missingTables.map(({ table, model }) => {
  const columns = extractTable(table);
  if (!columns.length) return null;
  return `model ${model} {
${columns.join('\n')}

  @@map("${table}")
}`;
}).filter(Boolean);

let appended = '';
if (newEnums.length) {
  appended += newEnums.map((e) => `enum ${e.name} {
${e.values.map((v) => `  ${v}`).join('\n')}
}
`).join('\n');
}
if (modelText.length) {
  appended += modelText.join('\n\n') + '\n';
}

if (!appended) {
  console.log('Nothing to append.');
  process.exit(0);
}
fs.appendFileSync(schemaPath, '\n' + appended);
console.log(`Appended ${newEnums.length} enums and ${modelText.length} models to prisma/schema.prisma`);
