
import axios from 'axios';

async function testLogin() {
    try {
        console.log('Testing admin login fallback...');
        const res = await axios.post('http://localhost:3333/api/auth/login', {
            username: 'admin',
            password: '12345678'
        });

        console.log('Login Response Status:', res.status);
        const token = res.data.access_token;
        console.log('Received Token Length:', token.length);

        const payloadBase64 = token.split('.')[1];
        const payloadDecoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
        console.log('Decoded Payload:', payloadDecoded);
    } catch (e: any) {
        console.error('Login Failed:', e.response?.data || e.message);
    }
}

testLogin();
