import { AppError } from './app-error.js';

export class AuthError extends AppError {
  readonly statusCode = 401;
  readonly code = 'AUTH_REQUIRED';

  constructor(message = 'Authentication required') {
    super(message);
  }
}
