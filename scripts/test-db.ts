import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Testing Raw SQL connectivity...');
    try {
        const result = await prisma.$queryRaw`SELECT 1 as test`;
        console.log('✅ Raw SQL success:', result);

        try {
            const count = await prisma.$queryRaw`SELECT count(*) FROM audit.users`;
            console.log('✅ Users count (raw):', count);
        } catch (e2: any) {
            console.error('❌ Table select failure:', e2.message);
        }
    } catch (e: any) {
        console.error('❌ Raw SQL failure:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
