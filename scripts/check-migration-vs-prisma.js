const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

const tableRegex = /^CREATE TABLE "([^"]+)"\s*\(([^]*?)\);$/gim;
const tables = {};
let m;
while ((m = tableRegex.exec(sql)) !== null) {
  const name = m[1];
  const body = m[2];
  const cols = body.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('--') && !line.startsWith('FOREIGN KEY') && !line.startsWith('CREATE INDEX'))
    .map((line) => {
      const colMatch = line.match(/^"([^"]+)"\s+([^\s,]+)/);
      return colMatch ? colMatch[1] : null;
    })
    .filter(Boolean);
  tables[name] = cols;
}

const modelRegex = /model\s+(\w+)\s+\{([^]*?)\n\}/g;
const models = {};
while ((m = modelRegex.exec(schema)) !== null) {
  const model = m[1];
  const body = m[2];
  const fields = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@') && !line.startsWith('///'))
    .map((line) => {
      const fieldMatch = line.match(/^([A-Za-z0-9_]+)\s+/);
      return fieldMatch ? fieldMatch[1] : null;
    })
    .filter(Boolean);
  models[model] = fields;
}

const mapModel = (name) => {
  return name.split('_').map((part, idx, arr) => {
    if (idx === arr.length - 1) {
      if (part.endsWith('ies')) return part.slice(0, -3) + 'y';
      if (part.endsWith('s')) return part.slice(0, -1);
    }
    return part;
  }).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
};

let missingTables = 0;
let missingModels = 0;
let missingFields = 0;
let mismatchDetails = [];
for (const tableName of Object.keys(tables)) {
  const modelName = mapModel(tableName);
  if (!models[modelName]) {
    missingModels++;
    mismatchDetails.push({table: tableName, model: modelName, issue: 'missing model'});
    continue;
  }
  const modelFields = new Set(models[modelName]);
  const tableCols = tables[tableName];
  for (const col of tableCols) {
    if (!modelFields.has(col) && col !== 'updatedAt' && col !== 'createdAt') {
      missingFields++;
      mismatchDetails.push({table: tableName, column: col, model: modelName, issue: 'missing field'});
    }
  }
}
console.log('tables', Object.keys(tables).length, 'models', Object.keys(models).length);
console.log('missingModels', missingModels, 'missingFields', missingFields);
console.log('details', mismatchDetails.slice(0, 100));
