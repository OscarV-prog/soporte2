import { Injectable, Logger } from '@nestjs/common';
import {
    MetadataResolver,
    GuardianPrimaryKeyViolationError,
    GuardianCompositePrimaryKeyNotSupportedError
} from '@quetzaltic/guardian-core';
import { PrismaService } from '../prisma.service';

interface CacheEntry {
    pkColumn: string;
    expiry: number;
}

@Injectable()
export class PrismaMetadataResolver implements MetadataResolver {
    private readonly logger = new Logger(PrismaMetadataResolver.name);
    private readonly cache = new Map<string, CacheEntry>();
    private readonly TTL_MS = 1000 * 60 * 5; // 5 minutos de cache

    constructor(private readonly prisma: PrismaService) { }

    async getPrimaryKeyColumn(schemaInput: string, tableInput: string): Promise<string | null> {
        const schema = schemaInput.toLowerCase();
        const table = tableInput.toLowerCase();
        const cacheKey = `${schema}.${table}`;
        const now = Date.now();

        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > now) {
            return cached.pkColumn;
        }

        try {
            const result = await this.prisma.$queryRawUnsafe<any[]>(`
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND lower(tc.table_schema) = $1
                  AND lower(tc.table_name) = $2;
            `, schema, table);

            if (result.length === 0) {
                throw new GuardianPrimaryKeyViolationError(table, 'N/A');
            }

            if (result.length > 1) {
                throw new GuardianCompositePrimaryKeyNotSupportedError(table);
            }

            const pkColumn = result[0].column_name.toLowerCase();

            this.cache.set(cacheKey, {
                pkColumn,
                expiry: now + this.TTL_MS,
            });

            return pkColumn;
        } catch (error) {
            if (error instanceof GuardianPrimaryKeyViolationError ||
                error instanceof GuardianCompositePrimaryKeyNotSupportedError) {
                throw error;
            }
            this.logger.error(`Error resolving PK for ${cacheKey}:`, error);
            return null;
        }
    }

    clearCache(): void {
        this.cache.clear();
        this.logger.log('Metadata cache cleared.');
    }
}
