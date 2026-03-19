
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function main() {
  const prisma = new PrismaClient();
  try {
    const columns: any[] = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'oscar_prueba' AND TABLE_SCHEMA = 'dbo'
    `;
    
    fs.writeFileSync('scripts/oscar_prueba_columns.json', JSON.stringify(columns, null, 2));
    console.log('Columns saved to scripts/oscar_prueba_columns.json');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
