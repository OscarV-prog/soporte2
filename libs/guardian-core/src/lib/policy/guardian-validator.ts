import { SelectFromStatement, ExprBinary, FromTable } from 'pgsql-ast-parser';
import { parseSqlToAst } from '../parser/sql-parser';
import { validateReadOnlyStatement } from './policy-engine';
import { validateStructuralIntegrity } from './hardening-policy';
import { validateSingleRecordEquality } from './equality-policy';
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

        // 4. Equality & PK Enforcement
        await validateSingleRecordEquality(ast, metadataResolver);

        // 5. Extracción de Metadatos (Seguro tras validaciones anteriores)
        const select = ast[0] as SelectFromStatement;
        const from = select.from?.[0] as FromTable;
        const tableName = from.name.name;
        const schemaName = from.name.schema || 'prod';
        const where = select.where as ExprBinary;

        // validateSingleRecordEquality garantiza que left es columna
        const pkColumn = (where.left as any).column; // pgsql-ast-parser types are sometimes tricky here, using unknown narrowing
        const pkValue = this.extractValue(where.right);

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

            await resourcePolicyResolver.authorizeResource(schemaName, tableName, pkColumn);
        }

        return {
            ast,
            table: tableName,
            pkColumn: pkColumn,
            pkValue,
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
