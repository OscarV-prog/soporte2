import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { ProdDbHealthIndicator, AuditDbHealthIndicator } from './indicators/database.indicators';

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private prodDbIndicator: ProdDbHealthIndicator,
        private auditDbIndicator: AuditDbHealthIndicator,
    ) { }

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            () => this.prodDbIndicator.isHealthy('production_database'),
            () => this.auditDbIndicator.isHealthy('audit_database'),
        ]);
    }
}
