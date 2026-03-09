import {
    Controller,
    Post,
    Body,
    Headers,
    UseGuards,
    BadRequestException,
    Request,
    Param,
    ConflictException,
} from '@nestjs/common';
import { TransactionOrchestratorService } from '../transaction/transaction-orchestrator.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditStoreService } from '../audit/audit-store.service';
import { deterministicStringify } from '@quetzaltic/audit-utils';
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

        const record = await this.orchestrator.fetchCurrentRecord(
            validatedQuery.table,
            validatedQuery.pkColumn,
            validatedQuery.pkValue,
        );

        if (!record) {
            throw new BadRequestException('No record found matching the SELECT query.');
        }

        return {
            status: 'OK',
            table: validatedQuery.table,
            pkColumn: validatedQuery.pkColumn,
            pkValue: validatedQuery.pkValue,
            record,
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

        const { result, auditEventId } = await this.orchestrator.executeUpdate({
            query: body.sql,
            data: body.data || {},
            actor: req.user.actor,
            ticketId: body.ticketId,
            correlationId: activeCorrelationId,
            idempotencyKey: idempotencyKey,
        });

        return {
            status: 'SUCCESS',
            correlationId: activeCorrelationId,
            data: result,
            auditEventId: auditEventId
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
        if (!idempotencyKey) {
            throw new BadRequestException('X-Idempotency-Key header is mandatory for rollback.');
        }

        const activeCorrelationId = correlationId || req.id || 'gen_rb_' + Date.now();

        // 1. Obtener evento original
        const originalEvent = await this.auditStore.getById(id);
        if (!originalEvent) {
            throw new BadRequestException('Audit event not found.');
        }

        // 2. Validaciones de estado
        if (originalEvent.status !== 'SUCCESS') {
            throw new BadRequestException(`Cannot rollback an event with status ${originalEvent.status}.`);
        }
        if (originalEvent.revertedByEventId) {
            throw new ConflictException('This operation has already been rolled back.');
        }

        // 3. Drift Detection
        const currentState = await this.orchestrator.fetchCurrentRecord(
            originalEvent.tableName,
            originalEvent.primaryKeyColumn,
            originalEvent.primaryKeyValue
        );

        if (!currentState) {
            throw new BadRequestException('Record to rollback no longer exists (Critical Drift).');
        }

        const snapshotAfterStr = deterministicStringify(originalEvent.snapshotAfter);
        const currentStateStr = deterministicStringify(currentState);

        if (snapshotAfterStr !== currentStateStr) {
            throw new ConflictException('Data drift detected: Current state does not match the state after the original operation.');
        }

        // 4. Ejecutar Rollback vía Orchestrator (compensatory update)
        const rollbackQuery = `SELECT * FROM ${originalEvent.tableName} WHERE ${originalEvent.primaryKeyColumn} = ${originalEvent.primaryKeyValue}`;

        const { result, auditEventId } = await this.orchestrator.executeUpdate({
            query: rollbackQuery,
            data: originalEvent.snapshotBefore as Record<string, unknown>,
            actor: req.user.actor,
            ticketId: `RB-${originalEvent.ticketId || id}`,
            correlationId: activeCorrelationId,
            idempotencyKey: idempotencyKey,
        });

        // 5. Marcar como revertido
        await this.auditStore.markAsReverted(id, auditEventId);

        return {
            status: 'SUCCESS',
            message: 'Rollback executed successfully.',
            correlationId: activeCorrelationId,
            data: result,
            rollbackEventId: auditEventId
        };
    }
}
