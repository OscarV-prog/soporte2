import { Injectable, Logger } from '@nestjs/common';
import { ResourcePolicyResolver, GuardianResourceNotAllowedError } from '@quetzaltic/guardian-core';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaResourcePolicyResolver implements ResourcePolicyResolver {
    private readonly logger = new Logger(PrismaResourcePolicyResolver.name);
    private readonly cache = new Map<string, { allowed: boolean; expiry: number }>();
    private readonly TTL_MS = 1000 * 60 * 5; // 5 minutos de cache

    constructor(private readonly prisma: PrismaService) { }

    async authorizeResource(schema: string, table: string, column?: string): Promise<void> {
        const resourcePath = column ? `${schema}.${table}.${column}` : `${schema}.${table}`;
        const cacheKey = resourcePath.toLowerCase();
        const now = Date.now();

        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > now) {
            if (!cached.allowed) throw new GuardianResourceNotAllowedError(resourcePath);
            return;
        }

        try {
            const isAllowed = await this.checkPersistedWhitelist(schema, table, column);

            this.cache.set(cacheKey, {
                allowed: isAllowed,
                expiry: now + this.TTL_MS,
            });

            if (!isAllowed) {
                throw new GuardianResourceNotAllowedError(resourcePath);
            }
        } catch (error) {
            if (error instanceof GuardianResourceNotAllowedError) {
                throw error;
            }
            this.logger.error(`Error authorizing resource ${resourcePath}:`, error);
            throw new GuardianResourceNotAllowedError(resourcePath);
        }
    }

    private async checkPersistedWhitelist(schemaInput: string, tableInput: string, column?: string): Promise<boolean> {
        try {
            const schema = (schemaInput.toLowerCase() === 'prod' || !schemaInput) ? 'dbo' : schemaInput.toLowerCase();
            const table = tableInput.toLowerCase();
            const col = column?.toLowerCase() || null;

            const result = await this.prisma.$queryRawUnsafe<any[]>(`
                SELECT COUNT(*) as [count]
                FROM guardian_whitelist
                WHERE LOWER(schema_name) = @p1 
                  AND LOWER(table_name) = @p2
                  AND (column_name IS NULL OR LOWER(column_name) = @p3);
            `, schema, table, col);

            const count = Number(Object.values(result[0])[0]);
            this.logger.log(`Whitelist check for ${schema}.${table}.${col}: ${count} matches`);
            return count > 0;
        } catch (e) {
            this.logger.warn(`Guardian whitelist check failed for ${schemaInput}.${tableInput}:`, e);
            return false;
        }
    }

    clearCache(): void {
        this.cache.clear();
        this.logger.log('Resource policy cache cleared.');
    }
}
