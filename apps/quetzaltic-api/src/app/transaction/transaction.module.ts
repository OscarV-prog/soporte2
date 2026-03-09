import { Module } from '@nestjs/common';
import { TransactionOrchestratorService } from './transaction-orchestrator.service';
import { IdempotencyService } from './idempotency.service';
import { DatabaseModule } from '../database/database.module';
import { AuditStoreModule } from '../audit/audit-store.module';

@Module({
    imports: [DatabaseModule, AuditStoreModule],
    providers: [TransactionOrchestratorService, IdempotencyService],
    exports: [TransactionOrchestratorService, IdempotencyService],
})
export class TransactionModule { }
