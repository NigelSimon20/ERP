const fs = require('fs');
const path = require('path');
const { parse } = require('pgsql-ast-parser');
const file = path.join(__dirname, '..', 'prisma', 'migrations', '20260624000000_init', 'migration.sql');
const sql = fs.readFileSync(file, 'utf8');
try {
  const ast = parse(sql);
  console.log('parsed statements:', ast.length);
} catch (error) {
  console.error('parse error:');
  console.error(error.message);
  if (error.location) {
    console.error('location:', error.location);
  }
  process.exit(1);
}
