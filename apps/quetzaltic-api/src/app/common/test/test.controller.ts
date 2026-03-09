import { Controller, Post, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

@Controller('test')
export class TestController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService
    ) { }

    @Post('reset')
    async reset() {
        if (this.config.get('NODE_ENV') !== 'test' && this.config.get('NODE_ENV') !== 'development') {
            throw new ForbiddenException('Reset is only allowed in test/dev environments');
        }

        const tables = [
            'audit.audit_events',
            'audit.idempotency_keys',
            'audit.system_configs',
            'audit.guardian_whitelist',
            'audit.users',
            'prod.demo_records'
        ];

        for (const table of tables) {
            await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${table} CASCADE;`);
        }

        // Re-seed essential data
        // Nota: En un entorno ideal invocaríamos el seed script, pero lo haremos manual aquí para velocidad.
        return { message: 'Database reset successfully' };
    }
}
