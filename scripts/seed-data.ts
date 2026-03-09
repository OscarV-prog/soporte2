import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Usuarios RBAC
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin_secret_2026';
    const operatorPassword = process.env.OPERATOR_PASSWORD || 'operator_secret_2026';

    await prisma.user.upsert({
        where: { email: 'admin@quetzaltic.com' },
        update: {},
        create: {
            email: 'admin@quetzaltic.com',
            passwordHash: hashPassword(adminPassword),
            role: 'ADMIN',
        },
    });

    await prisma.user.upsert({
        where: { email: 'operator@quetzaltic.com' },
        update: {},
        create: {
            email: 'operator@quetzaltic.com',
            passwordHash: hashPassword(operatorPassword),
            role: 'OPERATOR',
        },
    });

    // 2. Registros Demo
    await prisma.demoRecord.upsert({
        where: { id: 'demo-1' },
        update: {},
        create: {
            id: 'demo-1',
            name: 'Production Server A',
            value: 'Healthy',
            isActive: true,
        },
    });

    await prisma.demoRecord.upsert({
        where: { id: 'demo-2' },
        update: {},
        create: {
            id: 'demo-2',
            name: 'Staging Database',
            value: 'Standby',
            isActive: true,
        },
    });

    // 3. Base Whitelist
    const whitelistEntries = [
        { schemaName: 'prod', tableName: 'demo_records', columnName: null, isEditable: true },
        { schemaName: 'audit', tableName: 'system_configs', columnName: null, isEditable: true },
        { schemaName: 'audit', tableName: 'guardian_whitelist', columnName: null, isEditable: true },
    ];

    for (const entry of whitelistEntries) {
        await prisma.guardianWhitelist.upsert({
            where: {
                schemaName_tableName_columnName: {
                    schemaName: entry.schemaName,
                    tableName: entry.tableName,
                    columnName: entry.columnName,
                },
            },
            update: { isEditable: entry.isEditable },
            create: entry,
        });
    }

    // 4. System Config inicial
    await prisma.systemConfig.upsert({
        where: { key: 'LOCKDOWN_ACTIVE' },
        update: {},
        create: {
            key: 'LOCKDOWN_ACTIVE',
            value: 'false',
        },
    });

    console.log('✅ Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
