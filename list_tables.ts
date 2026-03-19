import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const targetTables = ['users', 'audit_events', 'guardian_whitelist', 'system_configs', 'idempotency_keys', 'demo_records', 'oscar_prueba'];
    console.log('Searching for target tables...');
    const tables: any[] = await prisma.$queryRaw`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME IN (${Prisma.join(targetTables)})
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    console.log('Tables found:');
    tables.forEach(t => console.log(`${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));
  } catch (error) {
    console.error('Error listing tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
