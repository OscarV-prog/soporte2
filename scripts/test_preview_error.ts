import axios from 'axios';

async function test() {
    const baseUrl = 'http://localhost:3333/api';
    const loginUrl = `${baseUrl}/auth/login`;
    const previewUrl = `${baseUrl}/operations/preview`;

    try {
        console.log('Logging in...');
        const loginRes = await axios.post(loginUrl, {
            username: 'admin',
            password: '12345678'
        });
        const token = loginRes.data.data.access_token;
        console.log('Logged in successfully.');

        const payload = {
            sql: "SELECT * FROM oscar_prueba WHERE id_Empresa = 1 AND id_Sucursal = 3 AND id_Almacen = 1"
        };

        console.log('Executing preview...');
        const res = await axios.post(previewUrl, payload, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Response:', JSON.stringify(res.data, null, 2));

    } catch (err: any) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Body:', JSON.stringify(err.response?.data, null, 2));
    }
}

test();
