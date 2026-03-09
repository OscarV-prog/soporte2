import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const correlationId = req.header(CORRELATION_ID_HEADER) || uuidv4();

        // Inject into request for downstream usage
        req.headers[CORRELATION_ID_HEADER] = correlationId;

        // Inject into response header
        res.set(CORRELATION_ID_HEADER, correlationId);

        next();
    }
}
