import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('--- Database Metadata Debug ---');
        const tables = await prisma.$queryRawUnsafe<any[]>(
            "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%oscar%'"
        );
        console.log('Tables found:', JSON.stringify(tables, null, 2));

        if (tables.length > 0) {
            const table = tables[0].TABLE_NAME;
            const schema = tables[0].TABLE_SCHEMA;
            console.log(`Checking PKs for ${schema}.${table}...`);
            
            const pks = await prisma.$queryRawUnsafe<any[]>(`
                SELECT col.name AS COLUMN_NAME, s.name as SCHEMA_NAME, t.name as TABLE_NAME
                FROM sys.indexes i
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE i.is_primary_key = 1
                AND t.name LIKE '%oscar%'
            `);
            console.log('PK Columns found:', JSON.stringify(pks, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
