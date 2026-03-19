/**
 * Contrato agnóstico para la resolución de metadatos de la base de datos.
 * Permite al Guardián consultar detalles estructurales sin depender de un ORM específico.
 */
export interface MetadataResolver {
    /**
     * Obtiene el nombre de la columna que actúa como Primary Key para una tabla dada.
     * 
     * @param schema El esquema de la base de datos (ej. 'prod').
     * @param table El nombre de la tabla.
     * @returns El nombre de la columna PK o null si no se encuentra/no tiene.
     */
    getPrimaryKeyColumn(schema: string, table: string): Promise<string | string[] | null>;
}
