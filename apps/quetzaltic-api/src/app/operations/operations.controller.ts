import {
    Controller,
    Post,
    Body,
    Headers,
    UseGuards,
    BadRequestException,
    Request,
    Param,
} from '@nestjs/common';
import { TransactionOrchestratorService } from '../transaction/transaction-orchestrator.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditStoreService } from '../audit/audit-store.service';
import { GuardianValidator } from '@quetzaltic/guardian-core';
import { PrismaMetadataResolver } from '../database/resolvers/prisma-metadata.resolver';
import { PrismaResourcePolicyResolver } from '../database/resolvers/prisma-resource-policy.resolver';


export class ExecuteOperationDto {
    sql!: string;
    ticketId!: string;
    data?: Record<string, unknown>; // Opcional, contiene los valores a actualizar
}

@Controller('operations')
export class OperationsController {
    constructor(
        private readonly orchestrator: TransactionOrchestratorService,
        private readonly auditStore: AuditStoreService,
        private readonly metadataResolver: PrismaMetadataResolver,
        private readonly resourcePolicyResolver: PrismaResourcePolicyResolver,
    ) { }

    @Post('preview')
    @UseGuards(JwtAuthGuard)
    async preview(
        @Body('sql') sql: string,
    ) {
        if (!sql) {
            throw new BadRequestException('SQL query is required for preview.');
        }

        let validatedQuery: any;
        try {
            validatedQuery = await GuardianValidator.validate(sql, {
                metadataResolver: this.metadataResolver,
                resourcePolicyResolver: this.resourcePolicyResolver,
            });
        } catch (error: any) {
            throw new BadRequestException(`Query validation failed: ${error.message}`);
        }


        // Ejecutar el SELECT original directamente en la DB (ya validado por Guardian)
        // Esto es más robusto que convertir a Prisma filters ya que soporta cualquier condición válida
        let rawRecords: Record<string, unknown>[];
        try {
            rawRecords = await (this.orchestrator as any).prisma.$queryRawUnsafe(sql) as Record<string, unknown>[];
        } catch (err: any) {
            throw new BadRequestException(`Error executing query: ${err.message}`);
        }

        if (rawRecords.length === 0) {
            throw new BadRequestException('No records found matching the query.');
        }

        // Limitamos previsualización a los primeros 10 registros para no saturar el UI
        const previewRecords = rawRecords.slice(0, 10);

        const recordsWithResolutions = await Promise.all(previewRecords.map(async (record) => {
            const resolutions = await this.orchestrator.resolveRecordNames(record as Record<string, unknown>);
            return {
                data: record,
                resolutions
            };
        }));

        return {
            status: 'OK',
            table: validatedQuery.table,
            pkColumn: validatedQuery.pkColumn,
            pkValue: validatedQuery.pkValue,
            count: rawRecords.length,
            records: recordsWithResolutions,
        };
    }

    @Post('execute')
    @UseGuards(JwtAuthGuard)
    async execute(
        @Body() body: ExecuteOperationDto,
        @Headers('x-idempotency-key') idempotencyKey: string,
        @Headers('x-correlation-id') correlationId: string,
        @Request() req: any
    ) {
        if (!idempotencyKey) {
            throw new BadRequestException('X-Idempotency-Key header is mandatory.');
        }

        const activeCorrelationId = correlationId || req.id || 'gen_' + Date.now();

        let executeResponse;
        try {
            executeResponse = await this.orchestrator.executeUpdate({
                query: body.sql,
                data: body.data || {},
                actor: req.user.actor,
                ticketId: body.ticketId,
                correlationId: activeCorrelationId,
                idempotencyKey: idempotencyKey,
            });
        } catch (error: any) {
            console.error('[CRITICAL ERROR] orchestrator.executeUpdate failed:', error.message);
            if (error.stack) console.error(error.stack);
            throw error;
        }

        const { result, auditEventIds } = executeResponse;

        const resolutions = result ? await this.orchestrator.resolveRecordNames(result as Record<string, unknown>) : undefined;

        return {
            status: 'SUCCESS',
            correlationId: activeCorrelationId,
            data: result,
            resolutions,
            auditEventIds: auditEventIds
        };
    }

    @Post('rollback/:id')
    @UseGuards(JwtAuthGuard)
    async rollback(
        @Param('id') id: string,
        @Headers('x-idempotency-key') idempotencyKey: string,
        @Headers('x-correlation-id') correlationId: string,
        @Request() req: any
    ) {
        try {
            if (!idempotencyKey) {
                throw new BadRequestException('X-Idempotency-Key header is mandatory for rollback.');
            }

            const activeCorrelationId = correlationId || (req as any).id || 'gen_rb_' + Date.now();

            // 1. Obtener evento inicial para identificar el grupo
            const initialEvent = await this.auditStore.getById(id);
            if (!initialEvent) {
                throw new BadRequestException('Audit event not found.');
            }

            // 2. Buscar todos los eventos del mismo grupo (Bulk Rollback)
            const eventsToRollback = await (this.orchestrator as any).prisma.auditEvent.findMany({
                where: { 
                    correlationId: initialEvent.correlationId,
                    status: 'SUCCESS',
                    revertedByEventId: null
                }
            });

            if (eventsToRollback.length === 0) {
                throw new BadRequestException('No successful, non-reverted events found for this operation.');
            }

            const revertedIds: string[] = [];

            for (const event of eventsToRollback) {
                const pkColumns = event.primaryKeyColumn.split(',');
                const pkValues = event.primaryKeyValue.split(',');

                const currentState = await this.orchestrator.fetchCurrentRecord(
                    event.tableName,
                    pkColumns,
                    pkValues
                );

                if (!currentState) {
                    console.warn(`[ROLLBACK SKIP] Record ${event.primaryKeyValue} no longer exists.`);
                    continue;
                }

                // Ejecutar Rollback vía SQL Directo
                const normalizedPkVals = pkValues.map((v: string) => (v.trim() !== '' && !isNaN(Number(v))) ? Number(v) : `'${v}'`);
                const whereClause = pkColumns.map((col: string, idx: number) => `${col} = ${normalizedPkVals[idx]}`).join(' AND ');
                
                const snapshotBefore = typeof event.snapshotBefore === 'string' ? JSON.parse(event.snapshotBefore) : event.snapshotBefore;
                const METADATA_FIELDS = ['id', 'updatedAt', 'updated_at', 'createdAt', 'created_at', 'executedAt', 'executed_at'];
                
                const assignments: string[] = [];
                Object.keys(snapshotBefore).forEach((key: string) => {
                    const isPk = pkColumns.some((pk: string) => pk.trim().toLowerCase() === key.toLowerCase());
                    const isMeta = METADATA_FIELDS.some((m: string) => m.toLowerCase() === key.toLowerCase());
                    
                    if (!isPk && !isMeta) {
                        let val = snapshotBefore[key];
                        if (val === null) assignments.push(`${key} = NULL`);
                        else if (typeof val === 'string') assignments.push(`${key} = '${val.replace(/'/g, "''")}'`);
                        else if (typeof val === 'boolean') assignments.push(`${key} = ${val ? 1 : 0}`);
                        else assignments.push(`${key} = ${val}`);
                    }
                });

                if (assignments.length > 0) {
                    const rawUpdateSql = `UPDATE ${event.tableName} SET ${assignments.join(', ')} WHERE ${whereClause}`;
                    await (this.orchestrator as any).prisma.$executeRawUnsafe(rawUpdateSql);

                    // Audit Rollback
                    const rbEventId = await this.auditStore.create({
                        correlationId: activeCorrelationId,
                        ticketId: `RB-${event.ticketId || id}`,
                        actor: req.user.actor,
                        tableName: event.tableName,
                        primaryKeyColumn: event.primaryKeyColumn,
                        primaryKeyValue: event.primaryKeyValue,
                        snapshotBefore: currentState,
                        snapshotAfter: snapshotBefore,
                        status: 'SUCCESS',
                        type: 'OPERATION'
                    });

                    await this.auditStore.markAsReverted(event.id, rbEventId);
                    revertedIds.push(event.id);
                }
            }

            return {
                status: 'SUCCESS',
                message: `Bulk rollback completed. Reverted ${revertedIds.length} records.`,
                correlationId: activeCorrelationId,
                revertedIds
            };
        } catch (error: any) {
            console.error('[CRITICAL ROLLBACK ERROR]:', error.message);
            if (error.stack) console.error(error.stack);
            throw error;
        }
    }
}
