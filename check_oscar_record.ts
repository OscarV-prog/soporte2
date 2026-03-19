
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for record in oscar_prueba...');
    try {
        const record = await prisma.oscarPrueba.findUnique({
            where: {
                id_Empresa_id_Sucursal_id_Almacen: {
                    id_Empresa: 1,
                    id_Sucursal: 3,
                    id_Almacen: 1
                }
            }
        });
        console.log('Record found:', record);
        
        const allRecords = await prisma.oscarPrueba.findMany({
            take: 5
        });
        console.log('Sample records:', allRecords);
        
    } catch (error) {
        console.error('Error querying oscar_prueba:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
