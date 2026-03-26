const axios = require('axios');

async function runTest() {
    const API_URL = 'http://localhost:3800/api';

    try {
        console.log('🧪 [QA] Starting Performance Verification (Unauthenticated)...');
        
        const headers = {
            'X-Idempotency-Key': `qa_perf_unauth_${Date.now()}`,
            'X-Correlation-Id': `qa_corr_unauth_${Date.now()}`,
            'Content-Type': 'application/json'
        };

        // 1. Preview to see count
        console.log('🔍 Previewing massive change on demo_records...');
        const sql = "SELECT * FROM demo_records";
        const previewRes = await axios.post(`${API_URL}/operations/preview`, { sql }, { headers });
        const count = previewRes.data.count;
        console.log(`📊 Records to affect: ${count}`);

        // 2. Execute Massive Change
        console.log('🚀 Executing massive update (This is where the bottleneck happens)...');
        const executeSql = "UPDATE demo_records SET de_Descripcion = 'QA Verified ' + CAST(GETDATE() AS VARCHAR)";
        
        const start = Date.now();
        try {
            const executeRes = await axios.post(`${API_URL}/operations/execute`, { 
                sql: executeSql,
                ticketId: 'QA-PERF-001',
                data: {}
            }, { 
                headers,
                timeout: 60000 // 60s timeout for axios
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
