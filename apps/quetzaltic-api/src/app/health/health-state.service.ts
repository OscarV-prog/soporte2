import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthStateService {
    private isAuditDbHealthy = true; // Default to true, assuming healthy until check fails
    private isProdDbHealthy = true;

    setAuditDbStatus(status: boolean) {
        this.isAuditDbHealthy = status;
    }

    isAuditDbUp(): boolean {
        return this.isAuditDbHealthy;
    }

    setProdDbStatus(status: boolean) {
        this.isProdDbHealthy = status;
    }

    isProdDbUp(): boolean {
        return this.isProdDbHealthy;
    }
}
