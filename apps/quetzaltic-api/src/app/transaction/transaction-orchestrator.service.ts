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
    private readonly TRANSACTION_TIMEOUT_MS = 35000; // Increased to 35s for heavy bulk updates

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
    async executeUpdate(input: TransactionInput): Promise<{ result: any, auditEventIds: string[], count: number }> {
        const { query, data, actor, ticketId, correlationId, idempotencyKey } = input;

        // 1. Idempotency Check
        const requestHash = computeRequestHash(query, ticketId, actor);
        const idempotency = await this.idempotency.validateAndLock(idempotencyKey, requestHash, correlationId);

        if (idempotency.isDuplicate) {
            return { result: idempotency.response, auditEventIds: ['idempotent_hit'], count: 0 };
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
                setTimeout(() => reject(new RequestTimeoutException('Production Transaction Timeout: Operation exceeded 10s limit.')),
                    this.TRANSACTION_TIMEOUT_MS)
            );

            const { result, auditEventIds, count } = (await Promise.race([updateTask, timeoutTask])) as { result: any, auditEventIds: string[], count: number };

            this.logger.log(`[ORCHESTRATOR] Bulk update successful. Events: ${auditEventIds.length}`);
            // 4. Resolver Idempotencia como SUCCESS
            await this.idempotency.resolve(idempotencyKey, result);
            return { result, auditEventIds, count };

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
    async fetchCurrentRecord(tableName: string, pkColumn: string | string[], pkValue: unknown | unknown[]): Promise<Record<string, unknown> | null> {
        const records = await this.fetchRecords(tableName, this.buildWhereClause(pkColumn, pkValue));
        return records.length > 0 ? records[0] : null;
    }

    async fetchRecords(tableName: string, where: Record<string, unknown>): Promise<Record<string, unknown>[]> {
        const delegateKey = this.getPrismaDelegateKey(tableName);
        const tableProxy = (this.prisma as unknown as Record<string, {
            findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>
        }>)[delegateKey];

        if (!tableProxy) return [];

        return tableProxy.findMany({ where });
    }

    async resolveRecordNames(record: Record<string, unknown>): Promise<Record<string, string>> {
        const resolutions: Record<string, string> = {};
        const keys = Object.keys(record);

        // Mapa manual de corrección (Source Key -> Target Table & PK & NameCol)
        const manualTableMap: Record<string, { table: string, targetPk: string, nameCol: string }> = {
            'id_Empresa': { table: 'Empresas', targetPk: 'id_Empresa', nameCol: 'nb_Empresa' },
            'id_Sucursal': { table: 'Sucursales', targetPk: 'id_Sucursal', nameCol: 'nb_Sucursal' },
            'id_Almacen': { table: 'Almacenes', targetPk: 'id_Almacen', nameCol: 'nb_Almacen' },
            'id_EmpleadoResponsable': { table: 'Empleados', targetPk: 'id_Empleado', nameCol: 'nb_NombreEmpleado' },
            'id_Empleado': { table: 'Empleados', targetPk: 'id_Empleado', nameCol: 'nb_NombreEmpleado' },
            'id_EmpresaEmpleadoResponsable': { table: 'Empresas', targetPk: 'id_Empresa', nameCol: 'nb_Empresa' },
            'id_TipoAlmacen': { table: 'TiposAlmacenes', targetPk: 'id_TipoAlmacen', nameCol: 'nb_TipoAlmacen' },
            'id_TipoAlmacenGrupo': { table: 'TiposAlmacenesGrupo', targetPk: 'id_TipoAlmacenGrupo', nameCol: 'nb_TipoGrupoAlmacen' },
            'id_AlmacenFisico': { table: 'AlmacenesFisicos', targetPk: 'id_AlmacenFisico', nameCol: 'de_AlmacenFisico' },
            'id_ReferenciaContable': { table: 'CentrosCostos', targetPk: 'id_ReferenciaContable', nameCol: 'nb_CentroCosto' }
        };

        for (const key of keys) {
            if (!key.startsWith('id_') || record[key] === null || record[key] === undefined) continue;

            try {
                const val = record[key];
                const baseName = key.replace(/^id_/, '');
                
                // 1. Intentar Mapeo Manual
                if (manualTableMap[key]) {
                    const cfg = manualTableMap[key];
                    const name = await this.tryResolve(cfg.table, cfg.targetPk, val, cfg.nameCol, record);
                    if (name) {
                        resolutions[key] = name;
                        continue;
                    }
                }

                // 2. Intentar Resolución Genérica
                const tableVariants = [
                    baseName.endsWith('s') ? baseName : `${baseName}s`,
                    baseName.endsWith('n') ? `${baseName}es` : baseName,
                    baseName
                ];

                for (const table of tableVariants) {
                    // Buscar columna de nombre dinámicamente
                    const colQuery = `
                        SELECT TOP 1 COLUMN_NAME 
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${table}' 
                        AND (COLUMN_NAME LIKE 'nb_%' OR COLUMN_NAME LIKE 'nm_%' OR COLUMN_NAME = 'name')
                        ORDER BY 
                            CASE 
                                WHEN COLUMN_NAME = 'nb_${baseName}' THEN 1
                                WHEN COLUMN_NAME LIKE 'nb_%' THEN 2
                                ELSE 3
                            END
                    `;
                    const colRes: any = await this.prisma.$queryRawUnsafe(colQuery);
                    
                    if (colRes?.length) {
                        const nameCol = colRes[0].COLUMN_NAME;
                        const name = await this.tryResolve(table, key, val, nameCol, record);
                        if (name) {
                            resolutions[key] = name;
                            break; 
                        }
                    }
                }
            } catch (e: any) {
                this.logger.error(`Error processing metadata for ${key}: ${e.message}`);
            }
        }

        return resolutions;
    }

    /**
     * Intenta resolver un nombre con fallback resiliente
     */
    private async tryResolve(table: string, pk: string, val: any, nameCol: string, context: any): Promise<string | null> {
        try {
            const formattedVal = typeof val === 'string' ? `'${val}'` : val;
            
            // Intento 1: Con contexto de Empresa y Sucursal (Si existen en el registro actual)
            try {
                let whereContext = `[${pk}] = ${formattedVal}`;
                if (context['id_Empresa'] && pk !== 'id_Empresa') whereContext += ` AND id_Empresa = ${context['id_Empresa']}`;
                if (context['id_Sucursal'] && pk !== 'id_Sucursal' && table.toLowerCase() !== 'sucursales') whereContext += ` AND id_Sucursal = ${context['id_Sucursal']}`;
                
                const query = `SELECT TOP 1 [${nameCol}] as name FROM [${table}] WHERE ${whereContext}`;
                const res: any = await this.prisma.$queryRawUnsafe(query);
                if (res?.length) return String(res[0].name);
            } catch (err) {
                // Si falla por columna inexistente (SQL Code 207), ignoramos y pasamos al fallback global
            }

            // Intento 2: Búsqueda Global (Resiliente a referencias cruzadas o tablas sin empresa)
            const globalQuery = `SELECT TOP 1 [${nameCol}] as name FROM [${table}] WHERE [${pk}] = ${formattedVal}`;
            const globalRes: any = await this.prisma.$queryRawUnsafe(globalQuery);
            if (globalRes?.length) return String(globalRes[0].name);

        } catch (e: any) {
            this.logger.debug(`Resolution failed for table ${table}: ${e.message}`);
        }
        return null;
    }

    private buildWhereClause(pkColumn: string | string[], pkValue: unknown | unknown[]): Record<string, unknown> {
        const where: Record<string, unknown> = {};
        
        let columns: string[];
        let values: unknown[];

        if (Array.isArray(pkColumn)) {
            columns = pkColumn;
            values = pkValue as unknown[];
        } else if (typeof pkColumn === 'string' && pkColumn.includes(',')) {
            columns = pkColumn.split(',').map(c => c.trim());
            values = typeof pkValue === 'string' ? pkValue.split(',').map(v => v.trim()) : [pkValue];
        } else {
            where[pkColumn as string] = pkValue;
            return where;
        }
        
        columns.forEach((col, idx) => {
            const val = values[idx];
            // Intentamos convertir a número si es posible
            where[col] = (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) ? Number(val) : val;
        });

        return where;
    }

    private getPrismaDelegateKey(tableName: string): string {
        const normalizedTableName = tableName.replace(/_/g, '').toLowerCase();
        const keys = Object.keys(this.prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
        for (const key of keys) {
            if (key.toLowerCase() === normalizedTableName) {
                return key;
            }
        }
        return tableName; // Descanso seguro si no hay coincidencia exacta
    }

    private async executeTransactionalLoop(
        validatedQuery: ValidatedQuery,
        data: Record<string, unknown>,
        correlationId: string,
        ticketId: string | undefined,
        actor: string
    ): Promise<{ result: any, auditEventIds: string[], count: number }> {
        return await this.prisma.$transaction(async (tx) => {
            const delegateKey = this.getPrismaDelegateKey(validatedQuery.table);
            const tableProxy = (tx as unknown as Record<string, {
                findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>,
                updateMany: (args: { where: Record<string, unknown>, data: Record<string, unknown> }) => Promise<{ count: number }>,
            }>)[delegateKey];

            if (!tableProxy) {
                throw new InternalServerErrorException(`Table ${validatedQuery.table} not found in model`);
            }

            // Usamos el prismaWhere del Guardián (soporta Bulk)
            const where = validatedQuery.prismaWhere || (this as any).buildWhereClause(validatedQuery.pkColumn, validatedQuery.pkValue);

            // a) Get Snapshots Before using Raw SQL to avoid case-sensitivity issues with Prisma filters
            // We use the table name and the prismaWhere to build a simple SELECT
            const whereEntries = Object.entries(where);
            let whereClause = '1=1';
            if (whereEntries.length > 0) {
                whereClause = whereEntries.map(([col, val]) => {
                    const formattedVal = typeof val === 'string' ? `'${val}'` : val;
                    return `[${col}] = ${formattedVal}`;
                }).join(' AND ');
            }
            
            const selectQuery = `SELECT * FROM [${validatedQuery.table}] WHERE ${whereClause}`;
            this.logger.debug(`[ORCHESTRATOR] Fetching snapshots with query: ${selectQuery}`);
            this.logger.debug(`[ORCHESTRATOR] Where object: ${JSON.stringify(where)}`);
            
            const snapshotsBefore = await tx.$queryRawUnsafe(selectQuery) as Record<string, unknown>[];
            this.logger.debug(`[ORCHESTRATOR] Snapshots found: ${snapshotsBefore.length}`);

            if (snapshotsBefore.length === 0) {
                this.logger.error(`[ORCHESTRATOR FATAL] No records found with query: ${selectQuery}`);
                throw new InternalServerErrorException(`No records found on table ${validatedQuery.table} matching the filter.`);
            }

            // b) Audit PENDING for each record
            const auditEventIds: string[] = [];
            const pkCols = Array.isArray(validatedQuery.pkColumn) ? validatedQuery.pkColumn : [validatedQuery.pkColumn];

            for (const snapshot of snapshotsBefore) {
                // Extraer el valor de la PK para este registro específico (Case-insensitive lookup)
                const snapshotKeys = Object.keys(snapshot);
                const pkVals = pkCols.map(col => {
                    const realKey = snapshotKeys.find(k => k.toLowerCase() === col.toLowerCase());
                    return String(snapshot[realKey || col]);
                }).join(',');
                
                const eventId = await this.auditStore.create({
                    correlationId,
                    ticketId,
                    actor,
                    tableName: validatedQuery.table,
                    primaryKeyColumn: pkCols.join(','),
                    primaryKeyValue: pkVals,
                    snapshotBefore: snapshot,
                    status: 'PENDING',
                });
                auditEventIds.push(eventId);
            }

            try {
                // c) Execute Bulk UPDATE via Raw SQL for maximum robustness against mapping/case issues
                this.logger.log(`[ORCHESTRATOR] Bulk Update on ${validatedQuery.table}. Records: ${snapshotsBefore.length}`);
                
                const dataEntries = Object.entries(data);
                const setClause = dataEntries.map(([col, val]) => {
                    const formattedVal = typeof val === 'string' ? `'${val}'` : (val === null ? 'NULL' : val);
                    return `[${col}] = ${formattedVal}`;
                }).join(', ');

                const updateQuery = `UPDATE [${validatedQuery.table}] SET ${setClause} WHERE ${whereClause}`;
                console.log(`[ORCHESTRATOR] Executing Update SQL: ${updateQuery}`);
                
                const count = await tx.$executeRawUnsafe(updateQuery);
                console.log(`[ORCHESTRATOR] Update result count: ${count}`);

                const updateRes = { count };

                // d) Audit SUCCESS for all (Fetch again using same raw query)
                const snapshotsAfter = await tx.$queryRawUnsafe(selectQuery) as Record<string, unknown>[];
                const snapshotAfterKeys = snapshotsAfter.length > 0 ? Object.keys(snapshotsAfter[0]) : [];
                
                for (let i = 0; i < auditEventIds.length; i++) {
                    const eventId = auditEventIds[i];
                    const before = snapshotsBefore[i];
                    const beforeKeys = Object.keys(before);

                    // Intentar encontrar el "after" correspondiente por PK (Case-insensitive match)
                    const after = snapshotsAfter.find(s => 
                        pkCols.every(col => {
                            const bKey = beforeKeys.find(k => k.toLowerCase() === col.toLowerCase());
                            const aKey = snapshotAfterKeys.find(k => k.toLowerCase() === col.toLowerCase());
                            return String(s[aKey || col]) === String(before[bKey || col]);
                        })
                    );
                    await this.auditStore.updateStatus(eventId, 'SUCCESS', after || snapshotsAfter[0] || before);
                }

                return { result: updateRes, auditEventIds, count: updateRes.count };
            } catch (error: any) {
                console.error(`[ORCHESTRATOR FATAL] Bulk update failed for ${validatedQuery.table}:`, error.message);
                if (error.stack) console.error(error.stack);
                for (const id of auditEventIds) {
                    await this.auditStore.updateStatus(id, 'FAILED').catch(() => { });
                }
                throw error;
            }
        }, {
            maxWait: 10000,
            timeout: 30000
        });
    }
}
