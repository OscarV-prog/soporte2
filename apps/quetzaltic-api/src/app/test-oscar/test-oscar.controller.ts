import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller('test-oscar')
export class TestOscarController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getTestData() {
    return await this.prisma.oscarPrueba.findMany({
      take: 5,
    });
  }
}
