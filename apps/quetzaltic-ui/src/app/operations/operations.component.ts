import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OperationsService, OperationResponse, PreviewResponse } from './operations.service';
import { GovernanceService } from '../governance/governance.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-operations',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './operations.component.html',
    styleUrls: ['./operations.component.css']
})
export class OperationsComponent implements OnInit, OnDestroy {
    sql = '';
    ticketId = '';
    jsonError: string | null = null;
    isLockdown = false;
    private lockdownSub?: Subscription;

    // Preview state
    isPreviewing = false;
    previewData: PreviewResponse | null = null;
    previewError: string | null = null;
    editableRecord: Record<string, string> = {};

    // Execution state
    isExecuting = false;
    rollbackLoading = false;
    showRollbackConfirm = false;
    showExecutionConfirm = false;
    hasExecuted = false;
    isMaintenance = false;

    lastResponse: OperationResponse | null = null;
    lastError: any = null;

    // Comparativa scroll sync
    syncingScroll = false;

    constructor(
        private operationsService: OperationsService,
        private govService: GovernanceService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        // 🚨 BLOQUEO CENTRALIZADO: Usar el estado compartido del servicio
        this.lockdownSub = this.govService.lockdown$.subscribe(active => {
            if (this.isLockdown !== active) {
                console.warn('[Operations] Lockdown state changed:', active);
                this.isLockdown = active;
                this.cdr.detectChanges();
            }
        });
    }

    ngOnDestroy() {
        if (this.lockdownSub) {
            this.lockdownSub.unsubscribe();
        }
    }

    // Step 1: Preview record from SELECT
    preview() {
        if (!this.sql.trim()) return;

        this.isPreviewing = true;
        this.previewData = null;
        this.previewError = null;
        this.editableRecord = {};

        this.operationsService.previewRecord(this.sql).subscribe({
            next: (res) => {
                console.log('[OperationsComponent] Received preview response:', res);
                this.previewData = res;
                this.isPreviewing = false;
                // Build editable copy from the FIRST record as template
                if (res && res.records && res.records.length > 0) {
                    const firstRecord = res.records[0].data;
                    for (const key of Object.keys(firstRecord)) {
                        const val = firstRecord[key];
                        this.editableRecord[key] = val === null ? '' : String(val);
                    }
                } else {
                    console.error('[OperationsComponent] Response does not contain records:', res);
                }
                this.cdr.detectChanges();
            },
            error: (err) => {
                const errorBody = err.error || {};
                this.previewError = errorBody.error?.message || errorBody.message || 'Could not fetch records. Check your SELECT query.';
                this.isPreviewing = false;
                this.cdr.detectChanges();
            }
        });
    }

    // Return keys of the record that are actually different
    get changedFields(): Record<string, string> {
        if (!this.previewData?.records?.[0]?.data) return {};
        const firstRecord = this.previewData.records[0].data;
        const changed: Record<string, string> = {};
        for (const key of Object.keys(this.editableRecord)) {
            const original = firstRecord[key];
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

    // Step 2: Request confirmation
    execute() {
        if (!this.ticketId.trim() || this.isLockdown) return;
        const changed = this.changedFields;
        if (Object.keys(changed).length === 0) return;
        this.showExecutionConfirm = true;
    }

    cancelExecution() {
        this.showExecutionConfirm = false;
    }

    confirmExecution() {
        this.showExecutionConfirm = false;
        this.executeNow();
    }

    // Actual execution logic
    executeNow() {
        const changed = this.changedFields;
        if (Object.keys(changed).length === 0) return;

        this.isExecuting = true;
        this.lastResponse = null;
        this.lastError = null;
        this.isMaintenance = false;
        this.showRollbackConfirm = false;

        // Cast changed fields based on original data types
        if (!this.previewData?.records?.[0]?.data) return;
        const firstRecord = this.previewData.records[0].data;
        const parsedData: Record<string, unknown> = {};
        for (const key of Object.keys(changed)) {
            const val = changed[key];
            const originalVal = firstRecord[key];
            const originalType = typeof originalVal;

            if (val === '') {
                parsedData[key] = null;
            } else if (originalVal === null) {
                // Fallback to auto-detection if the template record is null
                if (!isNaN(Number(val)) && val !== '') {
                    parsedData[key] = Number(val);
                } else if (val.toLowerCase() === 'true' || val.toLowerCase() === 'false') {
                    parsedData[key] = val.toLowerCase() === 'true';
                } else {
                    parsedData[key] = val;
                }
            } else if (originalType === 'number') {
                parsedData[key] = Number(val);
            } else if (originalType === 'boolean') {
                parsedData[key] = val.toLowerCase() === 'true';
            } else {
                // Default to string (e.g. VARCHAR)
                parsedData[key] = val;
            }
        }

        // Save last used ticket to topbar badge
        if (this.ticketId.trim()) {
            sessionStorage.setItem('qz_last_ticket', this.ticketId.trim());
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
                this.cdr.detectChanges();
                
                // Auto-refresh the editable data grid with the newly updated database state
                if (res.status === 'SUCCESS') {
                    this.preview();
                }
            },
            error: (err) => {
                this.lastError = err.error || { message: 'Unknown connection error', statusCode: 500 };
                // Consolidate nested error object from GlobalExceptionFilter
                if (this.lastError.error) {
                    this.lastError.message = this.lastError.error.message;
                    this.lastError.statusCode = this.lastError.error.code;
                }

                if (this.lastError.statusCode === 503) {
                    this.isMaintenance = true;
                }
                if (this.lastError.statusCode === 401) {
                    this.lastError.message = 'Sesión inválida o expirada.';
                }
                this.cdr.detectChanges();
            }
        });
    }

    confirmRollback() { this.showRollbackConfirm = true; }
    cancelRollback() { this.showRollbackConfirm = false; }

    rollback() {
        if (!this.lastResponse?.auditEventIds || this.lastResponse.auditEventIds.length === 0) return;

        this.rollbackLoading = true;
        this.showRollbackConfirm = false;
        this.lastError = null;

        // Backend rollback finds siblings by correlationId, so any ID from the group works
        this.operationsService.rollbackOperation(this.lastResponse.auditEventIds[0]).subscribe({
            next: (res) => {
                this.lastResponse = res;
                this.rollbackLoading = false;
                this.showRollbackConfirm = false;
                alert('¡Reversión exitosa! Los datos han sido restaurados.');
                this.reset();
                this.cdr.detectChanges(); // Force UI update
            },
            error: (err) => {
                this.lastError = err.error || { message: 'Rollback failed', statusCode: 500 };
                // Consolidate nested error object from GlobalExceptionFilter
                if (this.lastError.error) {
                    this.lastError.message = this.lastError.error.message;
                    this.lastError.statusCode = this.lastError.error.code;
                }
                this.rollbackLoading = false;
                this.cdr.detectChanges();
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

    get recordAfter(): Record<string, any> {
        if (!this.previewData?.records?.[0]?.data) return {};
        const after = { ...this.previewData.records[0].data };
        for (const key of Object.keys(this.editableRecord)) {
            const val = this.editableRecord[key];
            const originalVal = after[key];
            const originalType = typeof originalVal;

            if (val === '') {
                after[key] = null;
            } else if (originalType === 'number') {
                after[key] = Number(val);
            } else if (originalType === 'boolean') {
                after[key] = val.toLowerCase() === 'true';
            } else {
                after[key] = val;
            }
        }
        return after;
    }

    onScroll(event: any, otherId: string) {
        if (this.syncingScroll) return;
        this.syncingScroll = true;
        const source = event.target as HTMLElement;
        const other = document.getElementById(otherId);
        if (other) {
            other.scrollLeft = source.scrollLeft;
        }
        // Small timeout to prevent feedback loops
        setTimeout(() => this.syncingScroll = false, 10);
    }

    isFieldChanged(key: string): boolean {
        if (!this.previewData?.records?.[0]?.data) return false;
        const original = this.previewData.records[0].data[key];
        const originalStr = original === null ? '' : String(original);
        return this.editableRecord[key] !== originalStr;
    }

    isKeyField(key: string): boolean {
        if (!this.previewData || this.previewData.records.length === 0) return false;
        if (Array.isArray(this.previewData.pkColumn)) {
            return this.previewData.pkColumn.includes(key);
        }
        return key === this.previewData.pkColumn;
    }

    formatJson(val: any): string {
        return JSON.stringify(val, null, 2);
    }

    objectKeys(obj: any): string[] {
        return obj ? Object.keys(obj) : [];
    }
}
