import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-test-oscar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col p-6 space-y-6">
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white tracking-tight">Pantalla de Pruebas: oscar_prueba</h2>
          <p class="text-qz-muted text-sm mt-1">Vista detallada de registros para validación de datos y sucursales.</p>
        </div>
        
        <div class="flex flex-wrap items-center gap-3">
          <!-- Buscador -->
          <div class="relative group">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-qz-muted group-focus-within:text-qz-emerald transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <input type="text" [(ngModel)]="searchQuery" placeholder="Buscar almacén..." 
                   class="pl-9 pr-4 py-2 bg-qz-card border border-qz-light rounded-lg text-sm text-white placeholder:text-qz-muted focus:outline-none focus:border-qz-emerald/50 focus:ring-1 focus:ring-qz-emerald/50 w-64 transition-all">
          </div>

          <button (click)="loadData()" 
                  class="p-2 bg-qz-card border border-qz-light rounded-lg text-qz-text hover:bg-qz-light transition-colors" title="Actualizar">
            <svg class="w-5 h-5" [class.animate-spin]="loading" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
        </div>
      </header>

      <div *ngIf="errorMessage" class="text-qz-danger text-xs font-medium bg-qz-danger/10 p-3 rounded-lg border border-qz-danger/20 flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
        {{ errorMessage }}
      </div>

      <div class="bg-qz-darkest rounded-xl border border-qz-light shadow-2xl overflow-hidden flex-1 flex flex-col relative">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead class="bg-qz-card/80 border-b border-qz-light text-qz-muted font-bold text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th class="px-6 py-5 text-center w-16">PK</th>
                <th class="px-6 py-5">Nombre Almacén</th>
                <th class="px-6 py-5">Ubicación</th>
                <th class="px-6 py-5 text-center">Estado</th>
                <th class="px-6 py-5 text-right px-8">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-qz-light/30">
              <tr *ngFor="let row of filteredData" class="hover:bg-qz-emerald/5 transition-all group">
                <td class="px-6 py-4 text-center">
                  <div class="flex flex-col items-center">
                    <span class="text-qz-emerald font-mono text-xs">{{ row.id_Almacen }}</span>
                    <span class="text-[9px] text-qz-muted font-mono leading-none mt-0.5" [title]="row.nb_Empresa">PK: {{ row.id_Almacen }}</span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="text-white font-semibold">{{ row.nb_Almacen }}</span>
                  <div class="text-[10px] text-qz-muted font-mono mt-0.5">{{ row.nb_AlmacenCorto || 'N/A' }}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="flex flex-col">
                    <span class="text-white text-xs font-medium">{{ row.nb_Sucursal }}</span>
                    <div class="max-w-[150px] truncate text-qz-muted text-[10px] italic mt-0.5" [title]="row.de_Direccion">
                        {{ row.de_Direccion || 'Sin dirección' }}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-center">
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        [class.bg-qz-emerald/10]="row.sn_Activo" [class.text-qz-emerald]="row.sn_Activo"
                        [class.bg-qz-muted/10]="!row.sn_Activo" [class.text-qz-muted]="!row.sn_Activo">
                    {{ row.sn_Activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="px-6 py-4 text-right px-8">
                  <button (click)="viewHistory(row)" 
                          class="text-qz-emerald hover:text-white text-[10px] font-bold uppercase tracking-widest border border-qz-emerald/30 px-3 py-1.5 rounded-lg hover:bg-qz-emerald/10 transition-all">
                    Bitácora
                  </button>
                </td>
              </tr>
              <tr *ngIf="filteredData.length === 0 && !loading">
                <td colspan="5" class="px-6 py-16 text-center">
                  <div class="flex flex-col items-center gap-2 opacity-40">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                    <span class="text-sm italic">No se encontraron resultados para "{{ searchQuery }}"</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div *ngIf="loading && testData.length === 0" class="flex-1 flex items-center justify-center">
          <div class="flex flex-col items-center gap-3">
            <svg class="w-10 h-10 text-qz-emerald animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span class="text-qz-muted text-xs uppercase tracking-[0.2em]">Conectando con DB...</span>
          </div>
        </div>
      </div>
      
      <footer class="flex items-center justify-between text-[10px] text-qz-muted uppercase tracking-widest px-2">
          <div class="flex items-center gap-4">
              <span>Registros: {{ testData.length }}</span>
              <span class="text-qz-light/20">|</span>
              <span class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-qz-emerald"></span>
                  Auditoría Activa
              </span>
          </div>
          <span>Refresco automático: 10s</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
  `]
})
export class TestOscarComponent implements OnInit, OnDestroy {
  testData: any[] = [];
  searchQuery = '';
  loading = false;
  errorMessage: string | null = null;
  
  private refreshSub?: Subscription;

  constructor(
      private http: HttpClient, 
      private cdr: ChangeDetectorRef,
      private router: Router
  ) {}

  get filteredData() {
    if (!this.searchQuery) return this.testData;
    const q = this.searchQuery.toLowerCase();
    return this.testData.filter(d => 
        d.nb_Almacen?.toLowerCase().includes(q) || 
        d.nb_AlmacenCorto?.toLowerCase().includes(q) ||
        d.id_Almacen?.toString().includes(q)
    );
  }

  ngOnInit() {
    this.loadData();
    this.refreshSub = interval(10000).subscribe(() => {
        this.loadData(true);
    });
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
  }

  loadData(silent = false) {
    if (!silent) this.loading = true;
    this.errorMessage = null;
    this.http.get<any[]>('/api/test-oscar').subscribe({
      next: (res) => {
        this.testData = Array.isArray(res) ? res : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Error al sincronizar con SQL Server.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  viewHistory(_row: any) {
    this.router.navigate(['/governance'], { queryParams: { tableName: 'oscar_prueba' } });
  }
}
