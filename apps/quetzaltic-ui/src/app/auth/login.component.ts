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
                this.isLoading = false;
                console.log('[Login] Received token:', !!res.access_token);
                this.authService.setToken(res.access_token);
                const user = this.authService.getRole();
                console.log('[Login] Decoded role:', user);

                if (user === 'ADMIN') {
                    this.router.navigate(['/governance']);
                } else {
                    this.router.navigate(['/operations']);
                }
            },
            error: (err) => {
                this.isLoading = false;
                // Limpiar contraseña para seguridad y reintento
                this.loginForm.get('password')?.setValue('');
                
                if (err.status === 401) {
                    this.errorMessage = 'Credenciales inválidas. Por favor, verifica tu Usuario y Contraseña.';
                } else if (err.status === 0 || err.status === 404) {
                    this.errorMessage = 'No se pudo conectar con el servidor (Offline).';
                } else {
                    this.errorMessage = 'Error inesperado al iniciar sesión.';
                }
                console.error('[Login] Error:', err);
            }
        });
    }
}
