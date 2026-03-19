import { SelectFromStatement, FromTable } from 'pgsql-ast-parser';
import { parseSqlToAst } from '../parser/sql-parser';
import { validateReadOnlyStatement } from './policy-engine';
import { validateStructuralIntegrity } from './hardening-policy';
import { validateSafeWhereClause } from './equality-policy';
import { MetadataResolver } from './metadata.resolver';
import { ResourcePolicyResolver } from './resource-policy.resolver';
import { ValidatedQuery } from '../types/validated-query.types';

/**
 * Punto de entrada único para la validación de seguridad del Guardián.
 * Unifica todas las capas de protección en un pipeline obligatorio y secuencial.
 */
export class GuardianValidator {
    /**
     * Valida una consulta SQL contra todas las políticas de seguridad.
     * 
     * @param query La consulta SQL a validar.
     * @param options Opciones de validación incluyendo resolvers de metadatos y políticas.
     * @returns Un objeto ValidatedQuery con el AST y metadatos del filtro.
     * @throws GuardianError y sus subclases si falla cualquier etapa del pipeline.
     */
    static async validate(
        query: string,
        options: {
            metadataResolver?: MetadataResolver;
            resourcePolicyResolver?: ResourcePolicyResolver;
        } = {}
    ): Promise<ValidatedQuery> {
        const { metadataResolver, resourcePolicyResolver } = options;

        // 1. Parsing
        const ast = parseSqlToAst(query);

        // 2. Read-Only Enforcement (Solo un SELECT)
        validateReadOnlyStatement(ast);

        // 3. Structural Hardening (Sin JOINs, WITH, UNION, etc.)
        validateStructuralIntegrity(ast);

        // 4. Equality & Safe Where Enforcement
        const { filters } = await validateSafeWhereClause(ast, metadataResolver);

        // 5. Extracción de Metadatos y Construcción de Filtro Prisma
        const select = ast[0] as SelectFromStatement;
        const from = select.from?.[0] as FromTable;
        const tableName = from.name.name;
        const schemaName = from.name.schema || 'dbo';
        
        const prismaWhere: Record<string, any> = {};
        filters.forEach((val: any, col: string) => {
            prismaWhere[col] = this.extractValue(val);
        });

        // Obtenemos los nombres canónicos de la PK para compatibilidad
        const pkInfo = metadataResolver ? await metadataResolver.getPrimaryKeyColumn(schemaName, tableName) : null;
        const canonicalColumns = Array.isArray(pkInfo) ? pkInfo : (pkInfo ? [pkInfo] : []);

        const pkColumns: string[] = [];
        const pkValues: unknown[] = [];

        if (canonicalColumns.length > 0) {
            for (const col of canonicalColumns) {
                pkColumns.push(col);
                pkValues.push(prismaWhere[col.toLowerCase()]);
            }
        }

        const pkColumnResult = pkColumns.length === 1 ? pkColumns[0] : pkColumns;
        const pkValueResult = pkValues.length === 1 ? pkValues[0] : pkValues;

        // 6. ACL / Resource Whitelisting
        if (resourcePolicyResolver) {
            await resourcePolicyResolver.authorizeResource(schemaName, tableName);

            if (select.columns) {
                for (const col of select.columns) {
                    if (col.expr.type === 'ref') {
                        await resourcePolicyResolver.authorizeResource(schemaName, tableName, col.expr.name);
                    }
                }
            }

            if (Array.isArray(pkColumnResult)) {
                for (const col of pkColumnResult) {
                    await resourcePolicyResolver.authorizeResource(schemaName, tableName, col);
                }
            } else {
                await resourcePolicyResolver.authorizeResource(schemaName, tableName, pkColumnResult);
            }
        }

        return {
            ast,
            table: tableName,
            pkColumn: pkColumnResult,
            pkValue: pkValueResult,
            prismaWhere,
            validatedAt: new Date(),
        };
    }

    /**
     * Extrae el valor literal de una expresión del AST.
     */
    private static extractValue(expr: unknown): unknown {
        const e = expr as { type: string; value?: unknown };
        if (e.type === 'string' || e.type === 'integer' || e.type === 'numeric' || e.type === 'boolean') {
            return e.value;
        }
        return expr;
    }
}
