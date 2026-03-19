import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { id: '18408b9f-a7fe-4c18-9870-8121fc81cbe8' }
    });
    const result = {
        found: !!user,
        email: user?.email,
        id: user?.id
    };
    fs.writeFileSync('actor_debug_result.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Result written to actor_debug_result.json');
  } catch (error) {
    fs.writeFileSync('actor_debug_result.json', JSON.stringify({ error: error.message }, null, 2), 'utf8');
  } finally {
    await prisma.$disconnect();
  }
}

main();
