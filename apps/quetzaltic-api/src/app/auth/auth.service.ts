import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private readonly config: ConfigService,
        private readonly usersService: UsersService
    ) { }

    async login(username: string, pass: string) {
        console.log(`[AuthService] Login attempt for user: ${username}`);

        // --- Cuentas de Fallback (PRIORIDAD: Funcionan sin base de datos) ---
        if (username === 'admin' && pass === '12345678') {
            console.log('[AuthService] Fallback admin credentials matched');
            return {
                access_token: this.signJwt({
                    sub: '0000-0000-0000',
                    email: 'superadmin-fallback@quetzaltic.local',
                    role: 'ADMIN'
                }),
            };
        }

        if (username === 'soporte' && pass === 'support_quetzal_2026') {
            console.log('[AuthService] Support fallback credentials matched');
            return {
                access_token: this.signJwt({
                    sub: '0000-0000-0001',
                    email: 'support-agent@quetzaltic.local',
                    role: 'OPERATOR'
                }),
            };
        }

        // --- Autenticación con Base de Datos ---
        try {
            const user = await this.usersService.findOneByEmail(username.toLowerCase());

            if (user) {
                const isMatch = await bcrypt.compare(pass, user.passwordHash);
                if (isMatch) {
                    return {
                        access_token: this.signJwt({
                            sub: user.id,
                            email: user.email,
                            role: user.role
                        }),
                    };
                }
            }
        } catch (error) {
            console.error('[AuthService] Database authentication error:', error);
        }

        throw new UnauthorizedException('Credenciales inválidas');
    }

    private signJwt(payload: any): string {
        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('JWT_SECRET is not configured');
        }

        const header = {
            alg: 'HS256',
            typ: 'JWT',
        };

        const encodeBase64Url = (obj: any) =>
            Buffer.from(JSON.stringify(obj))
                .toString('base64url');

        // Include exp inside payload (+24 hours)
        const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
        const fullPayload = { ...payload, exp };

        const encodedHeader = encodeBase64Url(header);
        const encodedPayload = encodeBase64Url(fullPayload);

        const data = `${encodedHeader}.${encodedPayload}`;

        const signature = createHmac('sha256', secret)
            .update(data)
            .digest('base64url');

        return `${data}.${signature}`;
    }
}
