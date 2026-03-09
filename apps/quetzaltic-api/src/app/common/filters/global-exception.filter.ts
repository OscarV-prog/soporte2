import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const correlationId = request.headers['x-correlation-id'];

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
            exception instanceof HttpException
                ? exception.getResponse()
                : 'Internal Server Error';

        const errorResponse = {
            success: false,
            error: {
                code: status,
                message: typeof message === 'string' ? message : (message as any).message,
                details: typeof message === 'object' ? message : undefined,
            },
            meta: {
                timestamp: new Date().toISOString(),
                correlationId,
            },
        };

        this.logger.error(
            `[${correlationId}] ${request.method} ${request.url} - Status: ${status} - Error: ${JSON.stringify(
                message
            )}`
        );

        response.status(status).json(errorResponse);
    }
}
