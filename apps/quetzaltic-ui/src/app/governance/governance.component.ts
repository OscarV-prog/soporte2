import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GovernanceService, AuditLogResponse } from './governance.service';
import { AuthService } from '../auth/auth.service';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith, delay } from 'rxjs/operators';

@Component({
    selector: 'app-governance',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './governance.component.html',
    styleUrls: ['./governance.component.css']
})
export class GovernanceComponent implements OnInit, OnDestroy {
    // Audit Logs State
    auditLogs: any[] = [];
    totalLogs = 0;
    auditPage = 1;
    auditLimit = 8;
    auditFilters = {
        ticketId: '',
        actor: '',
        tableName: '',
        correlationId: '',
        startDate: '',
        endDate: ''
    };
    loadingLogs = false;
    expandedEventId: string | null = null;
    showSnapshots = true;
    userMap: Record<string, string> = {};

    // Real-time Metrics
    stats = {
        totalEvents: 0,
        rollbacksExecuted: 0,
        schemaChanges: 0,
        avgExecutionMs: null as number | null,
    };
    statsLoaded = false;

    // Whitelist State
    whitelist: any[] = [];
    loadingWhitelist = false;
    newEntry = { schemaName: 'prod', tableName: '', columnName: '', isEditable: true };
    showAddManual = false;

    // Lockdown State
    lockdownActive = false;
    lockdownLoading = false;
    showLockdownConfirm = false;

    // Export State
    exportLoading = false;

    private statsSub?: Subscription;
    private routeSub?: Subscription;

    Math = Math;
    
    constructor(
        private govService: GovernanceService,
        public authService: AuthService,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef
    ) { }

    private refreshSub?: Subscription;

    ngOnInit() {
        this.loadUserMapping();

        // Read optional correlationId from query param (from topbar search)
        this.routeSub = this.route.queryParams.subscribe(params => {
            if (params['correlationId']) {
                this.auditFilters.actor = '';
                this.auditFilters.ticketId = '';
                this.auditFilters.tableName = '';
                // Store it so we can use it in the API call
                this._correlationIdFilter = params['correlationId'];
            }
            this.refreshAll();
        });

        // Auto-refresh stats every 30 seconds
        this.statsSub = interval(30000).pipe(
            startWith(0),
            switchMap(() => this.govService.getStats())
        ).subscribe(stats => {
            this.stats = stats;
            this.cdr.detectChanges();
        });

        // 🚨 BLOQUEO CENTRALIZADO: Usar el estado compartido del servicio
        this.govService.lockdown$.pipe(delay(0)).subscribe(active => {
            if (this.lockdownActive !== active) {
                this.lockdownActive = active;
                this.cdr.detectChanges();
            }
        });

        // Auto-refresh stats every 30 seconds
        this.statsSub = interval(30000).pipe(
            startWith(0),
            switchMap(() => this.govService.getStats())
        ).subscribe(stats => {
            this.stats = stats;
            this.cdr.detectChanges();
        });

        if (!this.refreshSub) {
            this.refreshSub = new Subscription();
        }

        // Auto-refresh logs every 10 seconds
        const logsPoll = interval(10000).subscribe(() => {
            console.log('[Governance] Auto-refreshing logs...');
            this.loadAuditLogs(true); // silent refresh
        });
        this.refreshSub.add(logsPoll);
    }

    ngOnDestroy() {
        this.statsSub?.unsubscribe();
        this.routeSub?.unsubscribe();
        this.refreshSub?.unsubscribe();
    }

    refreshAll() {
        this.loadAuditLogs();
        this.loadWhitelist();
        this.loadLockdownStatus();
        this.govService.getStats().subscribe({
            next: (res) => { 
                this.stats = res; 
                this.statsLoaded = true; 
                this.cdr.detectChanges();
            },
            error: () => { 
                this.statsLoaded = true; 
                this.cdr.detectChanges();
            }
        });
    }

    // --- Audit Logs ---
    private _correlationIdFilter = '';

    loadAuditLogs(silent = false) {
        if (!silent) this.loadingLogs = true;
        const params: any = {
            ...this.auditFilters,
            page: this.auditPage,
            limit: 8, // Forzar límite de 8 por página para consistencia visual
            includeSnapshots: this.showSnapshots
        };
        if (this._correlationIdFilter) {
            params['correlationId'] = this._correlationIdFilter;
        } else if (this.auditFilters.correlationId) {
            params['correlationId'] = this.auditFilters.correlationId;
        }

        this.govService.getAuditLogs(params).subscribe({
            next: (res: AuditLogResponse) => {
                this.auditLogs = res.items || [];
                this.totalLogs = res.total || 0;
                this.loadingLogs = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.loadingLogs = false;
                this.cdr.detectChanges();
            }
        });
    }

    loadUserMapping() {
        this.govService.getUsers().subscribe(users => {
            const map: Record<string, string> = {};
            users.forEach((u: any) => {
                map[u.id] = u.email;
            });
            this.userMap = map;
            this.cdr.detectChanges();
        });
    }

    getActorDisplay(actor: string): string {
        return this.userMap[actor] || actor;
    }

    changePage(p: number) {
        this.auditPage = p;
        this.loadAuditLogs();
    }

    clearFilters() {
        this.auditFilters = {
            ticketId: '',
            actor: '',
            tableName: '',
            correlationId: '',
            startDate: '',
            endDate: ''
        };
        this._correlationIdFilter = '';
        this.auditPage = 1;
        this.loadAuditLogs();
    }

    toggleExpand(eventId: string) {
        this.expandedEventId = this.expandedEventId === eventId ? null : eventId;
    }

    formatJson(data: any): string {
        if (!data) return '{}';
        if (typeof data === 'string') {
            try {
                // Check if it's double-stringified or just a string
                const parsed = JSON.parse(data);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                return data; // Not a valid JSON string, return as is
            }
        }
        return JSON.stringify(data, null, 2);
    }

    // --- Export CSV ---
    exportToCsv() {
        this.exportLoading = true;
        const params: any = { ...this.auditFilters, includeSnapshots: false };

        this.govService.exportLogs(params).subscribe({
            next: (res) => {
                const headers = ['ID', 'Fecha/Hora', 'Actor', 'Tabla', 'Tipo', 'PK Valor', 'Ticket ID', 'ID Correlación', 'Estado'];
                const rows = res.items.map((log: any) => [
                    log.id,
                    new Date(log.executedAt).toISOString(),
                    log.actor,
                    log.tableName,
                    log.type,
                    log.primaryKeyValue,
                    log.ticketId || '',
                    log.correlationId,
                    log.status
                ]);

                const csvContent = [headers, ...rows]
                    .map(row => row.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
                    .join('\n');

                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `quetzaltic-audit-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                this.exportLoading = false;
            },
            error: () => { this.exportLoading = false; }
        });
    }

    // --- Whitelist ---
    loadWhitelist() {
        this.loadingWhitelist = true;
        this.govService.getWhitelist().subscribe({
            next: (res) => {
                this.whitelist = Array.isArray(res) ? res : [];
                this.loadingWhitelist = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.loadingWhitelist = false;
                this.cdr.detectChanges();
            }
        });
    }

    toggleEditable(entry: any) {
        if (this.authService.getRole() !== 'ADMIN') return;
        this.govService.updateWhitelistEntry(entry.id, !entry.isEditable).subscribe(() => {
            this.loadWhitelist();
        });
    }

    addWhitelistEntry() {
        if (!this.newEntry.tableName) return;
        this.govService.createWhitelistEntry(this.newEntry).subscribe(() => {
            this.loadWhitelist();
            this.newEntry.tableName = '';
            this.newEntry.columnName = '';
        });
    }

    deleteWhitelistEntry(id: string) {
        if (!confirm('¿Seguro que desea eliminar esta entrada de la Whitelist?')) return;
        this.govService.deleteWhitelistEntry(id).subscribe(() => {
            this.loadWhitelist();
        });
    }

    // --- Lockdown ---
    loadLockdownStatus() {
        this.govService.getLockdownStatus().subscribe(res => {
            this.lockdownActive = res.active;
            this.cdr.detectChanges();
        });
    }

    confirmLockdown() { this.showLockdownConfirm = true; }
    cancelLockdown() { this.showLockdownConfirm = false; }

    executeLockdownToggle() {
        this.lockdownLoading = true;
        this.showLockdownConfirm = false;
        this.govService.toggleLockdown(!this.lockdownActive).subscribe({
            next: (res) => {
                this.govService.updateLocalLockdownState(res.active);
                this.lockdownLoading = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.lockdownLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    // --- Rollback Optimization ---
    rollback(log: any) {
        if (log.status === 'REVERTED') return;
        
        const confirmMsg = `¿Seguro que desea revertir la operación en la tabla "${log.tableName}"? Esta acción intentará restaurar los datos al estado anterior.`;
        if (!confirm(confirmMsg)) return;

        this.loadingLogs = true;
        this.govService.rollbackOperation(log.id).subscribe({
            next: () => {
                this.refreshAll();
            },
            error: (err: any) => {
                this.loadingLogs = false;
                alert('Error al ejecutar la reversión: ' + (err.error?.error?.message || 'Error desconocido'));
            }
        });
    }
}
