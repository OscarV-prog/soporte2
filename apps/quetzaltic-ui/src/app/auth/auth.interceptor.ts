import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor global de autenticación.
 * 1. Añade el token JWT a todas las peticiones salientes.
 * 2. Si cualquier respuesta devuelve 401, limpia la sesión y redirige a /login.
 *    Esto rompe el ciclo de polling con token expirado que causaba errores 429.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const token = authService.getToken();

    let url = req.url;
    // Si la URL es relativa y empieza con /api, la dejamos pasar.
    // Netlify (o el proxy de dev) se encargará de redirigirla al backend correcto.

    const authReq = req.clone({
        url,
        headers: token ? req.headers.set('Authorization', `Bearer ${token}`) : req.headers
    });

    return next(authReq).pipe(
        catchError((error: HttpErrorResponse) => {
            console.error('[AuthInterceptor] Error detectado:', error.status, error.url);
            if (error.status === 401) {
                authService.clearToken();
                router.navigate(['/login']);
            }
            return throwError(() => error);
        })
    );
};
