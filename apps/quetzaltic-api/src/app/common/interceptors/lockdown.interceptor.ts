import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
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

        // Las rutas de autenticación NUNCA se bloquean (el admin debe poder entrar para desactivar el lockdown)
        const isAuthRoute = (request.url as string).includes('/auth/');

        if (isWriteOperation && !isAuthRoute) {
            const isLockdown = await this.lockdownService.isActive();
            if (isLockdown) {
                // QA BYPASS: TEMPORARILY DISABLED
                // throw new ServiceUnavailableException({
                //     errorCode: 'SYSTEM_IN_LOCKDOWN',
                //     message: 'Global Security Lockdown Active: Write operations are temporarily disabled by administrators.',
                //     statusCode: 503,
                // });
            }
        }

        return next.handle();
    }
}
