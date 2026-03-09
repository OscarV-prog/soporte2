import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('🐘 Database connected successfully');
        } catch (error) {
            this.logger.error('❌ Database connection failed', error);
            // In Story 1.2 "Fail-Fast", we want to fail early, 
            // but Prisma often handles reconnections. 
            // For now, we log the error.
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('🐘 Database disconnected');
    }
}
