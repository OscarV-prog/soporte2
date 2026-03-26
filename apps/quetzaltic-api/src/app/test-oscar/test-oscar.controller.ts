import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller('test-oscar')
export class TestOscarController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getTestData() {
    const items = await this.prisma.oscarPrueba.findMany({
      take: 100,
      orderBy: { id_Almacen: 'asc' },
    });

    try {
      // Resolución de Metadatos (Nombres de Sucursal y Empresa)
      const sucursales: any[] = await this.prisma.$queryRawUnsafe(`SELECT id_Sucursal, nb_Sucursal FROM Sucursales`);
      const empresas: any[] = await this.prisma.$queryRawUnsafe(`SELECT id_Empresa, nb_Empresa FROM Empresas`);

      const sucursalMap = new Map(sucursales.map(s => [s.id_Sucursal, s.nb_Sucursal]));
      const empresaMap = new Map(empresas.map(e => [e.id_Empresa, e.nb_Empresa]));

      return items.map(item => ({
        ...item,
        nb_Sucursal: sucursalMap.get(item.id_Sucursal) || `Sucursal ${item.id_Sucursal}`,
        nb_Empresa: empresaMap.get(item.id_Empresa) || `Empresa ${item.id_Empresa}`
      }));
    } catch (e) {
      // Fallback si las tablas no existen o fallan
      return items;
    }
  }
}
