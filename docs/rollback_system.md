# Quetzaltic Rollback & Reversion System

Este documento técnico explica cómo funciona el sistema de reversión "deshacer" (undo) implementado en Quetzaltic, optimizado para **Microsoft SQL Server**.

## 🧠 El Problema: El `ROLLBACK` de SQL Tradicional
En un sistema de base de datos estándar, un `ROLLBACK` solo funciona si:
1.  La transacción aún está abierta (`BEGIN TRANSACTION`).
2.  No ha ocurrido un error fatal de red.
3.  El error se detecta inmediatamente.

En escenarios de soporte real, los errores se detectan **minutos, horas o días** después de que la transacción fue confirmada (`COMMIT`). Un `ROLLBACK` tradicional es inútil en este punto.

## 🛠️ Nuestra Solución: Reversión por Estado (Inverse Update)

Quetzaltic usa un enfoque de **Snapshot-Based State Reversion**. No intentamos "deshacer" la transacción; en su lugar, **"sobrescribimos" el estado actual con el estado previo**.

### 1. Captura de Snapshot (Auditoría)
Cada vez que el sistema detecta una operación de escritura (gracias al **Guardian Pipeline**), realiza un paso previo:
-   Extrae el registro actual mediante un `SELECT`.
-   Lo serializa a un JSON inmutable.
-   Lo guarda en la columna `snapshot_before` de la tabla `audit_events`.

### 2. Ejecución del Rollback
Cuando un usuario presiona el botón "Revertir" en la UI:
1.  **Parsing:** El sistema deserializa el objeto `snapshot_before`.
2.  **SQL Generation:** Se construye dinámicamente una sentencia `UPDATE` que contiene todas las columnas detectadas en el snapshot.
3.  **SQL Server Optimization:** 
    -   Se limpian nombres de columnas conflictivos.
    -   Se escapan caracteres especiales en strings (`'` -> `''`).
    -   Se normalizan tipos de datos (Boolean a `0/1` para campos `Bit`).
4.  **Raw Execution:** Se envía el comando mediante `executeRawUnsafe` para asegurar que el dato sea reintegrado sin interferencia de capas de abstracción (ORM).

## 🛡️ Medidas de Seguridad

### Idempotencia
Cada rollback lleva una `X-Idempotency-Key`. Esto garantiza que, si dos administradores intentan revertir el mismo evento al mismo tiempo, SQL Server solo aplicará la reversión una vez.

### Reversión Encadenada
Cada vez que se aplica un rollback, se genera un **nuevo evento de auditoría** con el prefijo `RB-`. Esto significa que el historial de auditoría es siempre un rastro creciente: nunca borramos el pasado, solo escribimos el futuro para que se parezca al pasado.

## 📂 Archivos Clave
-   **Log de Auditoría:** `apps/quetzaltic-api/src/app/audit/audit-store.service.ts`
-   **Motor de Reversión:** `apps/quetzaltic-api/src/app/operations/operations.controller.ts`
-   **Esquema de Datos:** `apps/quetzaltic-api/prisma/schema.prisma`
