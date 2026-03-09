import { GuardianError } from './guardian-error';

export class GuardianCompositePrimaryKeyNotSupportedError extends GuardianError {
    constructor(public readonly table: string) {
        super(
            'GUARDIAN_COMPOSITE_PRIMARY_KEY_NOT_SUPPORTED',
            `Security violation: Table '${table}' has a composite Primary Key. Composite PKs are not supported by the Guardian for single-record enforcement.`
        );
        this.name = 'GuardianCompositePrimaryKeyNotSupportedError';
    }
}
