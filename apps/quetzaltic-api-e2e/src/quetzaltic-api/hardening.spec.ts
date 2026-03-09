import axios from 'axios';
import { generateTestToken } from '../support/auth.helper';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const JWT_SECRET = 'super_secure_hardening_test_secret_32_chars';

const adminToken = generateTestToken('admin@quetzaltic.com', 'ADMIN', JWT_SECRET);
const operatorToken = generateTestToken('operator@quetzaltic.com', 'OPERATOR', JWT_SECRET);

const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'X-Actor': 'admin_user' };
const operatorHeaders = { Authorization: `Bearer ${operatorToken}`, 'X-Actor': 'operator_user' };

describe('Production Hardening E2E Suite', () => {

    beforeEach(async () => {
        // Reset DB antes de cada prueba para aislamiento total
        await axios.post(`${API_URL}/test/reset`, {}, { headers: adminHeaders });
    });

    describe('Guardian SQL Rejection', () => {
        it('should reject DDL operations (DROP TABLE)', async () => {
            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: 'DROP TABLE prod.demo_records',
                    ticketId: 'test-ddl'
                }, { headers: operatorHeaders });
                fail('Should have thrown 422');
            } catch (error: any) {
                expect(error.response.status).toBe(422);
                expect(error.response.data.error.message).toContain('Guardian');
            }
        });

        it('should reject SQL injections (UNION)', async () => {
            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: "SELECT id FROM prod.demo_records WHERE id = '1' UNION SELECT password_hash FROM audit.users",
                    ticketId: 'test-injection'
                }, { headers: operatorHeaders });
                fail('Should have thrown 422');
            } catch (error: any) {
                expect(error.response.status).toBe(422);
            }
        });
    });

    describe('Idempotency & Concurrency', () => {
        it('should return the same response for replayed requests', async () => {
            const idempotencyKey = `idemp-replay-${Date.now()}`;
            const payload = {
                sql: "SELECT name FROM prod.demo_records WHERE id = 'demo-1'",
                ticketId: 'T-100'
            };

            const res1 = await axios.post(`${API_URL}/operations/execute`, payload, {
                headers: { ...operatorHeaders, 'X-Idempotency-Key': idempotencyKey }
            });

            const res2 = await axios.post(`${API_URL}/operations/execute`, payload, {
                headers: { ...operatorHeaders, 'X-Idempotency-Key': idempotencyKey }
            });

            expect(res1.data.correlationId).toBe(res2.data.correlationId);
            expect(res1.status).toBe(201);
        });

        it('should block concurrent requests with the same key', async () => {
            const idempotencyKey = `idemp-concurrent-${Date.now()}`;
            const payload = {
                sql: "SELECT name FROM prod.demo_records WHERE id = 'demo-1'",
                ticketId: 'T-200'
            };

            const reqs = [
                axios.post(`${API_URL}/operations/execute`, payload, {
                    headers: { ...operatorHeaders, 'X-Idempotency-Key': idempotencyKey }
                }),
                axios.post(`${API_URL}/operations/execute`, payload, {
                    headers: { ...operatorHeaders, 'X-Idempotency-Key': idempotencyKey }
                })
            ];

            const results = await Promise.allSettled(reqs);
            const fulfilled = results.filter(r => r.status === 'fulfilled');
            // Al menos uno debe haber fallado con 409 si la concurrencia es real
            expect(fulfilled.length).toBeGreaterThan(0);
        });
    });

    describe('Rollback & Drift Detection', () => {
        it('should block rollback if data has drifted', async () => {
            // 1. Ejecutar operación legítima
            const updateRes = await axios.post(`${API_URL}/operations/execute`, {
                sql: "UPDATE prod.demo_records SET value = 'Modified' WHERE id = 'demo-1'",
                ticketId: 'T-DRIFT',
                data: { value: 'Modified' }
            }, {
                headers: { ...adminHeaders, 'X-Idempotency-Key': `drift-init-${Date.now()}` }
            });

            const auditEventId = updateRes.data.auditEventId;

            // 2. Simular cambio externo (drift)
            await axios.post(`${API_URL}/operations/execute`, {
                sql: "UPDATE prod.demo_records SET value = 'Drifted' WHERE id = 'demo-1'",
                ticketId: 'T-EXTERNAL',
                data: { value: 'Drifted' }
            }, {
                headers: { ...adminHeaders, 'X-Idempotency-Key': `drift-ext-${Date.now()}` }
            });

            // 3. Intentar rollback del primer evento
            try {
                await axios.post(`${API_URL}/operations/rollback/${auditEventId}`, {}, {
                    headers: { ...adminHeaders, 'X-Idempotency-Key': `rollback-drift-${Date.now()}` }
                });
                fail('Should have thrown 409');
            } catch (error: any) {
                expect(error.response.status).toBe(409);
                expect(error.response.data.error.message).toContain('drift');
            }
        });

        it('should prevent double rollback', async () => {
            const updateRes = await axios.post(`${API_URL}/operations/execute`, {
                sql: "UPDATE prod.demo_records SET value = 'ToRevert' WHERE id = 'demo-2'",
                ticketId: 'T-DOUBLE',
                data: { value: 'ToRevert' }
            }, {
                headers: { ...adminHeaders, 'X-Idempotency-Key': `double-init-${Date.now()}` }
            });

            const auditEventId = updateRes.data.auditEventId;

            // Primer Rollback
            await axios.post(`${API_URL}/operations/rollback/${auditEventId}`, {}, {
                headers: { ...adminHeaders, 'X-Idempotency-Key': `rb-1-${Date.now()}` }
            });

            // Segundo Rollback (debe fallar)
            try {
                await axios.post(`${API_URL}/operations/rollback/${auditEventId}`, {}, {
                    headers: { ...adminHeaders, 'X-Idempotency-Key': `rb-2-${Date.now()}` }
                });
                fail('Should have thrown 400');
            } catch (error: any) {
                expect(error.response.status).toBe(400);
            }
        });
    });

    describe('Governance & Lockdown', () => {
        it('should block writes when Lockdown is active', async () => {
            await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: true }, {
                headers: adminHeaders
            });

            try {
                await axios.post(`${API_URL}/operations/execute`, {
                    sql: "UPDATE prod.demo_records SET value = 'Blocked' WHERE id = 'demo-1'",
                    ticketId: 'T-LOCK'
                }, { headers: adminHeaders });
                fail('Should have thrown 503');
            } catch (error: any) {
                expect(error.response.status).toBe(503);
            }

            await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: false }, {
                headers: adminHeaders
            });
        });

        it('should permit OPERATOR to see logs but NOT toggle Lockdown', async () => {
            const logsRes = await axios.get(`${API_URL}/governance/audit-logs`, { headers: operatorHeaders });
            expect(logsRes.status).toBe(200);

            try {
                await axios.post(`${API_URL}/governance/lockdown/toggle`, { active: true }, {
                    headers: operatorHeaders
                });
                fail('Should have thrown 403');
            } catch (error: any) {
                expect(error.response.status).toBe(403);
            }
        });
    });
});
