import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { id: '18408b9f-a7fe-4c18-9870-8121fc81cbe8' }
    });
    console.log('USER_FOUND:', JSON.stringify(user));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
