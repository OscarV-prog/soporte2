import { GuardianError } from './guardian-error';

export class GuardianEqualityViolationError extends GuardianError {
    constructor(public readonly violation: string) {
        super(
            'GUARDIAN_EQUALITY_VIOLATION',
            `SQL equality violation detected: ${violation}`
        );
        this.name = 'GuardianEqualityViolationError';
    }
}
