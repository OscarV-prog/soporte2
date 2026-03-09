import { Injectable, Logger, InternalServerErrorException, RequestTimeoutException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditStoreService } from '../audit/audit-store.service';
import { GuardianValidator, ValidatedQuery } from '@quetzaltic/guardian-core';
import { PrismaMetadataResolver } from '../database/resolvers/prisma-metadata.resolver';
import { PrismaResourcePolicyResolver } from '../database/resolvers/prisma-resource-policy.resolver';
import { IdempotencyService } from './idempotency.service';
import { computeRequestHash } from '@quetzaltic/audit-utils';

export interface TransactionInput {
    query: string; // La consulta SELECT que define el registro a afectar
    data: Record<string, unknown>; // Los datos a actualizar
    actor: string;
    ticketId?: string;
    correlationId: string;
    idempotencyKey: string;
}

@Injectable()
export class TransactionOrchestratorService {
    private readonly logger = new Logger(TransactionOrchestratorService.name);
    private readonly TRANSACTION_TIMEOUT_MS = 500;

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditStore: AuditStoreService,
        private readonly idempotency: IdempotencyService,
        private readonly metadataResolver: PrismaMetadataResolver,
        private readonly resourcePolicyResolver: PrismaResourcePolicyResolver,
    ) { }

    /**
     * Ejecuta una operación de actualización atómica, validada, auditada e idempotente.
     * Fase 3: Incluye endurecimiento operacional (Timeouts).
     */
    async executeUpdate(input: TransactionInput): Promise<{ result: unknown, auditEventId: string, snapshotBefore: unknown }> {
        const { query, data, actor, ticketId, correlationId, idempotencyKey } = input;

        // 1. Idempotency Check
        const requestHash = computeRequestHash(query, ticketId, actor);
        const idempotency = await this.idempotency.validateAndLock(idempotencyKey, requestHash, correlationId);

        if (idempotency.isDuplicate) {
            // Si es duplicado, el response guardado es el result del executeUpdate anterior.
            // Nota: No tenemos el snapshotBefore ni auditEventId real aquí sin guardarlos en IdempotencyKey.
            // Para el MVP, retornaremos null en esos campos si es duplicado.
            return { result: idempotency.response, auditEventId: 'idempotent_hit', snapshotBefore: null };
        }

        try {
            // 2. Validar con Guardian
            let validatedQuery: ValidatedQuery;
            try {
                validatedQuery = await GuardianValidator.validate(query, {
                    metadataResolver: this.metadataResolver,
                    resourcePolicyResolver: this.resourcePolicyResolver,
                });
            } catch (error) {
                this.logger.warn(`Guardian rejected query: ${query}`, error);
                throw error;
            }

            // 3. Ejecutar Ciclo Transaccional con Timeout
            const updateTask = this.executeTransactionalLoop(validatedQuery, data, correlationId, ticketId, actor);

            const timeoutTask = new Promise((_, reject) =>
                setTimeout(() => reject(new RequestTimeoutException('Production Transaction Timeout: Operation exceeded 500ms limit.')),
                    this.TRANSACTION_TIMEOUT_MS)
            );

            // Promise.race garantiza que si el timeout gana, se lanza la excepción.
            // Prisma garantiza el rollback si la promesa interna del transaction se rechaza.
            const { result, auditEventId, snapshotBefore } = (await Promise.race([updateTask, timeoutTask])) as { result: unknown, auditEventId: string, snapshotBefore: unknown };

            // 4. Resolver Idempotencia como SUCCESS
            await this.idempotency.resolve(idempotencyKey, result);
            return { result, auditEventId, snapshotBefore };

        } catch (error) {
            // f) Marcar Idempotencia como FAILED tras el ROLLBACK
            await this.idempotency.reject(idempotencyKey);
            throw error;
        }
    }

    /**
     * Obtiene un registro actual sin abrir transacción.
     * Útil para verificaciones de drift previas a la orquestación.
     */
    async fetchCurrentRecord(tableName: string, pkColumn: string, pkValue: string): Promise<Record<string, unknown> | null> {
        const tableProxy = (this.prisma as unknown as Record<string, {
            findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>
        }>)[tableName];

        if (!tableProxy) return null;

        return tableProxy.findUnique({
            where: { [pkColumn]: pkValue }
        });
    }

    private async executeTransactionalLoop(
        validatedQuery: ValidatedQuery,
        data: Record<string, unknown>,
        correlationId: string,
        ticketId: string | undefined,
        actor: string
    ): Promise<{ result: unknown, auditEventId: string }> {
        return await this.prisma.$transaction(async (tx) => {
            const tableProxy = (tx as unknown as Record<string, {
                findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>,
                update: (args: { where: Record<string, unknown>, data: Record<string, unknown> }) => Promise<unknown>
            }>)[validatedQuery.table];

            if (!tableProxy) {
                throw new InternalServerErrorException(`Table ${validatedQuery.table} not found in model`);
            }

            // a) Get Snapshot Before
            const snapshotBefore = await tableProxy.findUnique({
                where: { [validatedQuery.pkColumn]: validatedQuery.pkValue }
            });

            if (!snapshotBefore) {
                throw new InternalServerErrorException(`Record not found on table ${validatedQuery.table} with PK ${validatedQuery.pkValue}`);
            }

            // b) Audit PENDING (Fail-Closed)
            const auditEventId = await this.auditStore.create({
                correlationId,
                ticketId,
                actor,
                tableName: validatedQuery.table,
                primaryKeyColumn: validatedQuery.pkColumn,
                primaryKeyValue: String(validatedQuery.pkValue),
                snapshotBefore,
                status: 'PENDING',
            });

            try {
                // c) Execute UPDATE
                const updatedRecord = await tableProxy.update({
                    where: { [validatedQuery.pkColumn]: validatedQuery.pkValue },
                    data,
                });

                // d) Audit SUCCESS
                await this.auditStore.updateStatus(auditEventId, 'SUCCESS', updatedRecord);

                return { result: updatedRecord, auditEventId, snapshotBefore };
            } catch (error) {
                await this.auditStore.updateStatus(auditEventId, 'FAILED').catch(() => { });
                throw error;
            }
        });
    }
}
