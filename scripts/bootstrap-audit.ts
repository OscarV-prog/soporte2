import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    console.log('--- Bootstraping Audit Infrastructure ---');

    try {
        // 1. Crear audit_events si no existe
        await prisma.$executeRaw`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_events')
            CREATE TABLE audit_events (
                id NVARCHAR(36) PRIMARY KEY,
                correlation_id NVARCHAR(MAX) NOT NULL,
                ticket_id NVARCHAR(MAX),
                actor NVARCHAR(MAX) NOT NULL,
                type NVARCHAR(50) DEFAULT 'OPERATION',
                table_name NVARCHAR(MAX) NOT NULL,
                primary_key_column NVARCHAR(MAX) NOT NULL,
                primary_key_value NVARCHAR(MAX) NOT NULL,
                snapshot_before NVARCHAR(MAX) NOT NULL,
                snapshot_after NVARCHAR(MAX),
                status NVARCHAR(50),
                reverted_by_event_id NVARCHAR(36),
                executed_at DATETIME2 DEFAULT GETDATE()
            );
        `;
        console.log('[OK] audit_events table verified/created.');

        // 2. Crear guardian_whitelist si no existe
        await prisma.$executeRaw`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'guardian_whitelist')
            CREATE TABLE guardian_whitelist (
                id NVARCHAR(36) PRIMARY KEY,
                schema_name NVARCHAR(100) NOT NULL,
                table_name NVARCHAR(100) NOT NULL,
                column_name NVARCHAR(100),
                is_editable BIT DEFAULT 1,
                created_at DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT UQ_Whitelist UNIQUE (schema_name, table_name, column_name)
            );
        `;
        console.log('[OK] guardian_whitelist table verified/created.');

        // 3. Whitelisting automático para oscar_prueba
        await prisma.$executeRaw`
            IF NOT EXISTS (SELECT * FROM guardian_whitelist WHERE table_name = 'oscar_prueba')
            INSERT INTO guardian_whitelist (id, schema_name, table_name, is_editable)
            VALUES (NEWID(), 'dbo', 'oscar_prueba', 1);
        `;
        console.log('[OK] oscar_prueba added to whitelist.');

        // 4. Crear demo_records si no existe (para el HealthCheck)
        await prisma.$executeRaw`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'demo_records')
            CREATE TABLE demo_records (
                id NVARCHAR(36) PRIMARY KEY,
                name NVARCHAR(MAX) NOT NULL,
                value NVARCHAR(MAX) NOT NULL,
                is_active BIT DEFAULT 1,
                updated_at DATETIME2 DEFAULT GETDATE()
            );
        `;
        console.log('[OK] demo_records table verified/created.');

    } catch (error) {
        console.error('[ERROR] Bootstrapping failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
