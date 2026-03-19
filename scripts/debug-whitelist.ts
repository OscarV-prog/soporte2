import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('--- Whitelist Table Content ---');
        const content = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM guardian_whitelist');
        console.log(JSON.stringify(content, null, 2));

        console.log('--- Checking for oscar_prueba exactly ---');
        const match = await prisma.$queryRawUnsafe<any[]>(
            "SELECT COUNT(*) as count FROM guardian_whitelist WHERE LOWER(schema_name) = 'dbo' AND LOWER(table_name) = 'oscar_prueba'"
        );
        console.log('Match count:', match[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
