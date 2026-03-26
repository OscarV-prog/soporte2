const axios = require('axios');

async function runTest() {
    const API_URL = 'http://localhost:3334/api';
    const credentials = { username: 'admin', password: '123' + '45678' }; // admin / 12345678

    try {
        console.log('🧪 [QA] Starting Performance Verification...');
        
        // 1. Login
        console.log('🔑 Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, credentials);
        const token = loginRes.data.access_token;
        console.log('✅ Logged in successfully.');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'X-Idempotency-Key': `qa_perf_${Date.now()}`,
            'X-Correlation-Id': `qa_corr_${Date.now()}`,
            'Content-Type': 'application/json'
        };

        // 2. Preview to see count
        console.log('🔍 Previewing massive change on demo_records...');
        const sql = "SELECT * FROM demo_records";
        const previewRes = await axios.post(`${API_URL}/operations/preview`, { sql }, { headers });
        const count = previewRes.data.count;
        console.log(`📊 Records to affect: ${count}`);

        if (count < 100) {
            console.warn('⚠️ Not enough records for a "massive" test (need > 100).');
        }

        // 3. Execute Massive Change
        console.log('🚀 Executing massive update (This is where the bottleneck happens)...');
        const executeSql = "UPDATE demo_records SET de_Descripcion = 'QA Verified ' + CAST(GETDATE() AS VARCHAR)";
        
        const start = Date.now();
        try {
            const executeRes = await axios.post(`${API_URL}/operations/execute`, { 
                sql: executeSql,
                ticketId: 'QA-PERF-001',
                data: {} // Empty data since it's a raw UPDATE in the orchestrator logic or it will be parsed
            }, { 
                headers,
                timeout: 40000 // 40s timeout for axios to see the 35s server timeout
            });
            const duration = (Date.now() - start) / 1000;
            console.log(`✅ SUCCESS! Execution took ${duration}s`);
            console.log('Result:', JSON.stringify(executeRes.data, null, 2));
        } catch (err) {
            const duration = (Date.now() - start) / 1000;
            console.error(`❌ FAILURE after ${duration}s`);
            if (err.response) {
                console.error(`Status: ${err.response.status}`);
                console.error('Error Data:', JSON.stringify(err.response.data, null, 2));
            } else {
                console.error('Error Message:', err.message);
            }
        }

    } catch (error) {
        console.error('💥 [QA CRITICAL] Test failed prematurely:', error.message);
    }
}

runTest();
