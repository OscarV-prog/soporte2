import { Prisma } from '@prisma/client';

async function main() {
    try {
        console.log('OscarPrueba Scalar Fields:');
        console.log(Object.keys(Prisma.OscarPruebaScalarFieldEnum));
        
        console.log('\nSample WhereInput keys? (if possible to inspect type)');
        // This is harder at runtime, but we can check the Enum which usually matches
    } catch (e) {
        console.error(e);
    }
}

main();
