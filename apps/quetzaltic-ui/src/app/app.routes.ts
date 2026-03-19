import { Route } from '@angular/router';
import { OperationsComponent } from './operations/operations.component';
import { GovernanceComponent } from './governance/governance.component';
import { UsersComponent } from './users/users.component';
import { TestOscarComponent } from './test-oscar/test-oscar.component';
import { LoginComponent } from './auth/login.component';
import { authGuard } from './auth/auth.guard';

export const appRoutes: Route[] = [
    { path: 'login', component: LoginComponent },
    { path: 'test-db', component: TestOscarComponent },
    { path: 'governance', component: GovernanceComponent, canActivate: [authGuard] },
    { path: 'users', component: UsersComponent, canActivate: [authGuard] },
    { path: 'operations', component: OperationsComponent, canActivate: [authGuard] },
    { path: '', redirectTo: 'operations', pathMatch: 'full' },
];
