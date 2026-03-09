import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

async function main() {
    console.log('🚀 Starting Production-Grade Seeding...');

    // 1. Cleanup old demo data (Limited)
    console.log('🧹 Cleaning up records...');
    try {
        await prisma.demoRecord.deleteMany({});
        console.log('✅ Demo records cleared.');
    } catch (e) {
        console.warn('⚠️ Cleanup skipped:', e);
    }

    // 2. High-Fidelity Users
    const roles = [
        { email: 'admin@quetzaltic.com', role: 'ADMIN', pass: 'admin_secret_2026' },
        { email: 'operator-alpha@quetzaltic.com', role: 'OPERATOR', pass: 'operator_secret_2026' },
        { email: 'compliance-officer@quetzaltic.com', role: 'ADMIN', pass: 'compliance_2026' }
    ];

    for (const u of roles) {
        await prisma.user.upsert({
            where: { email: u.email },
            update: { role: u.role },
            create: {
                email: u.email,
                passwordHash: hashPassword(u.pass),
                role: u.role,
            },
        });
    }

    // 3. Realistic Production Records
    const pRecords = [
        { name: 'Core User Database', value: 'Cluster-Active', isActive: true },
        { name: 'Transaction Ledger B', value: 'Read-Only', isActive: true },
        { name: 'Global Session Store', value: 'Replicating', isActive: true },
        { name: 'Inventory Cache XL', value: 'Degraded', isActive: true },
        { name: 'Analytics Data Lake', value: 'Standby', isActive: true }
    ];

    for (const rec of pRecords) {
        await prisma.demoRecord.create({
            data: {
                name: rec.name,
                value: rec.value,
                isActive: rec.isActive,
            }
        });
    }

    // 4. Advanced Audit Logs (50+ entries)
    const tables = ['users', 'orders', 'inventory', 'pricing_rules', 'api_keys'];
    const actors = ['admin@quetzaltic.com', 'operator-alpha@quetzaltic.com', 'system-auto-proc'];
    const ticketPrefixes = ['SEC-REQ', 'FIX-ISSUE', 'CORP-CHANGE', 'DEVOPS'];

    for (let i = 0; i < 60; i++) {
        const table = tables[Math.floor(Math.random() * tables.length)];
        const actor = actors[Math.floor(Math.random() * actors.length)];
        const ticketId = `${ticketPrefixes[Math.floor(Math.random() * ticketPrefixes.length)]}-${1000 + i}`;

        await prisma.auditEvent.create({
            data: {
                correlationId: `rel_${Math.random().toString(36).substring(7)}`,
                ticketId: ticketId,
                actor: actor,
                type: Math.random() > 0.8 ? 'POLICY_CHANGE' : 'OPERATION',
                tableName: table,
                primaryKeyColumn: 'id',
                primaryKeyValue: `uuid-${1000 + i}`,
                snapshotBefore: { status: 'old_value', level: i },
                snapshotAfter: { status: 'updated_value', level: i + 1 },
                status: 'SUCCESS',
                executedAt: new Date(Date.now() - (i * 3600000)) // Hourly spread
            }
        });
    }

    console.log('✅ Production Seeding Completed. 60+ Realistic events created.');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
