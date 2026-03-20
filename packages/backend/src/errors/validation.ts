import { AppError } from './app-error.js';

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, details?: { field?: string; expected?: string; received?: string }) {
    super(message, details as Record<string, unknown>);
  }
}
