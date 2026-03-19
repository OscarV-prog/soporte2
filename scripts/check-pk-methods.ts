import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const schema = 'dbo';
        const table = 'oscar_prueba';
        
        console.log(`Testing PK discovery for ${schema}.${table}...`);

        // Test Query 1: INFORMATION_SCHEMA (Old way)
        const res1 = await prisma.$queryRawUnsafe<any[]>(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
            AND TABLE_SCHEMA = @p1
            AND TABLE_NAME = @p2
        `, schema, table);
        console.log('INFORMATION_SCHEMA result:', res1);

        // Test Query 2: sys.indexes (My current way)
        const res2 = await prisma.$queryRawUnsafe<any[]>(`
            SELECT col.name AS COLUMN_NAME
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE i.is_primary_key = 1
            AND s.name = @p1
            AND t.name = @p2
            ORDER BY ic.key_ordinal;
        `, schema, table);
        console.log('sys.indexes result:', res2);

        // Test Query 3: Minimal OBJECT_ID (Alternative)
        const res3 = await prisma.$queryRawUnsafe<any[]>(`
            SELECT col.name AS COLUMN_NAME
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
            WHERE i.is_primary_key = 1
            AND i.object_id = OBJECT_ID(@p1)
            ORDER BY ic.key_ordinal;
        `, `${schema}.${table}`);
        console.log('OBJECT_ID result:', res3);

        if (res1.length === 0 && res2.length === 0 && res3.length === 0) {
            console.log('WARNING: No primary key found by any method!');
            // Check if table exists at all
            const exists = await prisma.$queryRawUnsafe<any[]>(`
                SELECT OBJECT_ID(@p1) as id
            `, `${schema}.${table}`);
            console.log('Table OBJECT_ID:', exists);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
