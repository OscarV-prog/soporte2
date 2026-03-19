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
     * Nombre de la columna o columnas de la Primary Key usada en el filtro.
     */
    readonly pkColumn: string | string[];

    /**
     * Valor o valores del filtro para la PK.
     * Representado como unknown para forzar casting seguro en el backend.
     */
    readonly pkValue: unknown | unknown[];

    /**
     * Objeto de filtro compatible con Prisma para búsquedas bulk.
     */
    readonly prismaWhere?: Record<string, any>;

    /**
     * Timestamp de la validación.
     */
    readonly validatedAt: Date;
}
