import { Statement } from 'pgsql-ast-parser';

/**
 * Representa el resultado del parsing de SQL.
 * Encapsula el AST generado por pgsql-ast-parser.
 */
export type ParsedAst = Statement[];

/**
 * Interfaz para el resultado del parsing con metadatos.
 */
export interface ParseResult {
    ast: ParsedAst;
    query: string;
    metadata: {
        parsedAt: Date;
        statementCount: number;
    };
}
