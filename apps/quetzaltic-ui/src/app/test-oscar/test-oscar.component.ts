import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { GovernanceService } from '../governance/governance.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-test-oscar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex flex-col p-6 space-y-6">
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Tabla: oscar_prueba</h2>
          <p class="text-qz-muted text-sm mt-1">Visualización en tiempo real de los datos en SQL Server.</p>
          
          <div *ngIf="isLockdown" 
            class="mt-4 bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-2 rounded-lg text-xs font-bold animate-pulse flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            SISTEMA EN BLOQUEO DE EMERGENCIA - SOLO LECTURA
          </div>

          <div *ngIf="errorMessage" class="mt-2 text-qz-danger text-xs font-medium bg-qz-danger/10 p-2 rounded border border-qz-danger/20 flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
            {{ errorMessage }}
          </div>
        </div>
        <div class="flex gap-4">
          <button (click)="loadData()" 
                  class="px-4 py-2 bg-qz-card border border-qz-light rounded-lg text-sm text-qz-text hover:bg-qz-light transition-colors flex items-center gap-2">
            <svg class="w-4 h-4" [class.animate-spin]="loading" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Refrescar
          </button>
        </div>
      </header>

      <div class="bg-qz-darkest rounded-xl border border-qz-light shadow-xl overflow-hidden flex-1 flex flex-col relative">
        <!-- Overlay de carga silenciosa -->
        <div *ngIf="loading && testData.length > 0" class="absolute top-0 right-0 p-2 z-10">
            <div class="flex items-center gap-2 bg-qz-darkest/80 border border-qz-light/30 px-3 py-1 rounded-full backdrop-blur-sm">
                <svg class="w-3 h-3 text-qz-emerald animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span class="text-[10px] font-bold text-qz-emerald tracking-widest uppercase">Actualizando...</span>
            </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-qz-card/50 border-b border-qz-light text-qz-muted font-medium uppercase tracking-wider">
              <tr>
                <th class="px-6 py-4">ID Empresa</th>
                <th class="px-6 py-4">Sucursal</th>
                <th class="px-6 py-4">Nombre Almacén</th>
                <th class="px-6 py-4">Dirección</th>
                <th class="px-6 py-4 text-center">Activo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-qz-light/50">
              <tr *ngFor="let row of testData" class="hover:bg-white/5 transition-colors group">
                <td class="px-6 py-4 font-mono text-qz-emerald">{{ row.id_Empresa }}</td>
                <td class="px-6 py-4 text-qz-text">{{ row.id_Sucursal }}</td>
                <td class="px-6 py-4">
                  <span class="text-white font-medium">{{ row.nb_Almacen }}</span>
                  <div class="text-[10px] text-qz-muted mt-0.5">{{ row.nb_AlmacenCorto }}</div>
                </td>
                <td class="px-6 py-4 max-w-xs truncate text-qz-muted" [title]="row.de_Direccion">
                  {{ row.de_Direccion || 'N/A' }}
                </td>
                <td class="px-6 py-4 text-center">
                  <span [class]="row.sn_Activo ? 'bg-qz-emerald/20 text-qz-emerald' : 'bg-qz-danger/20 text-qz-danger'" 
                        class="px-2 py-1 rounded text-[10px] font-bold">
                    {{ row.sn_Activo ? 'SÍ' : 'NO' }}
                  </span>
                </td>
              </tr>
              <tr *ngIf="testData.length === 0 && !loading">
                <td colspan="5" class="px-6 py-12 text-center text-qz-muted italic">
                  No hay datos disponibles en la tabla oscar_prueba.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div *ngIf="loading && testData.length === 0" class="flex-1 flex items-center justify-center">
          <div class="flex flex-col items-center gap-3">
            <svg class="w-8 h-8 text-qz-emerald animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span class="text-qz-muted text-sm">Cargando datos...</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
  `]
})
export class TestOscarComponent implements OnInit, OnDestroy {
  testData: any[] = [];
  loading = false;
  isLockdown = false;
  errorMessage: string | null = null;
  
  private refreshSub?: Subscription;
  private lockdownSub?: Subscription;

  constructor(
      private http: HttpClient, 
      private govService: GovernanceService,
      private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // 1. Initial load
    this.loadData();

    // 2. Real-time Polling every 10 seconds
    this.refreshSub = interval(10000).subscribe(() => {
        this.loadData(true); // silent
    });

    // 3. Centralized Lockdown Synchronization
    this.lockdownSub = this.govService.lockdown$.subscribe(active => {
        this.isLockdown = active;
        this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
    this.lockdownSub?.unsubscribe();
  }

  loadData(silent = false) {
    if (!silent) {
        this.loading = true;
    }
    this.errorMessage = null;
    
    this.http.get<any[]>('/api/test-oscar').subscribe({
      next: (res) => {
        this.testData = Array.isArray(res) ? res : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading test data', err);
        this.errorMessage = err.error?.message || 'Error de conexión con el servidor.';
        if (!silent) {
            this.testData = [];
        }
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
