import axios from 'axios';

async function main() {
  const API_URL = 'http://localhost:3333/api';
  try {
    // 1. Login
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      username: 'admin',
      password: '12345678'
    });
    const token = loginRes.data.access_token;
    console.log('Logged in successfully');

    // 2. Preview Users
    const previewRes = await axios.post(`${API_URL}/operations/preview`, {
      sql: 'SELECT * FROM users'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('--- USERS ---');
    console.log(JSON.stringify(previewRes.data.records, null, 2));

  } catch (error) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

main();
