import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('Attempting to add PK to oscar_prueba...');
        // Verificamos si ya tiene PK para evitar error
        const pks = await prisma.$queryRawUnsafe<any[]>(`
            SELECT name FROM sys.indexes 
            WHERE object_id = OBJECT_ID('oscar_prueba') AND is_primary_key = 1
        `);

        if (pks.length === 0) {
            await prisma.$executeRawUnsafe(
                'ALTER TABLE oscar_prueba ADD CONSTRAINT PK_oscar_prueba PRIMARY KEY (id_Empresa, id_Sucursal, id_Almacen)'
            );
            console.log('[OK] PK constraint added to oscar_prueba.');
        } else {
            console.log('[INFO] Table oscar_prueba already has a Primary Key.');
        }
    } catch (e) {
        console.error('[ERROR] Failed to add PK:', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
