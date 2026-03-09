import { SelectFromStatement, ExprBinary, FromTable } from 'pgsql-ast-parser';
import { ParsedAst } from '../types/parsed-ast.types';
import { GuardianEqualityViolationError } from '../errors/guardian-equality-violation.error';
import { MetadataResolver } from './metadata.resolver';
import { GuardianPrimaryKeyViolationError } from '../errors/guardian-primary-key-violation.error';

/**
 * Valida que la consulta tenga exactamente una condición WHERE de igualdad (=).
 */
export async function validateSingleRecordEquality(
    ast: ParsedAst,
    resolver?: MetadataResolver
): Promise<void> {
    const stmt = ast[0] as SelectFromStatement;

    // 1. Validar existencia de WHERE
    if (!stmt.where) {
        throw new GuardianEqualityViolationError('WHERE clause is mandatory for single-record lookups.');
    }

    const where = stmt.where;

    // 2. Solo permitir operaciones binarias simples
    if (where.type !== 'binary') {
        throw new GuardianEqualityViolationError(
            `Complex WHERE conditions are not allowed. Only simple equality (=) is permitted.`
        );
    }

    const binaryWhere = where as ExprBinary;

    // 3. Validar operador '='
    if (binaryWhere.op !== '=') {
        throw new GuardianEqualityViolationError(
            `Operator '${binaryWhere.op}' is forbidden. Only '=' is allowed for single-record enforcement.`
        );
    }

    // 4. Validar Primary Key si hay resolver
    if (resolver) {
        const fromSource = stmt.from?.[0];
        if (!fromSource || fromSource.type !== 'table') {
            return; // Ya validado por structural hardening
        }

        const tableSource = fromSource as FromTable;
        const tableName = tableSource.name.name;
        const schemaName = tableSource.name.schema || 'prod';

        // El parser pone el identificador en left (normalmente)
        const left = binaryWhere.left;
        if (left.type !== 'ref') {
            throw new GuardianEqualityViolationError('Left side of equality must be a column reference.');
        }

        const columnName = left.name;
        const pkColumn = await resolver.getPrimaryKeyColumn(schemaName, tableName);

        if (!pkColumn || columnName.toLowerCase() !== pkColumn.toLowerCase()) {
            throw new GuardianPrimaryKeyViolationError(tableName, columnName);
        }
    }
}
