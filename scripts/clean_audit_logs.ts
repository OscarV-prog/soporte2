import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('Cleaning Audit Logs for table: oscar_prueba...');
        
        // Count before
        const countBefore = await prisma.auditEvent.count({
            where: {
                tableName: 'oscar_prueba'
            }
        });
        console.log(`Found ${countBefore} records to delete.`);

        if (countBefore === 0) {
            console.log('No records found. Nothing to do.');
            return;
        }

        // Delete
        const result = await prisma.auditEvent.deleteMany({
            where: {
                tableName: 'oscar_prueba'
            }
        });

        console.log(`Successfully deleted ${result.count} audit events.`);

        // Reset stats or other info if necessary? 
        // The stats are calculated on the fly, so this should reflect immediately.

    } catch (e) {
        console.error('Error during cleanup:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
