process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ravenshield';
const {PrismaClient} = require('@prisma/client');
(async ()=>{
  const p = new PrismaClient();
  try{
    const c = await p.customer.findFirst({select:{id:true,company_name:true}})
    console.log(c? JSON.stringify(c,null,2):'no customer')
  }catch(e){console.error(e)}finally{await p.$disconnect()}
})();