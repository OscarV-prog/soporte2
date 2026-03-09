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

    private async checkPersistedWhitelist(schema: string, table: string, column?: string): Promise<boolean> {
        try {
            // Usamos el modelo GuardianWhitelist si es posible, o raw query si preferimos consistencia con lo anterior
            const result = await this.prisma.$queryRawUnsafe<any[]>(`
                SELECT COUNT(*) as count 
                FROM audit.guardian_whitelist
                WHERE lower(schema_name) = $1 
                  AND lower(table_name) = $2
                  AND (column_name IS NULL OR lower(column_name) = $3);
            `, schema.toLowerCase(), table.toLowerCase(), column?.toLowerCase() || null);

            return Number(result[0].count) > 0;
        } catch (e) {
            this.logger.warn('Guardian whitelist table not found or inaccessible. Denying all access.');
            return false;
        }
    }

    clearCache(): void {
        this.cache.clear();
        this.logger.log('Resource policy cache cleared.');
    }
}
