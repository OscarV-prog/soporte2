import { GuardianError } from './guardian-error';

export class GuardianPrimaryKeyViolationError extends GuardianError {
    constructor(public readonly table: string, public readonly column: string) {
        super(
            'GUARDIAN_PRIMARY_KEY_VIOLATION',
            `Security violation: Column '${column}' in table '${table}' is not a Primary Key. Only PK-based filters are allowed.`
        );
        this.name = 'GuardianPrimaryKeyViolationError';
    }
}
