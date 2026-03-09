import { GuardianError } from './guardian-error';

export class GuardianMultipleStatementsError extends GuardianError {
    constructor() {
        super(
            'GUARDIAN_MULTIPLE_STATEMENTS',
            'Multiple SQL statements are not allowed for security reasons.'
        );
        this.name = 'GuardianMultipleStatementsError';
    }
}
