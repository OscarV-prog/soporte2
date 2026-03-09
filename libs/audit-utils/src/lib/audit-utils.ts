import { createHash } from 'crypto';

/**
 * Convierte un objeto a una cadena JSON con las claves ordenadas alfabéticamente.
 * Esto garantiza que la representación en cadena sea determinística para auditoría y hashing.
 */
export function deterministicStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }

  const allKeys = Object.keys(obj as object).sort();
  const result: Record<string, unknown> = {};

  for (const key of allKeys) {
    const value = (obj as Record<string, unknown>)[key];
    result[key] = (value !== null && typeof value === 'object')
      ? JSON.parse(deterministicStringify(value))
      : value;
  }

  return JSON.stringify(result);
}

/**
 * Calcula un hash determinístico para una solicitud basado en SQL normalizado y metadatos.
 * Utilizado para la validación de idempotencia.
 */
export function computeRequestHash(sql: string, ticketId: string | undefined, actor: string): string {
  // Normalización básica del SQL (colapsar espacios, trim)
  const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  const content = `${normalizedSql}|${ticketId || ''}|${actor}`;
  return createHash('sha256').update(content).digest('hex');
}
