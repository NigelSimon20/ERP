process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ravenshield';
const {PrismaClient} = require('@prisma/client');
(async ()=>{
  const p = new PrismaClient();
  try{
    const u = await p.user.findFirst({select:{id:true,email:true,name:true,role:true}})
    console.log(u? JSON.stringify(u,null,2):'no user')
  }catch(e){console.error(e)}finally{await p.$disconnect()}
})();