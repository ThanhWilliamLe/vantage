import { AppError } from './app-error.js';

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string, details?: { entity?: string; field?: string; value?: string }) {
    super(message, details as Record<string, unknown>);
  }
}
