import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    private fb = inject(FormBuilder);
    private http = inject(HttpClient);
    private router = inject(Router);
    private authService = inject(AuthService);

    loginForm = this.fb.group({
        username: ['', Validators.required],
        password: ['', Validators.required]
    });

    errorMessage = '';
    isLoading = false;

    onSubmit() {
        if (this.loginForm.invalid) return;

        this.isLoading = true;
        this.errorMessage = '';

        this.http.post<{ access_token: string }>('/api/auth/login', this.loginForm.value).subscribe({
            next: (res) => {
                console.log('[Login] Received token:', !!res.access_token);
                this.authService.setToken(res.access_token);
                const user = this.authService.getRole(); // Actually this is a sync call now
                console.log('[Login] Decoded role:', user);

                if (user === 'ADMIN') {
                    this.router.navigate(['/governance']);
                } else {
                    this.router.navigate(['/operations']);
                }
            },
            error: () => {
                this.isLoading = false;
                this.errorMessage = 'Credenciales inválidas. Por favor, inténtelo de nuevo.';
            }
        });
    }
}
