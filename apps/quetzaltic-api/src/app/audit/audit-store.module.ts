import { Module } from '@nestjs/common';
import { AuditStoreService } from './audit-store.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    providers: [AuditStoreService],
    exports: [AuditStoreService],
})
export class AuditStoreModule { }
