import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { LockdownService } from '../../governance/lockdown.service';

@Injectable()
export class LockdownInterceptor implements NestInterceptor {
    constructor(private readonly lockdownService: LockdownService) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const http = context.switchToHttp();
        const request = http.getRequest();

        // Solo bloqueamos escrituras (POST, PUT, PATCH, DELETE)
        const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

        if (isWriteOperation) {
            const isLockdown = await this.lockdownService.isActive();
            if (isLockdown) {
                throw new ServiceUnavailableException({
                    errorCode: 'SYSTEM_IN_LOCKDOWN',
                    message: 'Global Security Lockdown Active: Write operations are temporarily disabled by administrators.',
                    statusCode: 503,
                });
            }
        }

        return next.handle();
    }
}
