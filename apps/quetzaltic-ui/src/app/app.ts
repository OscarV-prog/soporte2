import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { GovernanceService } from './governance/governance.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth/auth.service';
import { Subscription } from 'rxjs';
import { delay } from 'rxjs/operators';

@Component({
  imports: [RouterModule, CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected title = 'quetzaltic-ui';
  isLockdownActive = false;
  isOperational = true;
  lockdownLoading = false;
  showLockdownConfirm = false;

  userRole: 'ADMIN' | 'OPERATOR' | null = null;
  userEmail: string | null = null;
  private roleSub?: Subscription;

  searchQuery = '';

  // Last used ticket ID (updated by child components via a shared service — for now we use sessionStorage)
  get lastTicketId(): string {
    return sessionStorage.getItem('qz_last_ticket') || 'REQ-XXXXX';
  }

  constructor(
    private govService: GovernanceService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef,
    public router: Router
  ) { }

  ngOnInit() {
    // 1. Inicializar el sondeo global de bloqueo (una sola vez)
    this.govService.initializeLockdownPolling();
    
    // 2. Escuchar cambios globales de bloqueo
    this.govService.lockdown$.pipe(delay(0)).subscribe(active => {
      this.isLockdownActive = active;
      this.cdr.detectChanges(); // Asegurar que el botón y el banner cambien YA
    });

    // 3. Escuchar estado de conectividad/operatividad
    this.govService.isOperational$.pipe(delay(0)).subscribe(ok => {
      this.isOperational = ok;
      this.cdr.detectChanges();
    });

    this.roleSub = this.authService.getCurrentUser$().subscribe(user => {
      this.userRole = user.role;
      this.userEmail = user.email;
    });
  }

  onSearch(event: any) {
    if (event.key === 'Enter' && this.searchQuery.trim()) {
      // Redirigir a la bitácora con el filtro de CorrelationID
      this.router.navigate(['/governance'], { 
        queryParams: { correlationId: this.searchQuery.trim() } 
      });
      this.searchQuery = ''; // Limpiar buscador
    }
  }

  ngOnDestroy() {
    this.roleSub?.unsubscribe();
  }

  // Emergency Lockdown
  requestLockdownToggle() {
    if (this.userRole !== 'ADMIN') return;
    this.showLockdownConfirm = true;
  }

  confirmLockdownToggle() {
    this.showLockdownConfirm = false;
    this.lockdownLoading = true;
    this.cdr.detectChanges();
    
    const newState = !this.isLockdownActive;

    this.govService.toggleLockdown(newState).subscribe({
      next: (res) => {
        this.govService.updateLocalLockdownState(res.active);
        // Usar setTimeout para asegurar que el cambio de 'lockdownLoading' ocurra en el siguiente ciclo
        // y evitar el ruidoso ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.lockdownLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.govService.updateLocalLockdownState(newState);
        setTimeout(() => {
          this.lockdownLoading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  cancelLockdownToggle() {
    this.showLockdownConfirm = false;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
