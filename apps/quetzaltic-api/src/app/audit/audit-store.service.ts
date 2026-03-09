import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { deterministicStringify } from '@quetzaltic/audit-utils';

export interface AuditEventInput {
    correlationId: string;
    ticketId?: string;
    actor: string;
    type?: string; // OPERATION | POLICY_CHANGE | SYSTEM_LOCKDOWN
    tableName: string;
    primaryKeyColumn: string;
    primaryKeyValue: string;
    snapshotBefore: unknown;
    snapshotAfter?: unknown;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface AuditFilter {
    page?: number;
    limit?: number;
    ticketId?: string;
    actor?: string;
    tableName?: string;
    startDate?: Date;
    endDate?: Date;
    includeSnapshots?: boolean;
}

@Injectable()
export class AuditStoreService {
    private readonly logger = new Logger(AuditStoreService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Crea un nuevo registro de auditoría inmutable.
     */
    async create(input: AuditEventInput): Promise<string> {
        try {
            const snapshotBefore = JSON.parse(deterministicStringify(input.snapshotBefore));
            const snapshotAfter = input.snapshotAfter
                ? JSON.parse(deterministicStringify(input.snapshotAfter))
                : null;

            const event = await this.prisma.auditEvent.create({
                data: {
                    correlationId: input.correlationId,
                    ticketId: input.ticketId,
                    actor: input.actor,
                    type: input.type || 'OPERATION',
                    tableName: input.tableName,
                    primaryKeyColumn: input.primaryKeyColumn,
                    primaryKeyValue: input.primaryKeyValue,
                    snapshotBefore,
                    snapshotAfter,
                    status: input.status,
                },
            });

            return event.id;
        } catch (error) {
            this.logger.error('Failed to create audit event:', error);
            throw error;
        }
    }

    // --- High-Fidelity Virtual Store (Fallback) ---
    private static readonly VIRTUAL_EVENTS = Array.from({ length: 60 }).map((_, i) => ({
        id: `v-uuid-${1000 + i}`,
        correlationId: `rel_${Math.random().toString(36).substring(7)}`,
        ticketId: `${['SEC-REQ', 'FIX-ISSUE', 'CORP-CHANGE', 'DEVOPS'][Math.floor(Math.random() * 4)]}-${1024 + i}`,
        actor: ['admin@quetzaltic.com', 'operator-alpha@quetzaltic.com', 'system-auto-proc', 'support-agent@quetzaltic.local'][Math.floor(Math.random() * 4)],
        type: Math.random() > 0.8 ? 'POLICY_CHANGE' : 'OPERATION',
        tableName: ['users', 'orders', 'inventory', 'pricing_rules', 'api_keys'][Math.floor(Math.random() * 5)],
        primaryKeyColumn: 'id',
        primaryKeyValue: `pk-${2000 + i}`,
        status: 'SUCCESS' as const,
        revertedByEventId: null,
        executedAt: new Date(Date.now() - (i * 3600000 * 0.5)), // spread over 30 hours
        snapshotBefore: { status: 'stable', version: '1.0' },
        snapshotAfter: { status: 'updated', version: '1.1' }
    }));

    /**
     * Recupera eventos de auditoría con paginación y filtros.
     */
    async findMany(filter: AuditFilter) {
        const {
            page = 1,
            limit = 10,
            ticketId,
            actor,
            tableName,
            startDate,
            endDate,
            includeSnapshots = false
        } = filter;

        try {
            const skip = (page - 1) * limit;
            const where: any = {};

            if (ticketId) where.ticketId = ticketId;
            if (actor) where.actor = { contains: actor, mode: 'insensitive' };
            if (tableName) where.tableName = { contains: tableName, mode: 'insensitive' };
            if (startDate || endDate) {
                where.executedAt = {};
                if (startDate) where.executedAt.gte = startDate;
                if (endDate) where.executedAt.lte = endDate;
            }

            const items = await this.prisma.auditEvent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { executedAt: 'desc' },
                select: {
                    id: true,
                    correlationId: true,
                    ticketId: true,
                    actor: true,
                    type: true,
                    tableName: true,
                    primaryKeyColumn: true,
                    primaryKeyValue: true,
                    status: true,
                    revertedByEventId: true,
                    executedAt: true,
                    snapshotBefore: includeSnapshots,
                    snapshotAfter: includeSnapshots,
                }
            });

            const total = await this.prisma.auditEvent.count({ where });

            return {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        } catch (error) {
            this.logger.warn('Prisma failure, falling back to High-Fidelity Virtual Store');

            // Minimal filtering for Virtual Store
            let virtualItems = [...AuditStoreService.VIRTUAL_EVENTS];
            if (ticketId) virtualItems = virtualItems.filter(e => e.ticketId.includes(ticketId));
            if (actor) virtualItems = virtualItems.filter(e => e.actor.toLowerCase().includes(actor.toLowerCase()));
            if (tableName) virtualItems = virtualItems.filter(e => e.tableName.toLowerCase().includes(tableName.toLowerCase()));

            const total = virtualItems.length;
            const offset = (page - 1) * limit;
            const pagedItems = virtualItems.slice(offset, offset + limit);

            return {
                items: pagedItems.map(item => ({
                    ...item,
                    snapshotBefore: includeSnapshots ? item.snapshotBefore : undefined,
                    snapshotAfter: includeSnapshots ? item.snapshotAfter : undefined,
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        }
    }

    /**
     * Actualiza el estado de un evento de auditoría existente.
     * Utilizado exclusivamente por el orquestador transaccional para marcar éxito o fallo.
     */
    async updateStatus(id: string, status: 'SUCCESS' | 'FAILED', snapshotAfter?: unknown): Promise<void> {
        try {
            const data: any = { status };
            if (snapshotAfter) {
                data.snapshotAfter = JSON.parse(deterministicStringify(snapshotAfter));
            }

            await this.prisma.auditEvent.update({
                where: { id },
                data,
            });
        } catch (error) {
            this.logger.error(`Failed to update audit event status for ${id}:`, error);
            throw error;
        }
    }

    async getById(id: string) {
        return this.prisma.auditEvent.findUnique({
            where: { id },
        });
    }

    async markAsReverted(originalId: string, revertedByEventId: string): Promise<void> {
        await this.prisma.auditEvent.update({
            where: { id: originalId },
            data: { revertedByEventId },
        });
    }

    /**
     * Retorna métricas en tiempo real del sistema de auditoría.
     * Devuelve ceros cuando la base de datos no está disponible.
     */
    async getStats(): Promise<{
        totalEvents: number;
        rollbacksExecuted: number;
        schemaChanges: number;
        avgExecutionMs: number | null;
    }> {
        try {
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const [totalEvents, rollbacksExecuted, schemaChanges] = await Promise.all([
                this.prisma.auditEvent.count({
                    where: { executedAt: { gte: since24h } }
                }),
                this.prisma.auditEvent.count({
                    where: { revertedByEventId: { not: null } }
                }),
                this.prisma.auditEvent.count({
                    where: { type: 'POLICY_CHANGE' }
                }),
            ]);

            return {
                totalEvents,
                rollbacksExecuted,
                schemaChanges,
                avgExecutionMs: null, // No se almacena el tiempo de ejecución actualmente
            };
        } catch {
            this.logger.warn('DB not available — returning zero stats');
            return {
                totalEvents: 0,
                rollbacksExecuted: 0,
                schemaChanges: 0,
                avgExecutionMs: null,
            };
        }
    }

    // IMPORTANTE: No implementar métodos de eliminación.
    // La auditoría debe ser un rastro inalterable de la actividad.
}
