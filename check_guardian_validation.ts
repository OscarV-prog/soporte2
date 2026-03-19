
import { GuardianValidator } from './libs/guardian-core/src/lib/policy/guardian-validator';
import { PrismaMetadataResolver } from './apps/quetzaltic-api/src/app/database/resolvers/prisma-metadata.resolver';
import { PrismaResourcePolicyResolver } from './apps/quetzaltic-api/src/app/database/resolvers/prisma-resource-policy.resolver';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './apps/quetzaltic-api/src/app/database/prisma.service';

// Mocking some dependencies since we are running in a standalone script
const prisma = new PrismaClient();
const prismaService = prisma as any;
const metadataResolver = new PrismaMetadataResolver(prismaService);
const resourcePolicyResolver = new PrismaResourcePolicyResolver(prismaService);

async function main() {
    const sql = `
        SELECT * FROM oscar_prueba
        WHERE id_Empresa = 1
        AND id_Sucursal = 3
        AND id_Almacen = 1;
    `;

    console.log('Validating SQL with Guardian...');
    try {
        const validatedQuery = await GuardianValidator.validate(sql, {
            metadataResolver,
            resourcePolicyResolver,
        });
        console.log('Validated Query Result:', JSON.stringify(validatedQuery, null, 2));
    } catch (error) {
        console.error('Guardian validation error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
