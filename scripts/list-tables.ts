
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected. Listing tables...');
    
    // Query to list tables in SQL Server
    const tables: any[] = await prisma.$queryRaw`
      SELECT SCHEMA_NAME(schema_id) AS schema_name, name AS table_name
      FROM sys.tables
    `;
    
    console.log('Tables found:');
    console.table(tables);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
