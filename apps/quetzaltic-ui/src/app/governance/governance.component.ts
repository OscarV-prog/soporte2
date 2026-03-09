import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GovernanceService, AuditLogResponse } from './governance.service';
import { AuthService } from '../auth/auth.service';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

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
    auditLimit = 10;
    auditFilters = {
        ticketId: '',
        actor: '',
        tableName: '',
        startDate: '',
        endDate: ''
    };
    loadingLogs = false;
    expandedEventId: string | null = null;
    showSnapshots = false;

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

    constructor(
        private govService: GovernanceService,
        public authService: AuthService,
        private route: ActivatedRoute
    ) { }

    ngOnInit() {
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

        // Poll stats every 30 seconds
        this.statsSub = interval(30000).pipe(
            startWith(0),
            switchMap(() => this.govService.getStats())
        ).subscribe({
            next: (res) => {
                this.stats = res;
                this.statsLoaded = true;
            },
            error: () => {
                this.stats = { totalEvents: 0, rollbacksExecuted: 0, schemaChanges: 0, avgExecutionMs: null };
                this.statsLoaded = true;
            }
        });
    }

    ngOnDestroy() {
        this.statsSub?.unsubscribe();
        this.routeSub?.unsubscribe();
    }

    refreshAll() {
        this.loadAuditLogs();
        this.loadWhitelist();
        this.loadLockdownStatus();
        this.govService.getStats().subscribe({
            next: (res) => { this.stats = res; this.statsLoaded = true; },
            error: () => { this.statsLoaded = true; }
        });
    }

    // --- Audit Logs ---
    private _correlationIdFilter = '';

    loadAuditLogs() {
        this.loadingLogs = true;
        const params: any = {
            ...this.auditFilters,
            page: this.auditPage,
            limit: this.auditLimit,
            includeSnapshots: this.showSnapshots
        };
        if (this._correlationIdFilter) {
            params['correlationId'] = this._correlationIdFilter;
        }

        this.govService.getAuditLogs(params).subscribe({
            next: (res: AuditLogResponse) => {
                this.auditLogs = res.items;
                this.totalLogs = res.total;
                this.loadingLogs = false;
            },
            error: () => this.loadingLogs = false
        });
    }

    changePage(p: number) {
        this.auditPage = p;
        this.loadAuditLogs();
    }

    toggleExpand(eventId: string) {
        this.expandedEventId = this.expandedEventId === eventId ? null : eventId;
    }

    formatJson(data: any): string {
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
                this.whitelist = res;
                this.loadingWhitelist = false;
            },
            error: () => this.loadingWhitelist = false
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
        });
    }

    confirmLockdown() { this.showLockdownConfirm = true; }
    cancelLockdown() { this.showLockdownConfirm = false; }

    executeLockdownToggle() {
        this.lockdownLoading = true;
        this.showLockdownConfirm = false;
        this.govService.toggleLockdown(!this.lockdownActive).subscribe({
            next: (res) => {
                this.lockdownActive = res.active;
                this.lockdownLoading = false;
            },
            error: () => this.lockdownLoading = false
        });
    }
}
