import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { TransactionModule } from '../transaction/transaction.module';

import { AuditStoreModule } from '../audit/audit-store.module';

@Module({
    imports: [TransactionModule, AuditStoreModule],
    controllers: [OperationsController],
})
export class OperationsModule { }
