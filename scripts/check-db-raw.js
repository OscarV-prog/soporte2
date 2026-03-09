
const { Client } = require('pg');

async function checkUsers() {
    const client = new Client({
        connectionString: 'postgresql://postgres:postgres_password@localhost:5432/quetzaltic_test'
    });

    try {
        await client.connect();
        const res = await client.query('SELECT * FROM audit.users');
        console.log('Users found in DB:');
        console.table(res.rows.map(r => ({ id: r.id, email: r.email, role: r.role })));
    } catch (e) {
        console.error('Database connection failed:', e.message);
    } finally {
        await client.end();
    }
}

checkUsers();
