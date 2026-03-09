import { parse } from 'pgsql-ast-parser';
import { GuardianParseError } from '../errors/guardian-parse.error';
import { ParsedAst } from '../types/parsed-ast.types';

/**
 * Parsea una consulta SQL de PostgreSQL a su correspondiente Árbol de Sintaxis Abstracta (AST).
 */
export function parseSqlToAst(query: string): ParsedAst {
    if (!query || query.trim().length === 0) {
        throw new GuardianParseError(query, new Error('Query is empty or null'));
    }

    try {
        return parse(query);
    } catch (error: unknown) {
        throw new GuardianParseError(query, error as Error);
    }
}
