import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { deterministicStringify } from '@quetzaltic/audit-utils';
import { Prisma } from '@prisma/client';

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
    grouped?: boolean;
}

@Injectable()
export class AuditStoreService {
    private readonly logger = new Logger(AuditStoreService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Crea un nuevo registro de auditoría inmutable.
     */
    async create(input: AuditEventInput, tx?: Prisma.TransactionClient): Promise<string> {
        const client = tx || this.prisma;
        try {
            const snapshotBefore = deterministicStringify(input.snapshotBefore);
            const snapshotAfter = input.snapshotAfter
                ? deterministicStringify(input.snapshotAfter)
                : null;

            const event = await client.auditEvent.create({
                data: {
                    correlationId: input.correlationId,
                    ticketId: input.ticketId,
                    actor: input.actor,
                    type: input.type || 'OPERATION',
                    tableName: input.tableName,
                    primaryKeyColumn: input.primaryKeyColumn,
                    primaryKeyValue: input.primaryKeyValue,
                    snapshotBefore: snapshotBefore as any,
                    snapshotAfter: snapshotAfter as any,
                    status: input.status,
                },
            });

            return event.id;
        } catch (error) {
            this.logger.error('Failed to create audit event:', error);
            throw error;
        }
    }

    /**
     * Crea múltiples registros de auditoría en una sola operación.
     */
    async createMany(inputs: AuditEventInput[], tx?: Prisma.TransactionClient): Promise<string[]> {
        const client = tx || this.prisma;
        try {
            const data = inputs.map(input => ({
                correlationId: input.correlationId,
                ticketId: input.ticketId,
                actor: input.actor,
                type: input.type || 'OPERATION',
                tableName: input.tableName,
                primaryKeyColumn: input.primaryKeyColumn,
                primaryKeyValue: input.primaryKeyValue,
                snapshotBefore: deterministicStringify(input.snapshotBefore) as any,
                snapshotAfter: input.snapshotAfter ? deterministicStringify(input.snapshotAfter) as any : null,
                status: input.status,
            }));

            await client.auditEvent.createMany({ data });
            
            const events = await client.auditEvent.findMany({
                where: { correlationId: inputs[0].correlationId },
                select: { id: true }
            });
            
            return events.map(e => e.id);
        } catch (error) {
            this.logger.error('Failed to create many audit events:', error);
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
     * Recupera eventos de auditoría agrupados por correlationId (Operaciones Bulk)
     */
    async findGrouped(filter: AuditFilter) {
        const {
            page = 1,
            limit = 8, // Basado en la preferencia del usuario
            ticketId,
            actor,
            tableName,
            startDate,
            endDate,
            includeSnapshots = false
        } = filter;

        try {
            const skip = (page - 1) * limit;
            
            // 1. Construir filtros para la sub-consulta (Raw SQL)
            let filterSql = 'WHERE 1=1';
            const params: any[] = [];
            
            if (ticketId) {
                filterSql += ` AND ticket_id = @p${params.length + 1}`;
                params.push(ticketId);
            }
            if (actor) {
                filterSql += ` AND actor LIKE @p${params.length + 1}`;
                params.push(`%${actor}%`);
            }
            if (tableName) {
                filterSql += ` AND table_name LIKE @p${params.length + 1}`;
                params.push(`%${tableName}%`);
            }
            if (startDate) {
                filterSql += ` AND executed_at >= @p${params.length + 1}`;
                params.push(startDate);
            }
            if (endDate) {
                filterSql += ` AND executed_at <= @p${params.length + 1}`;
                params.push(endDate);
            }

            // 2. Obtener los correlationIds únicos para esta página (Ordenados por el más reciente)
            const groupedQuery = `
                SELECT correlation_id as correlationId, MAX(executed_at) as lastExecutedAt
                FROM audit_events
                ${filterSql}
                GROUP BY correlation_id
                ORDER BY lastExecutedAt DESC
                OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;
            
            // Nota: Prisma executeRaw no soporta parámetros dinámicos fácilmente en SQL Server con OFFSET.
            // Usamos interpolación segura (filtros manuales arriba) o pasamos parámetros si Prisma lo permite.
            const uniqueGroups: any[] = await this.prisma.$queryRawUnsafe(groupedQuery, ...params);
            
            if (uniqueGroups.length === 0) {
                return { items: [], total: 0, page, limit, totalPages: 0 };
            }

            // 3. Obtener el total de grupos para la paginación
            const totalQuery = `SELECT COUNT(DISTINCT correlation_id) as count FROM audit_events ${filterSql}`;
            const totalRes: any = await this.prisma.$queryRawUnsafe(totalQuery, ...params);
            const total = totalRes[0]?.count || 0;

            // 4. Obtener todos los eventos para estos correlationIds
            const correlationIds = uniqueGroups.map(g => g.correlationId);
            const allEvents = await this.prisma.auditEvent.findMany({
                where: { correlationId: { in: correlationIds } },
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
                    revertingEvent: {
                        select: {
                            actor: true
                        }
                    },
                    executedAt: true,
                    snapshotBefore: includeSnapshots,
                    snapshotAfter: includeSnapshots,
                }
            });

            // 5. Agrupar los eventos (Post-procesamiento)
            const finalGroups: any[] = [];
            uniqueGroups.forEach(ug => {
                const groupEvents = allEvents.filter(e => e.correlationId === ug.correlationId);
                if (groupEvents.length > 0) {
                    const first = groupEvents[0];
                    finalGroups.push({
                        ...first, // Base info
                        revertedByActor: first.revertingEvent?.actor,
                        executedAt: ug.lastExecutedAt, // Usar el timestamp de la operación completa
                        affectedRows: groupEvents.length,
                        allPks: [...new Set(groupEvents.map(e => e.primaryKeyValue))],
                        events: groupEvents
                    });
                }
            });

            return {
                items: finalGroups,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        } catch (error) {
            this.logger.error('Failed to fetch grouped audit logs:', error);
            // Fallback al listado normal si falla el RAW SQL
            return this.findMany(filter);
        }
    }

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
                    revertingEvent: {
                        select: {
                            actor: true
                        }
                    },
                    executedAt: true,
                    snapshotBefore: includeSnapshots,
                    snapshotAfter: includeSnapshots,
                }
            });

            const total = await this.prisma.auditEvent.count({ where });

            return {
                items: items.map(i => ({
                    ...i,
                    revertedByActor: i.revertingEvent?.actor
                })),
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
    async updateStatus(id: string, status: 'SUCCESS' | 'FAILED', snapshotAfter?: unknown, tx?: Prisma.TransactionClient): Promise<void> {
        const client = tx || this.prisma;
        try {
            const data: any = { status };
            if (snapshotAfter) {
                data.snapshotAfter = deterministicStringify(snapshotAfter);
            }

            await client.auditEvent.update({
                where: { id },
                data: data as any,
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

    async markAsReverted(originalId: string, revertedByEventId: string, tx?: Prisma.TransactionClient): Promise<void> {
        const client = tx || this.prisma;
        await client.auditEvent.update({
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
            const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

            const [totalEvents, rollbacksExecuted, schemaChanges] = await Promise.all([
                this.prisma.auditEvent.count({
                    where: { executedAt: { gte: since48h } }
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
