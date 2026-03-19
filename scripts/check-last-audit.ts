import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const lastLogs = await prisma.auditEvent.findMany({
      take: 5,
      orderBy: { executedAt: 'desc' },
      select: {
        id: true,
        actor: true,
        tableName: true,
        type: true,
        executedAt: true
      }
    });
    console.log('--- Last Audit Logs ---');
    console.log(JSON.stringify(lastLogs, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
