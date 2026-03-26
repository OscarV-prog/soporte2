import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing findFirst on demo_records...');
    const record = await prisma.demoRecord.findFirst();
    console.log('Record found:', record);
    
    console.log('Testing findFirst on audit_events...');
    const event = await prisma.auditEvent.findFirst();
    console.log('Event found:', event);
  } catch (error) {
    console.error('Error in Prisma call:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
