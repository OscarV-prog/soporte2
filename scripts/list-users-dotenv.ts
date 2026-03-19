import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });
    fs.writeFileSync('users_list_final.json', JSON.stringify(users, null, 2), 'utf8');
    console.log('SUCCESS: Written users_list_final.json');
  } catch (error) {
    fs.writeFileSync('users_list_final.json', JSON.stringify({ error: error.message }, null, 2), 'utf8');
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
