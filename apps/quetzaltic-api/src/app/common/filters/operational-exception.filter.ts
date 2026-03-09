import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class OperationalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(OperationalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'An unexpected operational error occurred.';
        let code = 'INTERNAL_ERROR';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse() as any;
            message = typeof res === 'string' ? res : (res.message || message);
        }
        // Mapeo de errores de Idempotencia / Conflictos (409)
        else if (exception instanceof Error && exception.name === 'ConflictException') {
            status = HttpStatus.CONFLICT;
            message = exception.message;
            code = 'CONFLICT';
        }
        // Mapeo de errores de Prisma (Integridad -> 422)
        else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            if (['P2002', 'P2003', 'P2004'].includes(exception.code)) {
                status = HttpStatus.UNPROCESSABLE_ENTITY;
                message = 'Database integrity violation (FK or unique constraint failure).';
                code = 'INTEGRITY_VIOLATION';
            }
        }
        // Drift / Guardian Errors (podrían ser 400 o 403 dependiendo, pero mapeamos a 409 si es drift)
        else if (exception instanceof Error && exception.message.includes('drift')) {
            status = HttpStatus.CONFLICT;
            message = 'Data drift detected during transaction.';
            code = 'DRIFT_ERROR';
        }

        // Rate Limit (429) -> Generalmente lanzado por ThrottlerGuard (HttpException 429)
        if (status === HttpStatus.TOO_MANY_REQUESTS) {
            code = 'RATE_LIMIT_EXCEEDED';
        }

        // Fail-Closed / Service Unavailable (503)
        if (status === HttpStatus.SERVICE_UNAVAILABLE) {
            code = 'SERVICE_UNAVAILABLE';
        }

        this.logger.error(`[${code}] ${message}`, (exception as Error)?.stack);

        response.status(status).json({
            statusCode: status,
            errorCode: code,
            message: message,
            timestamp: new Date().toISOString(),
        });
    }
}
