import {
    Controller,
    Post,
    Body,
    Headers,
    UseGuards,
    BadRequestException,
    Request,
    Param,
    Query
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
    data?: Record<string, unknown>;
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
    async preview(@Body('sql') sql: string) {
        if (!sql) throw new BadRequestException('SQL query is required for preview.');
        let validatedQuery: any;
        try {
            validatedQuery = await GuardianValidator.validate(sql, {
                metadataResolver: this.metadataResolver,
                resourcePolicyResolver: this.resourcePolicyResolver,
            });
        } catch (error: any) {
            throw new BadRequestException(`Query validation failed: ${error.message}`);
        }
        let rawRecords: any[];
        try {
            rawRecords = await (this.orchestrator as any).prisma.$queryRawUnsafe(sql);
        } catch (err: any) {
            throw new BadRequestException(`Error executing query: ${err.message}`);
        }
        if (rawRecords.length === 0) throw new BadRequestException('No records found matching the query.');
        const previewRecords = rawRecords.slice(0, 10);
        const recordsWithResolutions = await Promise.all(previewRecords.map(async (record) => {
            const resolutions = await this.orchestrator.resolveRecordNames(record);
            return { data: record, resolutions };
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
        if (!idempotencyKey) throw new BadRequestException('X-Idempotency-Key header is mandatory.');
        const activeCorrelationId = String(correlationId || req.id || 'gen_' + Date.now());
        const executeResponse = await this.orchestrator.executeUpdate({
            query: body.sql,
            data: body.data || {},
            actor: req.user?.email || req.user?.actor || 'system',
            ticketId: body.ticketId,
            correlationId: activeCorrelationId,
            idempotencyKey: idempotencyKey,
        });
        const { result, auditEventIds } = executeResponse;
        const resolutions = result ? await this.orchestrator.resolveRecordNames(result as any) : undefined;
        return {
            status: 'SUCCESS',
            correlationId: activeCorrelationId,
            data: result,
            resolutions,
            auditEventIds
        };
    }

    @Post('rollback/:id')
    @UseGuards(JwtAuthGuard)
    async rollback(
        @Param('id') id: string,
        @Query('correlationId') correlationId?: string,
        @Request() req?: any
    ) {
        const fs = require('fs');
        const logPath = 'c:/dev/soporte/quetzaltic/rollback_activity.log';
        const log = (msg: string) => {
            const timestamp = new Date().toISOString();
            try { fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`); } catch(e){}
            console.log(`[ROLLBACK] ${msg}`);
        };

        const formatSqlValue = (v: any): string => {
            if (v === null || v === undefined) return 'NULL';
            if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`;
            if (typeof v === 'boolean') return v ? '1' : '0';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            return v.toString();
        };

        try {
            const initialEvent = await (this.orchestrator as any).prisma.auditEvent.findUnique({ where: { id } });
            if (!initialEvent) {
                log(`[ERROR] Initial event not found: ${id}`);
                throw new BadRequestException('Evento de auditoría no encontrado.');
            }

            const eventsToRollback = await (this.orchestrator as any).prisma.auditEvent.findMany({
                where: { 
                    correlationId: initialEvent.correlationId,
                    tableName: initialEvent.tableName 
                }
            });

            log(`[START] Rollback. CorrelationId: ${initialEvent.correlationId}. Siblings: ${eventsToRollback.length}`);

            const METADATA_FIELDS = ['id', 'updatedAt', 'updated_at', 'createdAt', 'created_at', 'executedAt', 'executed_at'];
            const activeCorrelationId = String(correlationId || req?.id || 'gen_rb_' + Date.now());

            const revertedCount = await (this.orchestrator as any).prisma.$transaction(async (tx: any) => {
                let count = 0;
                try {

                for (const event of eventsToRollback) {
                    if (event.revertedByEventId) {
                        log(`[SKIPPED] Record ${event.primaryKeyValue} already reverted.`);
                        continue;
                    }

                    const pkCols = event.primaryKeyColumn.split(',').map((c: string) => c.trim());
                    const pkVals = event.primaryKeyValue.split(',').map((v: string) => v.trim());
                    
                    // IMPORTANTE: Usar 'tx' para evitar agotar el pool de conexiones y asegurar consistencia
                    const currentState = await this.orchestrator.fetchCurrentRecord(event.tableName, pkCols, pkVals, tx);

                    if (!currentState) {
                        log(`[SKIPPED] Record ${event.primaryKeyValue} current state not found.`);
                        continue;
                    }

                    const snapshotBefore = typeof event.snapshotBefore === 'string' ? JSON.parse(event.snapshotBefore) : event.snapshotBefore;
                    const assignments: string[] = [];
                    Object.keys(snapshotBefore).forEach(key => {
                        const isPk = pkCols.some((pk: string) => pk.toLowerCase() === key.toLowerCase());
                        const isMeta = METADATA_FIELDS.some(m => m.toLowerCase() === key.toLowerCase());
                        if (!isPk && !isMeta) assignments.push(`[${key}] = ${formatSqlValue(snapshotBefore[key])}`);
                    });

                    if (assignments.length > 0) {
                        const where = pkCols.map((col: string, idx: number) => {
                            const rawVal = pkVals[idx];
                            const isNum = !isNaN(Number(rawVal)) && rawVal.length > 0 && !(rawVal.startsWith('0') && rawVal.length > 1);
                            return `[${col}] = ${isNum ? Number(rawVal) : `'${rawVal.replace(/'/g, "''")}'`}`;
                        }).join(' AND ');
                        
                        const affected = await tx.$executeRawUnsafe(`UPDATE [${event.tableName}] SET ${assignments.join(', ')} WHERE ${where}`);
                        
                        if (affected > 0) {
                            log(`[SUCCESS] Reverted ${event.primaryKeyValue}`);
                            
                            // Crear evento de auditoría de la reversión INDIVIDUALMENTE para asegurar mapeo perfecto
                            const rollbackEventId = await this.auditStore.create({
                                correlationId: activeCorrelationId.toString(),
                                ticketId: `RB-${event.ticketId || id}`,
                                actor: req?.user?.email || req?.user?.actor || 'system',
                                tableName: event.tableName,
                                primaryKeyColumn: event.primaryKeyColumn,
                                primaryKeyValue: event.primaryKeyValue,
                                snapshotBefore: currentState,
                                snapshotAfter: snapshotBefore,
                                status: 'SUCCESS',
                                type: 'OPERATION'
                            }, tx);

                            // Marcar el evento original como revertido
                            await tx.auditEvent.update({
                                where: { id: event.id },
                                data: { revertedByEventId: rollbackEventId }
                            });

                            count++;
                        } else {
                            log(`[WARNING] 0 rows affected for ${event.primaryKeyValue}`);
                        }
                    }
                }
                } catch (err: any) {
                    log(`[CRITICAL ERROR] ${err.message || err}`);
                    throw err; // Re-throw to trigger transaction rollback
                }
                return count;
            }, { timeout: 300000 });

            return { message: `Se han revertido ${revertedCount} registros exitosamente.`, count: revertedCount };
        } catch (error: any) {
            log(`[CRITICAL ERROR] ${error.message}`);
            throw error;
        }
    }
}
