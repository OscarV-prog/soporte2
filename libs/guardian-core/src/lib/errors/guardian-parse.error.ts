export class GuardianParseError extends Error {
    constructor(public readonly query: string, public readonly originalError: Error) {
        super(`Failed to parse SQL query: ${originalError?.message || 'Unknown error'}`);
        this.name = 'GuardianParseError';

        // Maintain stack trace in V8
        if ((Error as any).captureStackTrace) {
            (Error as any).captureStackTrace(this, GuardianParseError);
        }
    }
}
