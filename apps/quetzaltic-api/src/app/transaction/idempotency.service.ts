import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';


export interface IdempotencyResult {
    isDuplicate: boolean;
    response?: unknown;
}

@Injectable()
export class IdempotencyService {
    private readonly logger = new Logger(IdempotencyService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Valida una clave de idempotencia y bloquea la operación si es nueva o reintento fallido.
     * Rechaza si el hash de la solicitud no coincide con el registrado originalmente.
     */
    async validateAndLock(keyString: string, requestHash: string, correlationId: string): Promise<IdempotencyResult> {
        if (!keyString) {
            throw new BadRequestException('X-Idempotency-Key header is mandatory for this operation.');
        }

        const existing = await this.prisma.idempotencyKey.findUnique({
            where: { idempotencyKey: keyString },
        });

        if (existing) {
            // Regla: Rechazar si el mismo key tiene request_hash distinto
            if (existing.requestHash !== requestHash) {
                throw new BadRequestException('The payload associated with this Idempotency Key has changed.');
            }

            // Regla: Si existe y está SUCCESS -> retornar respuesta previa
            if (existing.status === 'SUCCESS') {
                this.logger.log(`Idempotency hit: returning previous SUCCESS result for key ${keyString}`);
                const response = existing.responseBody ? JSON.parse(existing.responseBody as any as string) : undefined;
                return { isDuplicate: true, response };
            }

            // Regla: Si existe y está PENDING -> 409 Conflict (Concurrency protection)
            if (existing.status === 'PENDING') {
                throw new ConflictException('An operation with this Idempotency Key is already in progress.');
            }

            // Regla: Si existe y está FAILED -> permitir reintento seguro (actualizar a PENDING)
            if (existing.status === 'FAILED') {
                await this.prisma.idempotencyKey.update({
                    where: { id: existing.id },
                    data: { status: 'PENDING', correlationId },
                });
                return { isDuplicate: false };
            }
        }

        // Regla: Si no existe -> registrar como PENDING
        await this.prisma.idempotencyKey.create({
            data: {
                idempotencyKey: keyString,
                requestHash,
                correlationId,
                status: 'PENDING',
            },
        });

        return { isDuplicate: false };
    }

    /**
     * Marca una clave de idempotencia como SUCCESS y almacena la respuesta.
     */
    async resolve(keyString: string, response: unknown): Promise<void> {
        await this.prisma.idempotencyKey.update({
            where: { idempotencyKey: keyString },
            data: {
                status: 'SUCCESS',
                responseBody: (response ? JSON.stringify(response) : null) as any
            },
        });
    }

    /**
     * Marca una clave de idempotencia como FAILED permitiendo reintentos futuros.
     */
    async reject(keyString: string): Promise<void> {
        try {
            await this.prisma.idempotencyKey.update({
                where: { idempotencyKey: keyString },
                data: { status: 'FAILED' },
            });
        } catch (err) {
            this.logger.error(`Failed to mark idempotency key ${keyString} as FAILED`, err);
        }
    }
}
