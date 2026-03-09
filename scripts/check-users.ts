
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const users = await prisma.user.findMany();
        console.log('Current Users in Database:');
        console.table(users.map(u => ({ id: u.id, email: u.email, role: u.role })));
    } catch (e) {
        console.error('Error fetching users:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
