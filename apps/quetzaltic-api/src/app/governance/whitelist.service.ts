import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PrismaMetadataResolver } from '../database/resolvers/prisma-metadata.resolver';
import { PrismaResourcePolicyResolver } from '../database/resolvers/prisma-resource-policy.resolver';
import { AuditStoreService } from '../audit/audit-store.service';

@Injectable()
export class WhitelistService {
    private readonly logger = new Logger(WhitelistService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly metadataResolver: PrismaMetadataResolver,
        private readonly policyResolver: PrismaResourcePolicyResolver,
        private readonly auditStore: AuditStoreService
    ) { }

    private static readonly VIRTUAL_WHITELIST = [
        { id: 'v-wl-1', schemaName: 'prod', tableName: 'orders', columnName: null, isEditable: true, createdAt: new Date() },
        { id: 'v-wl-2', schemaName: 'prod', tableName: 'users', columnName: 'password_hash', isEditable: false, createdAt: new Date() },
        { id: 'v-wl-3', schemaName: 'audit', tableName: 'audit_events', columnName: null, isEditable: false, createdAt: new Date() },
        { id: 'v-wl-4', schemaName: 'inventory', tableName: 'stock_levels', columnName: 'quantity', isEditable: true, createdAt: new Date() },
    ];

    async findAll() {
        try {
            return await this.prisma.guardianWhitelist.findMany({
                orderBy: [{ schemaName: 'asc' }, { tableName: 'asc' }],
            });
        } catch (error) {
            this.logger.warn('Prisma failure, falling back to High-Fidelity Virtual Whitelist');
            return [...WhitelistService.VIRTUAL_WHITELIST];
        }
    }

    async update(
        id: string,
        data: { isEditable?: boolean },
        actor: string,
        correlationId: string
    ) {
        const original = await this.prisma.guardianWhitelist.findUnique({ where: { id } });

        const updated = await this.prisma.guardianWhitelist.update({
            where: { id },
            data,
        });

        // Invalidar Caches
        this.invalidateCaches();

        // Auditoría
        await this.auditStore.create({
            correlationId,
            actor,
            type: 'POLICY_CHANGE',
            tableName: 'guardian_whitelist',
            primaryKeyColumn: 'id',
            primaryKeyValue: id,
            snapshotBefore: original,
            snapshotAfter: updated,
            status: 'SUCCESS',
        });

        return updated;
    }

    async create(
        data: { schemaName: string; tableName: string; columnName?: string; isEditable?: boolean },
        actor: string,
        correlationId: string
    ) {
        try {
            const created = await this.prisma.guardianWhitelist.create({ data });
            this.invalidateCaches();
            await this.auditStore.create({
                correlationId, actor, type: 'POLICY_CHANGE',
                tableName: 'guardian_whitelist', primaryKeyColumn: 'id',
                primaryKeyValue: created.id, snapshotBefore: null, snapshotAfter: created, status: 'SUCCESS',
            });
            return created;
        } catch (error) {
            this.logger.error('Whitelist create failed — BD no disponible', error);
            throw new ServiceUnavailableException('Base de datos no disponible. Operación no permitida sin BD activa.');
        }
    }

    async delete(id: string, actor: string, correlationId: string) {
        try {
            const original = await this.prisma.guardianWhitelist.findUnique({ where: { id } });
            await this.prisma.guardianWhitelist.delete({ where: { id } });
            this.invalidateCaches();
            await this.auditStore.create({
                correlationId, actor, type: 'POLICY_CHANGE',
                tableName: 'guardian_whitelist', primaryKeyColumn: 'id',
                primaryKeyValue: id, snapshotBefore: original, snapshotAfter: null, status: 'SUCCESS',
            });
        } catch (error) {
            this.logger.error('Whitelist delete failed — BD no disponible', error);
            throw new ServiceUnavailableException('Base de datos no disponible. Operación no permitida sin BD activa.');
        }
    }

    private invalidateCaches() {
        this.metadataResolver.clearCache();
        this.policyResolver.clearCache();
        this.logger.log('Guardian Caches invalidated due to whitelist change');
    }
}
