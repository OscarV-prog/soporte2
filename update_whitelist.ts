
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    console.log('Listing current GuardianWhitelist entries...');
    try {
        const schema = 'dbo';
        const table = 'oscar_prueba';
        
        console.log(`Checking if ${schema}.${table} is already whitelisted...`);
        const existing: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM guardian_whitelist WHERE schema_name = '${schema}' AND table_name = '${table}' AND column_name IS NULL`
        );

        if (existing && existing.length > 0) {
            console.log('Record already exists in whitelist.');
        } else {
            console.log('Inserting into whitelist via raw SQL...');
            await prisma.$executeRawUnsafe(
                `INSERT INTO guardian_whitelist (id, schema_name, table_name, column_name, is_editable, created_at) 
                 VALUES ('${crypto.randomUUID()}', '${schema}', '${table}', NULL, 1, GETDATE())`
            );
            console.log('Successfully added to whitelist.');
        }
    } catch (error) {
        console.error('Error updating whitelist:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
