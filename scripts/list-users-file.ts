import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true
      }
    });
    fs.writeFileSync('users_list_debug.json', JSON.stringify(users, null, 2), 'utf8');
    console.log('User list written to users_list_debug.json');
  } catch (error) {
    fs.writeFileSync('users_list_debug.json', JSON.stringify({ error: error.message }, null, 2), 'utf8');
  } finally {
    await prisma.$disconnect();
  }
}

main();
