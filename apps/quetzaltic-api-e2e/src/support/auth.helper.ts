import { createHmac } from 'crypto';

export function generateTestToken(email: string, role: string, secret: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: email,
        email: email,
        role: role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    })).toString('base64url');

    const data = `${header}.${payload}`;
    const signature = createHmac('sha256', secret)
        .update(data)
        .digest('base64url');

    return `${header}.${payload}.${signature}`;
}
