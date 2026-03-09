import { GuardianError } from './guardian-error';

export class GuardianStructuralViolationError extends GuardianError {
    constructor(public readonly violation: string) {
        super(
            'GUARDIAN_STRUCTURAL_VIOLATION',
            `SQL structural violation detected: ${violation} is not allowed.`
        );
        this.name = 'GuardianStructuralViolationError';
    }
}
