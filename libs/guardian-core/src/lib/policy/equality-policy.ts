import { SelectFromStatement, FromTable } from 'pgsql-ast-parser';
import { ParsedAst } from '../types/parsed-ast.types';
import { GuardianEqualityViolationError } from '../errors/guardian-equality-violation.error';
import { MetadataResolver } from './metadata.resolver';

/**
 * Valida que la consulta tenga condiciones de igualdad (=) que cubran exactamente la Primary Key.
 * Soporta claves simples y compuestas (a través de ANDs).
 */
/**
 * Valida que la consulta tenga al menos una condición de igualdad (=) en el WHERE.
 * Retorna true si la consulta es considerada "BULK" (no coincide exactamente con la PK).
 */
export async function validateSafeWhereClause(
    ast: ParsedAst,
    resolver?: MetadataResolver
): Promise<{ isBulk: boolean, filters: Map<string, any> }> {
    const stmt = ast[0] as SelectFromStatement;

    if (!stmt.where) {
        throw new GuardianEqualityViolationError('WHERE clause is mandatory to prevent accidental full-table operations.');
    }

    const fromSource = stmt.from?.[0];
    if (!fromSource || fromSource.type !== 'table') {
        throw new GuardianEqualityViolationError('Only table-based operations are supported.');
    }

    const tableSource = fromSource as FromTable;
    const tableName = tableSource.name.name;
    const schemaName = tableSource.name.schema || 'dbo';

    const pkInfo = resolver ? await resolver.getPrimaryKeyColumn(schemaName, tableName) : null;
    const requiredColumns = Array.isArray(pkInfo) ? pkInfo : (pkInfo ? [pkInfo] : []);

    const foundConditions = new Map<string, any>();
    
    const collectEqualities = (expr: any) => {
        if (expr.type === 'binary' && expr.op === '=') {
            if (expr.left.type === 'ref') {
                foundConditions.set(expr.left.name.toLowerCase(), expr.right);
            } else {
                throw new GuardianEqualityViolationError('Equality left side must be a column reference.');
            }
        } else if (expr.type === 'binary' && expr.op === 'AND') {
            collectEqualities(expr.left);
            collectEqualities(expr.right);
        } else {
            // Permitimos otros operadores pero la auditoría será mas compleja?
            // Por ahora mantenemos solo = y AND para asegurar previsualización exacta.
            throw new GuardianEqualityViolationError(
                `Unsupported expression type '${expr.type}' or operator '${expr.op}'. Bulk updates currently require '=' and 'AND' for safety.`
            );
        }
    };

    collectEqualities(stmt.where);

    let isBulk = false;
    if (requiredColumns.length > 0) {
        // Verificar si faltan columnas de la PK o si sobran otras
        const hasAllPk = requiredColumns.every(col => foundConditions.has(col.toLowerCase()));
        const hasOnlyPk = foundConditions.size === requiredColumns.length;

        if (!hasAllPk || !hasOnlyPk) {
            isBulk = true;
        }
    } else {
        // Sin metadatos de PK, si hay más de una condición o ninguna, lo tratamos como bulk o error
        isBulk = foundConditions.size !== 1;
    }

    return { isBulk, filters: foundConditions };
}
