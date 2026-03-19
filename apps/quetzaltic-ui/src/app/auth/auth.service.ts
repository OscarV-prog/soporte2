import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserState {
    role: 'ADMIN' | 'OPERATOR' | null;
    email: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly TOKEN_KEY = 'jwt_token';
    private currentUserSubject = new BehaviorSubject<UserState>({ role: null, email: null });

    constructor() {
        this.updateUserFromToken();
    }

    setToken(token: string): void {
        console.log('[AuthService] Setting new token...');
        sessionStorage.setItem(this.TOKEN_KEY, token);
        this.updateUserFromToken();
    }

    getToken(): string | null {
        return sessionStorage.getItem(this.TOKEN_KEY);
    }

    clearToken(): void {
        sessionStorage.removeItem(this.TOKEN_KEY);
        this.currentUserSubject.next({ role: null, email: null });
    }

    isLoggedIn(): boolean {
        return !!this.getToken();
    }

    getCurrentUser$(): Observable<UserState> {
        return this.currentUserSubject.asObservable();
    }

    getRole(): 'ADMIN' | 'OPERATOR' | null {
        return this.currentUserSubject.value.role;
    }

    getEmail(): string | null {
        return this.currentUserSubject.value.email;
    }

    private updateUserFromToken(): void {
        const token = this.getToken();
        if (!token) {
            console.warn('[AuthService] No token in storage');
            this.currentUserSubject.next({ role: null, email: 'No Session' });
            return;
        }

        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                const err = `Malformed (Parts: ${parts.length})`;
                console.error('[AuthService]', err);
                this.currentUserSubject.next({ role: null, email: err });
                return;
            }

            const payloadBase64Url = parts[1];
            // Decode Base64URL
            let base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }

            const decodedPayload = JSON.parse(atob(base64));
            console.log('[AuthService] Decoded successfully:', decodedPayload);

            if (!decodedPayload.role) {
                const err = `No Role (Keys: ${Object.keys(decodedPayload).join(',')})`;
                this.currentUserSubject.next({ role: null, email: err });
                return;
            }

            this.currentUserSubject.next({
                role: decodedPayload.role,
                email: decodedPayload.email || 'No Email'
            });
        } catch (e: any) {
            const err = `Parse Error: ${e.message}`;
            console.error('[AuthService]', err);
            this.currentUserSubject.next({ role: null, email: err });
            // Emergency alert for the user to copy-paste
            if (token.length > 10) {
                console.log('[AuthService] FATAL ERROR. Token snippet:', token.substring(0, 20));
            }
        }
    }

    logout(): void {
        this.clearToken();
    }
}
