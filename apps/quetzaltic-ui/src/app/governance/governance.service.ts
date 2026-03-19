import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, Subscription, interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/auth.service';

export interface AuditLogResponse {
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable({
    providedIn: 'root'
})
export class GovernanceService {
    private apiUrl = '/api/governance';
    private lockdownSubject = new BehaviorSubject<boolean>(false);
    public lockdown$ = this.lockdownSubject.asObservable();
    private operationalSubject = new BehaviorSubject<boolean>(true);
    public isOperational$ = this.operationalSubject.asObservable();
    private pollSubscription?: Subscription;

    constructor(private http: HttpClient, private authService: AuthService) { }

    /**
     * Inicia el sondeo global del estado de bloqueo. 
     * Debe llamarse una sola vez al inicio de la aplicación (AppComponent).
     */
    initializeLockdownPolling() {
        if (this.pollSubscription) return;

        this.pollSubscription = interval(5000).pipe(
            startWith(0)
        ).subscribe(() => {
            this.getLockdownStatus().subscribe({
                next: (res) => {
                    this.operationalSubject.next(true); // Conectado
                    if (this.lockdownSubject.value !== res.active) {
                        console.warn('[GovernanceService] Global Lockdown state changed:', res.active);
                        this.lockdownSubject.next(res.active);
                    }
                },
                error: (err) => {
                    console.error('[GovernanceService] Polling failed:', err);
                    this.operationalSubject.next(false); // Desconectado
                }
            });
        });
    }

    /**
     * Permite actualizar el estado local inmediatamente después de una acción del usuario.
     */
    updateLocalLockdownState(active: boolean) {
        this.lockdownSubject.next(active);
    }

    private getHeaders(): HttpHeaders {
        const token = this.authService.getToken();
        const actor = this.authService.getEmail() || 'ui_user';
        const idempotencyKey = uuidv4();
        
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Actor': actor,
            'X-Correlation-Id': 'ui_gov_' + Date.now(),
            'X-Idempotency-Key': idempotencyKey
        });
    }


    getAuditLogs(params: any): Observable<AuditLogResponse> {
        return this.http.get<AuditLogResponse>(`${this.apiUrl}/audit-logs`, {
            headers: this.getHeaders(),
            params: {
                ...params,
                limit: params.limit || 8,
                grouped: 'true'
            }
        });
    }

    getLockdownStatus(): Observable<{ active: boolean }> {
        return this.http.get<{ active: boolean }>(`${this.apiUrl}/lockdown/status`, {
            headers: this.getHeaders()
        });
    }

    toggleLockdown(active: boolean): Observable<any> {
        return this.http.post(`${this.apiUrl}/lockdown/toggle`, { active }, {
            headers: this.getHeaders()
        });
    }

    getWhitelist(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/whitelist`, {
            headers: this.getHeaders()
        });
    }

    createWhitelistEntry(data: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/whitelist`, data, {
            headers: this.getHeaders()
        });
    }

    updateWhitelistEntry(id: string, isEditable: boolean): Observable<any> {
        return this.http.post(`${this.apiUrl}/whitelist/update`, { id, isEditable }, {
            headers: this.getHeaders()
        });
    }

    deleteWhitelistEntry(id: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/whitelist/delete`, { id }, {
            headers: this.getHeaders()
        });
    }

    getStats(): Observable<{
        totalEvents: number;
        rollbacksExecuted: number;
        schemaChanges: number;
        avgExecutionMs: number | null;
    }> {
        return this.http.get<any>(`${this.apiUrl}/stats`, {
            headers: this.getHeaders()
        });
    }

    exportLogs(params: any): Observable<AuditLogResponse> {
        let httpParams = new HttpParams();
        const exportParams = { ...params, limit: 1000, page: 1 };
        Object.keys(exportParams).forEach(key => {
            if (exportParams[key]) {
                httpParams = httpParams.set(key, exportParams[key]);
            }
        });
        return this.http.get<AuditLogResponse>(`${this.apiUrl}/audit-logs`, {
            headers: this.getHeaders(),
            params: httpParams
        });
    }

    rollbackOperation(auditEventId: string): Observable<any> {
        return this.http.post(`/api/operations/rollback/${auditEventId}`, {}, {
            headers: this.getHeaders()
        });
    }

    getUsers(): Observable<any[]> {
        return this.http.get<any[]>('/api/users', {
            headers: this.getHeaders()
        });
    }
}
