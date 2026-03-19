
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('🚀 Probando conexión a la base de datos de Petroil...');
    await prisma.$connect();
    console.log('✅ Conexión exitosa.');

    console.log('🔍 Leyendo los primeros 5 registros de la tabla "oscar_prueba":');
    const data = await prisma.oscarPrueba.findMany({
      take: 5,
    });

    if (data.length === 0) {
      console.log('ℹ️ La tabla está conectada pero parece estar vacía.');
    } else {
      console.table(data);
      console.log(`\n🎉 ¡Éxito! Se recuperaron ${data.length} registros.`);
    }

  } catch (error: any) {
    console.error('❌ Error en la prueba:');
    console.error(error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
