import { GuardianError } from './guardian-error';

export class GuardianInvalidStatementError extends GuardianError {
    constructor(public readonly statementType: string) {
        super(
            'GUARDIAN_INVALID_STATEMENT',
            `Statement type '${statementType}' is not allowed. Only SELECT is permitted.`
        );
        this.name = 'GuardianInvalidStatementError';
    }
}
