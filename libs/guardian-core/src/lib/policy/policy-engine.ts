import { ParsedAst } from '../types/parsed-ast.types';
import { GuardianMultipleStatementsError } from '../errors/guardian-multiple-statements.error';
import { GuardianInvalidStatementError } from '../errors/guardian-invalid-statement.error';

/**
 * Valida que el AST contenga exactamente un statement y que sea de tipo SELECT.
 * Aplica el principio de Zero-Trust: cualquier otra cosa es rechazada.
 * 
 * @param ast El Árbol de Sintaxis Abstracta generado por el parser.
 * @throws GuardianMultipleStatementsError si hay más de un statement.
 * @throws GuardianInvalidStatementError si el statement no es SELECT.
 */
export function validateReadOnlyStatement(ast: ParsedAst): void {
    // 1. Validar cantidad de statements
    if (ast.length === 0) {
        // Si no hay nada, técnicamente no hay peligro, pero podemos lanzarlo como inválido 
        // o simplemente no hacer nada. Según el requerimiento "permitir únicamente un solo statement de tipo SELECT",
        // 0 es inválido.
        throw new GuardianInvalidStatementError('NONE');
    }

    if (ast.length > 1) {
        throw new GuardianMultipleStatementsError();
    }

    // 2. Validar tipo de statement
    const statement = ast[0];

    if (statement.type !== 'select') {
        throw new GuardianInvalidStatementError(statement.type.toUpperCase());
    }

    // Si pasa todas las validaciones, no hace nada (void)
}
