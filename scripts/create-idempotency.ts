import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
    try {
        await p.$executeRawUnsafe(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='idempotency_keys' AND xtype='U')
            CREATE TABLE dbo.idempotency_keys (
                id             NVARCHAR(255) PRIMARY KEY,
                idempotency_key NVARCHAR(255) UNIQUE NOT NULL,
                correlation_id  NVARCHAR(255) NOT NULL,
                request_hash    NVARCHAR(255) NOT NULL,
                status         NVARCHAR(50)  NOT NULL,
                response_body   NVARCHAR(MAX) NULL,
                created_at      DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('[SUCCESS] Created idempotency_keys table.');
    } catch (e) {
        console.error('[FAILED] Could not create table:', e);
    } finally {
        await p.$disconnect();
    }
}

main();
