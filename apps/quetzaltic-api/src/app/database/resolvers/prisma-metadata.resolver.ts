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

    async getPrimaryKeyColumn(schemaInput: string, tableInput: string): Promise<string | string[] | null> {
        const schema = (schemaInput.toLowerCase() === 'prod' || !schemaInput) ? 'dbo' : schemaInput.toLowerCase();
        const table = tableInput.toLowerCase();
        const cacheKey = `${schema}.${table}`;
        const now = Date.now();

        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > now) {
            return cached.pkColumn.includes(',') ? cached.pkColumn.split(',') : cached.pkColumn;
        }

        try {
            let result = await this.prisma.$queryRawUnsafe<any[]>(`
                SELECT col.name AS COLUMN_NAME
                FROM sys.indexes i
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE i.is_primary_key = 1
                AND s.name = @p1
                AND t.name = @p2
                ORDER BY ic.key_ordinal;
            `, schema, table);

            if (result.length === 0) {
                // Fallback sin esquema
                const fallbackResult = await this.prisma.$queryRawUnsafe<any[]>(`
                    SELECT col.name AS COLUMN_NAME
                    FROM sys.indexes i
                    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
                    INNER JOIN sys.tables t ON i.object_id = t.object_id
                    WHERE i.is_primary_key = 1
                    AND t.name = @p1
                    ORDER BY ic.key_ordinal;
                `, table);
                if (fallbackResult.length > 0) result = fallbackResult;
            }

            if (result.length === 0) {
                this.logger.warn(`Primary key not found for table ${schema}.${table}. Falling back to default validation.`);
                return null;
            }

            const columns = result.map(r => r.COLUMN_NAME);
            const pkValue = columns.join(',');

            this.cache.set(cacheKey, {
                pkColumn: pkValue,
                expiry: now + this.TTL_MS,
            });

            return columns.length === 1 ? columns[0] : columns;
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
