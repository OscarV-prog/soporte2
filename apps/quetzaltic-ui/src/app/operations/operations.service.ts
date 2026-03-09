import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/auth.service';

export interface OperationRequest {
    sql: string;
    ticketId: string;
    data?: Record<string, unknown>;
}

export interface OperationResponse {
    status: string;
    correlationId: string;
    data: any;
    auditEventId?: string;
    snapshotBefore?: any;
}

export interface PreviewResponse {
    status: string;
    table: string;
    pkColumn: string;
    pkValue: string;
    record: Record<string, unknown>;
}

@Injectable({
    providedIn: 'root'
})
export class OperationsService {
    private apiUrl = '/api/operations';

    constructor(private http: HttpClient, private authService: AuthService) { }

    private getHeaders(): HttpHeaders {
        const correlationId = 'ui_exec_' + Date.now();
        const idempotencyKey = uuidv4();
        const token = this.authService.getToken();
        const actor = this.authService.getEmail() || 'ui_user';

        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Idempotency-Key': idempotencyKey,
            'X-Correlation-Id': correlationId,
            'X-Actor': actor,
        });
    }

    previewRecord(sql: string): Observable<PreviewResponse> {
        return this.http.post<PreviewResponse>(`${this.apiUrl}/preview`, { sql }, {
            headers: this.getHeaders()
        });
    }

    executeOperation(request: OperationRequest): Observable<OperationResponse> {
        return this.http.post<OperationResponse>(`${this.apiUrl}/execute`, request, {
            headers: this.getHeaders()
        });
    }

    rollbackOperation(auditEventId: string): Observable<OperationResponse> {
        return this.http.post<OperationResponse>(`${this.apiUrl}/rollback/${auditEventId}`, {}, {
            headers: this.getHeaders()
        });
    }
}
