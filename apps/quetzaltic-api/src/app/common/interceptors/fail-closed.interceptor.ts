import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { HealthStateService } from '../../health/health-state.service';

@Injectable()
export class FailClosedInterceptor implements NestInterceptor {
    constructor(private readonly healthState: HealthStateService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

        if (isWriteOperation && !this.healthState.isAuditDbUp()) {
            throw new ServiceUnavailableException(
                'Operational Hardening: Write operations are currently blocked due to Audit Store unavailability. Fail-Closed policy is active.'
            );
        }

        return next.handle();
    }
}
