import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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

    constructor(private http: HttpClient, private authService: AuthService) { }

    private getHeaders(): HttpHeaders {
        const token = this.authService.getToken();
        const actor = this.authService.getEmail() || 'ui_user';
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Actor': actor,
            'X-Correlation-Id': 'ui_gov_' + Date.now()
        });
    }


    getAuditLogs(params: any): Observable<AuditLogResponse> {
        let httpParams = new HttpParams();
        Object.keys(params).forEach(key => {
            if (params[key]) {
                httpParams = httpParams.set(key, params[key]);
            }
        });

        return this.http.get<AuditLogResponse>(`${this.apiUrl}/audit-logs`, {
            headers: this.getHeaders(),
            params: httpParams
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
}
