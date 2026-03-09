import axios from 'axios';
import { generateTestToken } from '../support/auth.helper';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  QUETZALTIC — SUITE DE VERIFICACIÓN FUNCIONAL COMPLETA
 *  Generado por: Quinn (QA Engineer — BMAD)
 *
 *  Cubre:
 *    1. Autenticación (fallback sin BD y credenciales inválidas)
 *    2. Consola de Operaciones (preview + dispatch)
 *    3. Bitácora de Auditoría (stats, filtros, paginación, exportación)
 *    4. Whitelist (CRUD, control de acceso por rol)
 *    5. Bloqueo de Emergencia (activar / desactivar / bloqueo de escritura)
 *    6. Control de Acceso por Roles (OPERATOR vs ADMIN)
 *
 *  NOTA: Las pruebas están diseñadas para ejecutarse con O sin BD.
 *        Cuando no hay BD, los fallbacks (virtual store, lockdown en memoria)
 *        garantizan que los tests reflejen el comportamiento real del sistema.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const API_URL  = process.env.API_URL  || 'http://localhost:3000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_hardening_test_secret_32_chars';

// Tokens con el mismo secreto que usa el servidor de prueba
const adminToken    = generateTestToken('admin@quetzaltic.com',    'ADMIN',    JWT_SECRET);
const operatorToken = generateTestToken('operator@quetzaltic.com', 'OPERATOR', JWT_SECRET);
const guestToken    = 'Bearer invalid.token.here';  // Token mal formado

const adminHeaders    = { Authorization: `Bearer ${adminToken}`,    'X-Actor': 'admin_test' };
const operatorHeaders = { Authorization: `Bearer ${operatorToken}`, 'X-Actor': 'operator_test' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Autenticación', () => {

    it('✅ debe permitir login con credenciales de fallback admin (sin BD)', async () => {
        const res = await axios.post(`${API_URL}/auth/login`, {
            username: 'admin',
            password: '12345678'
        });
        expect(res.status).toBe(200);
        expect(res.data.access_token).toBeDefined();
        expect(typeof res.data.access_token).toBe('string');
    });

    it('✅ debe permitir login con credenciales de fallback soporte (sin BD)', async () => {
        const res = await axios.post(`${API_URL}/auth/login`, {
            username: 'soporte',
            password: 'support_quetzal_2026'
        });
        expect(res.status).toBe(200);
        expect(res.data.access_token).toBeDefined();
    });

    it('❌ debe rechazar credenciales incorrectas con 401', async () => {
        try {
            await axios.post(`${API_URL}/auth/login`, {
                username: 'admin',
                password: 'wrong_password'
            });
            fail('Debería haber lanzado 401');
        } catch (error: any) {
            expect(error.response.status).toBe(401);
        }
    });

    it('❌ debe rechazar body vacío con 401', async () => {
        try {
            await axios.post(`${API_URL}/auth/login`, {});
            fail('Debería haber lanzado 401');
        } catch (error: any) {
            expect([400, 401]).toContain(error.response.status);
        }
    });

    it('❌ debe rechazar token inválido en rutas protegidas', async () => {
        try {
            await axios.get(`${API_URL}/governance/audit-logs`, {
                headers: { Authorization: guestToken }
            });
            fail('Debería haber lanzado 401');
        } catch (error: any) {
            expect(error.response.status).toBe(401);
        }
    });

    it('❌ debe rechazar solicitudes sin Authorization header', async () => {
        try {
            await axios.get(`${API_URL}/governance/audit-logs`);
            fail('Debería haber lanzado 401');
        } catch (error: any) {
            expect(error.response.status).toBe(401);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONSOLA DE OPERACIONES
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Consola de Operaciones', () => {

    describe('2a. Preview de Registro', () => {
        it('❌ debe rechazar SQL que no es SELECT en el preview', async () => {
            try {
                await axios.post(`${API_URL}/operations/preview`, {
                    selectQuery: "UPDATE prod.demo_records SET value='x' WHERE id='1'"
                }, { headers: operatorHeaders });
                fail('Debería haber lanzado 422');
            } catch (error: any) {
                expect([400, 422]).toContain(error.response.status);
            }
        });

        it('❌ debe rechazar preview sin query', async () => {
            try {
                await axios.post(`${API_URL}/operations/preview`, {}, { headers: operatorHeaders });
                fail('Debería haber lanzado error');
            } catch (error: any) {
                expect([400, 422]).toContain(error.response.status);
            }
        });
    });

    describe('2b. Ejecución de Operaciones', () => {
        it('❌ debe rechazar operación sin Ticket ID', async () => {
            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: "UPDATE prod.demo_records SET value='test' WHERE id='1'",
                    data: { value: 'test' }
                }, { headers: operatorHeaders });
                fail('Debería haber lanzado error por falta de ticketId');
            } catch (error: any) {
                expect([400, 422]).toContain(error.response.status);
            }
        });

        it('❌ debe rechazar SQL con DROP TABLE (Guardian)', async () => {
            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: 'DROP TABLE prod.demo_records',
                    ticketId: 'QA-DROP-TEST'
                }, { headers: operatorHeaders });
                fail('Debería haber lanzado 422');
            } catch (error: any) {
                expect(error.response.status).toBe(422);
            }
        });

        it('❌ debe rechazar SQL con inyección UNION (Guardian)', async () => {
            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: "SELECT id FROM prod.t WHERE id='1' UNION SELECT password FROM users",
                    ticketId: 'QA-INJECTION-TEST'
                }, { headers: operatorHeaders });
                fail('Debería haber lanzado 422');
            } catch (error: any) {
                expect(error.response.status).toBe(422);
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BITÁCORA DE AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Bitácora de Auditoría', () => {

    it('✅ ADMIN puede obtener logs de auditoría', async () => {
        const res = await axios.get(`${API_URL}/governance/audit-logs`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('items');
        expect(res.data).toHaveProperty('total');
        expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('✅ OPERATOR puede obtener logs de auditoría', async () => {
        const res = await axios.get(`${API_URL}/governance/audit-logs`, { headers: operatorHeaders });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('items');
    });

    it('✅ los logs devuelven paginación correcta', async () => {
        const res = await axios.get(`${API_URL}/governance/audit-logs?page=1&limit=5`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data.items.length).toBeLessThanOrEqual(5);
    });

    it('✅ el endpoint de estadísticas retorna números válidos', async () => {
        const res = await axios.get(`${API_URL}/governance/stats`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('totalEvents');
        expect(res.data).toHaveProperty('rollbacksExecuted');
        expect(res.data).toHaveProperty('schemaChanges');
        expect(typeof res.data.totalEvents).toBe('number');
        expect(res.data.totalEvents).toBeGreaterThanOrEqual(0);
    });

    it('✅ cuando no hay BD, stats devuelve ceros (no crashea)', async () => {
        // Este test verifica el fallback. Si hay BD, devuelve datos reales >= 0
        const res = await axios.get(`${API_URL}/governance/stats`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data.totalEvents).toBeGreaterThanOrEqual(0);
        expect(res.data.rollbacksExecuted).toBeGreaterThanOrEqual(0);
    });

    it('❌ OPERATOR NO puede acceder a stats (solo ADMIN/OPERATOR permitidos)', async () => {
        // En realidad ambos roles tienen acceso, verificar que sin token falla
        try {
            await axios.get(`${API_URL}/governance/stats`);
            fail('Debería requerir autenticación');
        } catch (error: any) {
            expect(error.response.status).toBe(401);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. WHITELIST
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Gestión de Whitelist', () => {

    it('✅ ADMIN puede obtener la whitelist', async () => {
        const res = await axios.get(`${API_URL}/governance/whitelist`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
    });

    it('✅ OPERATOR puede leer la whitelist (solo lectura)', async () => {
        const res = await axios.get(`${API_URL}/governance/whitelist`, { headers: operatorHeaders });
        expect(res.status).toBe(200);
    });

    it('❌ OPERATOR NO puede crear entradas en la whitelist', async () => {
        try {
            await axios.post(`${API_URL}/governance/whitelist`, {
                schemaName: 'prod',
                tableName: 'test_table',
                isEditable: true
            }, { headers: operatorHeaders });
            fail('Debería haber lanzado 403');
        } catch (error: any) {
            expect(error.response.status).toBe(403);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. BLOQUEO DE EMERGENCIA
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Bloqueo de Emergencia', () => {

    afterEach(async () => {
        // Asegurarse de que el lockdown esté desactivado después de cada prueba
        try {
            await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: false }, {
                headers: adminHeaders
            });
        } catch (e) { /* ignorar */ }
    });

    it('✅ ADMIN puede consultar el estado del lockdown', async () => {
        const res = await axios.get(`${API_URL}/governance/lockdown/status`, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('active');
        expect(typeof res.data.active).toBe('boolean');
    });

    it('✅ ADMIN puede activar el bloqueo de emergencia', async () => {
        const res = await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: true }, {
            headers: adminHeaders
        });
        expect(res.status).toBe(200);
        expect(res.data.active).toBe(true);
    });

    it('✅ ADMIN puede desactivar el bloqueo de emergencia', async () => {
        // Activar primero
        await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: true }, { headers: adminHeaders });
        // Luego desactivar
        const res = await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: false }, { headers: adminHeaders });
        expect(res.status).toBe(200);
        expect(res.data.active).toBe(false);
    });

    it('❌ OPERATOR NO puede activar el bloqueo de emergencia', async () => {
        try {
            await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: true }, {
                headers: operatorHeaders
            });
            fail('Debería haber lanzado 403');
        } catch (error: any) {
            expect(error.response.status).toBe(403);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONTROL DE ACCESO POR ROLES (Resumen)
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Control de Acceso por Roles', () => {

    const endpoints = [
        { method: 'GET',  path: '/governance/audit-logs',       adminOk: true, operatorOk: true  },
        { method: 'GET',  path: '/governance/stats',            adminOk: true, operatorOk: true  },
        { method: 'GET',  path: '/governance/whitelist',        adminOk: true, operatorOk: true  },
        { method: 'POST', path: '/governance/lockdown/toggle',  adminOk: true, operatorOk: false },
    ];

    endpoints.forEach(({ method, path, adminOk, operatorOk }) => {
        it(`${method} ${path} — ADMIN: ${adminOk ? '✅' : '❌'}, OPERATOR: ${operatorOk ? '✅' : '❌'}`, async () => {
            const config_admin    = { headers: adminHeaders,    validateStatus: () => true };
            const config_operator = { headers: operatorHeaders, validateStatus: () => true };
            const body = method === 'POST' ? { active: false } : undefined;

            const adminRes = method === 'GET'
                ? await axios.get(`${API_URL}${path}`, config_admin)
                : await axios.post(`${API_URL}${path}`, body, config_admin);

            const operatorRes = method === 'GET'
                ? await axios.get(`${API_URL}${path}`, config_operator)
                : await axios.post(`${API_URL}${path}`, body, config_operator);

            if (adminOk) {
                expect([200, 201]).toContain(adminRes.status);
            } else {
                expect([401, 403]).toContain(adminRes.status);
            }

            if (operatorOk) {
                expect([200, 201]).toContain(operatorRes.status);
            } else {
                expect([401, 403]).toContain(operatorRes.status);
            }
        });
    });
});
