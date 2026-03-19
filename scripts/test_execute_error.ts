import axios from 'axios';

async function test() {
    const baseUrl = 'http://localhost:3333/api';
    const loginUrl = `${baseUrl}/auth/login`;
    const executeUrl = `${baseUrl}/operations/execute`;

    try {
        console.log('Logging in...');
        const loginRes = await axios.post(loginUrl, {
            username: 'admin',
            password: '12345678'
        });
        const token = loginRes.data.data.access_token;
        console.log('Logged in successfully.');

        const payload = {
            sql: "SELECT * FROM oscar_prueba WHERE id_Empresa = 1 AND id_Sucursal = 3 AND id_Almacen = 1",
            ticketId: "prueba123",
            data: {
                nb_AlmacenCorto: "Ligero"
            }
        };

        console.log('Executing operation...');
        const res = await axios.post(executeUrl, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Idempotency-Key': 'test-' + Date.now(),
                'X-Correlation-Id': 'test-corr-' + Date.now(),
                'X-Actor': 'test_script'
            }
        });

        console.log('Response:', JSON.stringify(res.data, null, 2));

    } catch (err: any) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Body:', JSON.stringify(err.response?.data, null, 2));
    }
}

test();
