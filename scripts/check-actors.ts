import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true
      }
    });
    console.log('--- Users ---');
    console.log(JSON.stringify(users, null, 2));
    
    const lastLogs = await prisma.auditEvent.findMany({
      take: 5,
      orderBy: { executedAt: 'desc' },
      select: {
        id: true,
        actor: true,
        executedAt: true
      }
    });
    console.log('\n--- Last Audit Logs ---');
    console.log(JSON.stringify(lastLogs, null, 2));

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
