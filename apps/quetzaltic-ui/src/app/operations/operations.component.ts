import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsService, OperationResponse, PreviewResponse } from './operations.service';

@Component({
    selector: 'app-operations',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './operations.component.html',
    styleUrls: ['./operations.component.css']
})
export class OperationsComponent {
    sql = '';
    ticketId = '';
    jsonError: string | null = null;

    // Preview state
    isPreviewing = false;
    previewData: PreviewResponse | null = null;
    previewError: string | null = null;
    editableRecord: Record<string, string> = {};

    // Execution state
    isExecuting = false;
    rollbackLoading = false;
    showRollbackConfirm = false;
    hasExecuted = false;
    isMaintenance = false;

    lastResponse: OperationResponse | null = null;
    lastError: any = null;

    constructor(private operationsService: OperationsService) { }

    // Step 1: Preview record from SELECT
    preview() {
        if (!this.sql.trim()) return;

        this.isPreviewing = true;
        this.previewData = null;
        this.previewError = null;
        this.editableRecord = {};

        this.operationsService.previewRecord(this.sql).subscribe({
            next: (res) => {
                this.previewData = res;
                this.isPreviewing = false;
                // Build editable copy, stringify all values for easy editing
                for (const key of Object.keys(res.record)) {
                    const val = res.record[key];
                    this.editableRecord[key] = val === null ? '' : String(val);
                }
            },
            error: (err) => {
                this.previewError = err.error?.message || 'Could not fetch record. Check your SELECT query.';
                this.isPreviewing = false;
            }
        });
    }

    // Return keys of the record that are actually different
    get changedFields(): Record<string, string> {
        if (!this.previewData) return {};
        const changed: Record<string, string> = {};
        for (const key of Object.keys(this.editableRecord)) {
            const original = this.previewData.record[key];
            const originalStr = original === null ? '' : String(original);
            if (this.editableRecord[key] !== originalStr) {
                changed[key] = this.editableRecord[key];
            }
        }
        return changed;
    }

    get changedCount(): number {
        return Object.keys(this.changedFields).length;
    }

    // Step 2: Execute with diff as payload
    execute() {
        if (!this.ticketId.trim()) return;

        const changed = this.changedFields;
        if (Object.keys(changed).length === 0) return;

        this.isExecuting = true;
        this.lastResponse = null;
        this.lastError = null;
        this.isMaintenance = false;
        this.showRollbackConfirm = false;

        // Cast changed fields back to proper types
        const parsedData: Record<string, unknown> = {};
        for (const key of Object.keys(changed)) {
            const val = changed[key];
            if (val === '') {
                parsedData[key] = null;
            } else if (!isNaN(Number(val)) && val !== '') {
                parsedData[key] = Number(val);
            } else if (val.toLowerCase() === 'true') {
                parsedData[key] = true;
            } else if (val.toLowerCase() === 'false') {
                parsedData[key] = false;
            } else {
                parsedData[key] = val;
            }
        }

        // Save last used ticket to topbar badge
        if (this.ticketId.trim()) {
            localStorage.setItem('qz_last_ticket', this.ticketId.trim());
        }

        this.operationsService.executeOperation({
            sql: this.sql,
            ticketId: this.ticketId,
            data: parsedData
        }).subscribe({
            next: (res) => {
                this.lastResponse = res;
                this.isExecuting = false;
                this.hasExecuted = true;
            },
            error: (err) => {
                this.lastError = err.error || { message: 'Unknown connection error', statusCode: 500 };
                this.isExecuting = false;

                if (this.lastError.statusCode === 503) {
                    this.isMaintenance = true;
                }
                if (this.lastError.statusCode === 401) {
                    this.lastError.message = 'Sesión inválida o expirada.';
                }
            }
        });
    }

    confirmRollback() { this.showRollbackConfirm = true; }
    cancelRollback() { this.showRollbackConfirm = false; }

    rollback() {
        if (!this.lastResponse?.auditEventId) return;

        this.rollbackLoading = true;
        this.showRollbackConfirm = false;
        this.lastError = null;

        this.operationsService.rollbackOperation(this.lastResponse.auditEventId).subscribe({
            next: (res) => {
                this.lastResponse = res;
                this.rollbackLoading = false;
            },
            error: (err) => {
                this.lastError = err.error || { message: 'Rollback failed', statusCode: 500 };
                this.rollbackLoading = false;
            }
        });
    }

    reset() {
        this.sql = '';
        this.ticketId = '';
        this.jsonError = null;
        this.hasExecuted = false;
        this.lastResponse = null;
        this.lastError = null;
        this.isMaintenance = false;
        this.showRollbackConfirm = false;
        this.previewData = null;
        this.previewError = null;
        this.editableRecord = {};
    }

    isFieldChanged(key: string): boolean {
        if (!this.previewData) return false;
        const original = this.previewData.record[key];
        const originalStr = original === null ? '' : String(original);
        return this.editableRecord[key] !== originalStr;
    }

    isKeyField(key: string): boolean {
        return !!this.previewData && key === this.previewData.pkColumn;
    }

    formatJson(val: any): string {
        return JSON.stringify(val, null, 2);
    }

    objectKeys(obj: any): string[] {
        return obj ? Object.keys(obj) : [];
    }
}
