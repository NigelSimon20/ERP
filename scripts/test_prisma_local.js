process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ravenshield';
const {PrismaClient} = require('@prisma/client');
(async ()=> {
  const p = new PrismaClient();
  try {
    const c = await p.company.count();
    console.log('companies:', c);
  } catch(e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();