import { z } from 'zod';

export const envSchema = z.object({
    NODE_ENV: z.enum(['dev', 'qa', 'prod', 'test', 'production']).default('dev'),
    PORT: z.coerce.number().default(3000),
    RATE_LIMIT_TTL: z.coerce.number().default(60000), // ms (1 minute)
    RATE_LIMIT_LIMIT: z.coerce.number().default(10),
    DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid connection string' }),
    PROD_DB_URL: z.string().url({ message: 'PROD_DB_URL must be a valid connection string' }),
    AUDIT_DB_URL: z.string().url({ message: 'AUDIT_DB_URL must be a valid connection string' }),
    JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters long' }),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
    const result = envSchema.safeParse(config);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(JSON.stringify(result.error.format(), null, 2));
        throw new Error('Config validation failed');
    }

    return result.data;
}
