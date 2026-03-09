import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
    const router = inject(Router);
    const authService = inject(AuthService);

    if (authService.isLoggedIn()) {
        // Optionally check roles based on route data if needed
        // const expectedRole = route.data?.['role'];
        return true;
    }

    // Redirect to login if not authenticated
    return router.createUrlTree(['/login']);
};
