import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const p = new PrismaClient();
const found: string[] = [];

async function probe(table: string) {
  try {
    const res: any = await p.$queryRawUnsafe(`SELECT TOP 1 * FROM ${table}`);
    found.push(`[SUCCESS] Table ${table} exists. Columns: ` + (res.length > 0 ? Object.keys(res[0]).join(', ') : 'Empty'));
  } catch(e) { }
}
async function main() {
  await probe('Empresa'); await probe('cat_Empresa'); await probe('Empresas');
  await probe('Sucursal'); await probe('cat_Sucursal'); await probe('Sucursales');
  await probe('Almacen'); await probe('cat_Almacen'); await probe('Almacenes');
  
  fs.writeFileSync('tables_found.txt', found.join('\n'));
}
main().finally(()=>p.$disconnect());
