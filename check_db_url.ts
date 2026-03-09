import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'apps/quetzaltic-api/.env' });

const s = z.string().url();

console.log('DATABASE_URL:', process.env.DATABASE_URL);
const res = s.safeParse(process.env.DATABASE_URL);
if (!res.success) {
    console.log('INVALID:', JSON.stringify(res.error.format(), null, 2));
} else {
    console.log('VALID');
}
