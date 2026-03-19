import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private readonly logger = new Logger(JwtAuthGuard.name);

    constructor(private readonly config: ConfigService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or invalid Authorization header');
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            throw new UnauthorizedException('Token not found');
        }

        try {
            const payload = this.verifyJwt(token);
            console.log('[DEBUG] JWT Payload:', JSON.stringify(payload));
            // Extraemos el actor y el role y los adjuntamos al request
            request.user = {
                actor: payload.email || payload.sub || 'unknown_actor',
                role: payload.role || 'GUEST',
            };
            console.log('[DEBUG] Authenticated Actor:', request.user.actor);
            return true;
        } catch (error) {
            this.logger.error('JWT Verification failed', error);
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    /**
     * Validación manual de JWT usando el secreto de configuración.
     * Evita dependencias externas extras y mantiene el control total.
     */
    private verifyJwt(token: string): any {
        const segments = token.split('.');
        if (segments.length !== 3) {
            throw new Error('Invalid JWT structure');
        }

        const [header, payload, signature] = segments;
        const secret = this.config.get<string>('JWT_SECRET');

        if (!secret) {
            throw new Error('JWT_SECRET not configured');
        }

        // Verificar Firma
        const data = `${header}.${payload}`;
        const expectedSignature = createHmac('sha256', secret)
            .update(data)
            .digest('base64url');

        if (signature !== expectedSignature) {
            throw new Error('Signature mismatch');
        }

        // Decodificar Payload
        const decodedPayload = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        );

        // Verificar Expiración (exp)
        if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error('Token expired');
        }

        return decodedPayload;
    }
}
