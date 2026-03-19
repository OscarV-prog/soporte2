import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
  const r = await p.oscar_prueba.findMany({ take: 5 });
  console.log(JSON.stringify(r, null, 2));
  await p.$disconnect();
}
run();
