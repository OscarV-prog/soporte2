/**
 * Contrato agnóstico para la validación de autorización de recursos (ACL).
 * Permite al Guardián verificar si una tabla o columna está explícitamente permitida.
 */
export interface ResourcePolicyResolver {
    /**
     * Verifica si el acceso a un recurso específico está autorizado.
     * 
     * @param schema El esquema de la base de datos (ej. 'prod').
     * @param table El nombre de la tabla.
     * @param column Opcional. El nombre de la columna específica.
     * @throws GuardianResourceNotAllowedError si el recurso no está en la lista blanca.
     */
    authorizeResource(schema: string, table: string, column?: string): Promise<void>;
}
