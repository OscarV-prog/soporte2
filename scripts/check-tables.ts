import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for tables containing Empresa, Sucursal, Almacen...");
    const result = await prisma.$queryRawUnsafe(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME LIKE '%Empresa%' 
           OR TABLE_NAME LIKE '%Sucursal%' 
           OR TABLE_NAME LIKE '%Almacen%'
    `);
    console.log(JSON.stringify(result, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
