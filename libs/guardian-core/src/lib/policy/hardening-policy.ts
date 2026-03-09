import { SelectFromStatement, FromTable } from 'pgsql-ast-parser';
import { ParsedAst } from '../types/parsed-ast.types';
import { GuardianStructuralViolationError } from '../errors/guardian-structural-violation.error';

/**
 * Valida que la consulta SELECT sea estructuralmente simple y segura.
 * Bloquea construcciones que puedan ocultar manipulación de conjuntos o evasión de políticas.
 */
export function validateStructuralIntegrity(ast: ParsedAst): void {
    const rawStmt = ast[0];

    // 1. Bloquear UNION, INTERSECT, EXCEPT (Set Operations)
    if (rawStmt.type === 'union' || rawStmt.type === 'union all') {
        throw new GuardianStructuralViolationError('UNION/INTERSECT/EXCEPT');
    }

    // validateReadOnlyStatement ya garantizó que es 'select' o 'values' o 'with' etc.
    // Pero aquí nos interesa solo el SELECT base.
    if (rawStmt.type !== 'select') {
        throw new GuardianStructuralViolationError('NOT_A_SIMPLE_SELECT');
    }

    const stmt = rawStmt as SelectFromStatement;

    // 2. Bloquear WITH (CTE) - pgsql-ast-parser Statement union covers this
    // (Ya manejado si rawStmt.type !== 'select', pero seremos explícitos)

    // 3. Bloquear DISTINCT
    if (stmt.distinct && stmt.distinct !== 'all') {
        throw new GuardianStructuralViolationError('DISTINCT');
    }

    // 4. Bloquear ORDER BY, GROUP BY, HAVING
    if (stmt.orderBy && stmt.orderBy.length > 0) {
        throw new GuardianStructuralViolationError('ORDER BY');
    }
    if (stmt.groupBy && stmt.groupBy.length > 0) {
        throw new GuardianStructuralViolationError('GROUP BY');
    }
    if (stmt.having) {
        throw new GuardianStructuralViolationError('HAVING');
    }

    // 5. Bloquear LIMIT, OFFSET
    if (stmt.limit) {
        throw new GuardianStructuralViolationError('LIMIT/OFFSET');
    }

    // 6. Validar FROM (Solo una tabla, sin alias, sin JOINs, sin subqueries)
    if (!stmt.from || stmt.from.length === 0) {
        throw new GuardianStructuralViolationError('MISSING FROM');
    }

    if (stmt.from.length > 1) {
        throw new GuardianStructuralViolationError('MULTIPLE TABLES/JOIN');
    }

    const fromSource = stmt.from[0];

    // Bloquear Subqueries en FROM
    if (fromSource.type === 'statement') {
        throw new GuardianStructuralViolationError('SUBQUERY IN FROM');
    }

    // Bloquear JOINs explícitos
    if ((fromSource as any).join) { // FromTable has optional join
        throw new GuardianStructuralViolationError('JOIN');
    }

    // Bloquear Table Aliases
    if (fromSource.type === 'table') {
        const tableSource = fromSource as FromTable;
        if (tableSource.name.alias) {
            throw new GuardianStructuralViolationError('TABLE ALIAS');
        }
    }

    // 7. Bloquear Subqueries en SELECT (proyecciones)
    if (stmt.columns) {
        for (const col of stmt.columns) {
            if (col.expr.type === 'select' || col.expr.type === 'with') {
                throw new GuardianStructuralViolationError('SUBQUERY IN SELECT');
            }
        }
    }
}
