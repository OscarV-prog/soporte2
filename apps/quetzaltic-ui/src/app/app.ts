import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { GovernanceService } from './governance/governance.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth/auth.service';
import { Subscription } from 'rxjs';

@Component({
  imports: [RouterModule, CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected title = 'quetzaltic-ui';
  isLockdownActive = false;
  lockdownLoading = false;
  showLockdownConfirm = false;

  userRole: 'ADMIN' | 'OPERATOR' | null = null;
  userEmail: string | null = null;
  private roleSub?: Subscription;

  searchQuery = '';

  // Last used ticket ID (updated by child components via a shared service — for now we use localStorage)
  get lastTicketId(): string {
    return localStorage.getItem('qz_last_ticket') || 'REQ-XXXXX';
  }

  constructor(
    private govService: GovernanceService,
    public authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.govService.getLockdownStatus().subscribe({
      next: res => { this.isLockdownActive = res.active; },
      error: () => { this.isLockdownActive = false; }
    });

    this.roleSub = this.authService.getCurrentUser$().subscribe(user => {
      this.userRole = user.role;
      this.userEmail = user.email;
    });
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
    const newState = !this.isLockdownActive;

    this.govService.toggleLockdown(newState).subscribe({
      next: (res) => {
        this.isLockdownActive = res.active;
        this.lockdownLoading = false;
      },
      error: () => {
        // Virtual mode: toggle in memory
        this.isLockdownActive = newState;
        this.lockdownLoading = false;
      }
    });
  }

  cancelLockdownToggle() {
    this.showLockdownConfirm = false;
  }

  // Search CorrelationID — navigate to governance and apply filter
  onSearch(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.searchQuery.trim()) {
      this.router.navigate(['/governance'], {
        queryParams: { correlationId: this.searchQuery.trim() }
      });
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
