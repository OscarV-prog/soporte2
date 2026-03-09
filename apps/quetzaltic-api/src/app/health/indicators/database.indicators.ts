import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';

import { HealthStateService } from '../health-state.service';

@Injectable()
export class ProdDbHealthIndicator extends HealthIndicator {
    constructor(
        private readonly prisma: PrismaService,
        private readonly state: HealthStateService,
    ) {
        super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            this.state.setProdDbStatus(true);
            return this.getStatus(key, true);
        } catch (error: any) {
            this.state.setProdDbStatus(false);
            const result = this.getStatus(key, false, { message: error.message });
            throw new HealthCheckError('ProdDB Check failed', result);
        }
    }
}

@Injectable()
export class AuditDbHealthIndicator extends HealthIndicator {
    constructor(
        private readonly prisma: PrismaService,
        private readonly state: HealthStateService,
    ) {
        super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            this.state.setAuditDbStatus(true);
            return this.getStatus(key, true);
        } catch (error: any) {
            this.state.setAuditDbStatus(false);
            const result = this.getStatus(key, false, { message: error.message });
            throw new HealthCheckError('AuditDB Check failed', result);
        }
    }
}
