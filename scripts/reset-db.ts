import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Resetting database...');

    // El orden importa por las FKs si las hubiera, aunque aquí usamos modelos aislados mayormente.
    // Truncamos las tablas de los esquemas prod y audit.

    const tables = [
        'audit.audit_events',
        'audit.idempotency_keys',
        'audit.system_configs',
        'audit.guardian_whitelist',
        'audit.users',
        'prod.demo_records'
    ];

    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${table} CASCADE;`);
        } catch (e) {
            console.warn(`Could not truncate ${table}:`, e.message);
        }
    }

    console.log('✨ Database reset complete.');
}

main()
    .catch((e) => {
        console.error('❌ Reset failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
