import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: 'apps/quetzaltic-api/.env' });

const envSchema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().optional(),
    RATE_LIMIT_TTL: z.coerce.number().optional(),
    RATE_LIMIT_LIMIT: z.coerce.number().optional(),
    DATABASE_URL: z.string().url().optional(),
    PROD_DB_URL: z.string().url().optional(),
    AUDIT_DB_URL: z.string().url().optional(),
    JWT_SECRET: z.string().optional(),
});

// Let's see what safeParse thinks of each
const config = {
    DATABASE_URL: process.env.DATABASE_URL,
    PROD_DB_URL: process.env.PROD_DB_URL,
    AUDIT_DB_URL: process.env.AUDIT_DB_URL,
    JWT_SECRET: process.env.JWT_SECRET,
};

console.log('Testing individual variables:');
for (const [key, value] of Object.entries(config)) {
    const s = z.string().url();
    if (key === 'JWT_SECRET') {
        const res = z.string().min(32).safeParse(value);
        console.log(`${key}: ${value} -> ${res.success ? 'VALID' : 'INVALID'}`);
        if (!res.success) console.log(JSON.stringify(res.error.format(), null, 2));
    } else {
        const res = s.safeParse(value);
        console.log(`${key}: ${value} -> ${res.success ? 'VALID' : 'INVALID'}`);
        if (!res.success) console.log(JSON.stringify(res.error.format(), null, 2));
    }
}
