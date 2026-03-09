import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ProdDbHealthIndicator, AuditDbHealthIndicator } from './indicators/database.indicators';
import { DatabaseModule } from '../database/database.module';

import { HealthStateService } from './health-state.service';

@Module({
    imports: [TerminusModule, DatabaseModule],
    controllers: [HealthController],
    providers: [ProdDbHealthIndicator, AuditDbHealthIndicator, HealthStateService],
    exports: [AuditDbHealthIndicator, HealthStateService],
})
export class HealthModule { }
