import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { LockdownService } from './lockdown.service';
import { WhitelistService } from './whitelist.service';
import { AuditStoreModule } from '../audit/audit-store.module';

@Module({
    imports: [AuditStoreModule],
    controllers: [GovernanceController],
    providers: [LockdownService, WhitelistService],
    exports: [LockdownService],
})
export class GovernanceModule { }
