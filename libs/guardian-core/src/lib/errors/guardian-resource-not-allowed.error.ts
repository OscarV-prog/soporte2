import { GuardianError } from './guardian-error';

export class GuardianResourceNotAllowedError extends GuardianError {
    constructor(public readonly resource: string) {
        super(
            'GUARDIAN_RESOURCE_NOT_ALLOWED',
            `Security violation: Access to resource '${resource}' is not authorized by the security policy.`
        );
        this.name = 'GuardianResourceNotAllowedError';
    }
}
