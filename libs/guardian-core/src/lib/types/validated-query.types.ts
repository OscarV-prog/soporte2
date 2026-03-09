import { ParsedAst } from './parsed-ast.types';

/**
 * Representa una consulta que ha pasado satisfactoriamente todas las capas de seguridad del Guardián.
 */
export interface ValidatedQuery {
    /**
     * El AST validado.
     */
    readonly ast: ParsedAst;

    /**
     * Nombre de la tabla principal detectada.
     */
    readonly table: string;

    /**
     * Nombre de la columna de la Primary Key usada en el filtro.
     */
    readonly pkColumn: string;

    /**
     * Valor del filtro para la PK.
     * Representado como unknown para forzar casting seguro en el backend.
     */
    readonly pkValue: unknown;

    /**
     * Timestamp de la validación.
     */
    readonly validatedAt: Date;
}
