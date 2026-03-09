import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditStoreService } from '../audit/audit-store.service';

@Injectable()
export class LockdownService {
    private readonly logger = new Logger(LockdownService.name);
    private readonly CONFIG_KEY = 'LOCKDOWN_ACTIVE';

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditStore: AuditStoreService
    ) { }

    private virtualLockdown = false;

    async isActive(): Promise<boolean> {
        try {
            const config = await this.prisma.systemConfig.findUnique({
                where: { key: this.CONFIG_KEY },
            });
            return config?.value === 'true';
        } catch (e) {
            this.logger.warn('Prisma failure, falling back to Virtual Lockdown state');
            return this.virtualLockdown;
        }
    }

    async setLockdown(active: boolean, actor: string, correlationId: string): Promise<void> {
        const value = active ? 'true' : 'false';

        try {
            await this.prisma.systemConfig.upsert({
                where: { key: this.CONFIG_KEY },
                update: { value },
                create: { key: this.CONFIG_KEY, value },
            });

            // Registrar en auditoría
            await this.auditStore.create({
                correlationId,
                actor,
                type: 'SYSTEM_LOCKDOWN',
                tableName: 'system_configs',
                primaryKeyColumn: 'key',
                primaryKeyValue: this.CONFIG_KEY,
                snapshotBefore: { active: !active },
                snapshotAfter: { active: active },
                status: 'SUCCESS',
            });
        } catch (e) {
            this.logger.warn('Prisma failure, applying Virtual Lockdown state');
            this.virtualLockdown = active;
        }

        this.logger.warn(`GLOBAL LOCKDOWN ${active ? 'ACTIVATED' : 'DEACTIVATED'} by ${actor}`);
    }
}
